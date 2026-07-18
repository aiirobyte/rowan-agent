import { runAgentLoop } from "./agent-loop";
import { snapshotMessages } from "./loop/state";
import {
  loadSkills as loadSkillsFromFiles,
  readSkillContent,
} from "./harness/skills";
import {
  loadPhases as loadPhasesFromFiles,
  readPhaseContent,
} from "./harness/phases/loader";
import { createExtensionRunner, type ExtensionRunner, type LoadedExtension } from "./extensions";
import { loadExtensionsFromPath } from "./extensions/loader";
import type { LoadExtensionsResult } from "./extensions/types";
import type { BeforePhaseHookResult, AfterPhaseHookResult } from "./extensions";
import { DEFAULT_PHASE_ID, createDefaultPhase } from "./harness/phases/default";
import type { Phase, PhaseContext, PhaseOutput, PhaseRegistry } from "./harness/phases/types";
import { createMessage } from "./types";
import type {
  AgentMessage,
  Skill,
  ModelRef,
  StreamFn,
  BeforeToolCall,
  Tool,
  AfterToolCall,
  RunResult,
  AgentEvent,
  AgentContext,
  AgentEventListener,
  Unsubscribe,
  ToolResult,
  Outcome,
} from "./types";
import type { ModelTranscript } from "./protocol/turn";
import { createId } from "./utils";
import type { AgentId } from "./runtime/domain";
import type { AgentRunControl, StreamAgentOptions } from "./agent";

type AgentExecutionOptions = StreamAgentOptions & {
  sessionId?: string;
  agentId?: AgentId;
  onInput?: (message: AgentMessage) => Promise<void>;
  runtime?: import("./loop/types").AgentRuntimePort;
};

export type RunOptions = Partial<AgentExecutionOptions>;

type RuntimeRunHooks = {
  onSuspend?: (reason?: string) => Promise<void> | void;
};

export type AgentStatus = {
  agentId?: AgentId;
  sessionId?: string;
  context: AgentContext;
  model: ModelRef;
  tools: Tool[];
  initialized: boolean;
  running: boolean;
  currentResult?: RunResult;
  error?: string;
};

export class AgentExecution {
  readonly state: AgentStatus;
  private options: AgentExecutionOptions;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private activeRun?: {
    promise: Promise<RunResult>;
    abortController: AbortController;
    resume?: (messages: AgentMessage[]) => void;
  };
  private extensionRunner?: ExtensionRunner;
  private loadedExtensions?: LoadedExtension[];
  private loadedExtensionsCwd?: string;
  private runtimeRunId?: import("./runtime/domain").AgentRunId;

  get id(): AgentId {
    const agentId = this.state.agentId;
    if (!agentId) throw new Error("Agent has no durable identity.");
    return agentId;
  }

  get sessionId(): string {
    const sessionId = this.state.sessionId;
    if (!sessionId) throw new Error("Agent has no Session.");
    return sessionId;
  }

  static loadSkills(targetPath: string): Promise<AgentContext["skills"]> {
    return loadSkillsFromFiles(targetPath);
  }

  static loadPhases(targetPath: Parameters<typeof loadPhasesFromFiles>[0]): Promise<PhaseRegistry> {
    return loadPhasesFromFiles(targetPath);
  }

  static loadExtensions(targetPath: string): Promise<LoadExtensionsResult> {
    return loadExtensionsFromPath(targetPath);
  }

  constructor(options: AgentExecutionOptions) {
    const context = prepareAgentContext(options.context);
    this.options = {
      ...options,
      context,
    };
    this.state = {
      ...(this.options.agentId ? { agentId: this.options.agentId } : {}),
      ...(this.options.sessionId ? { sessionId: this.options.sessionId } : {}),
      context: prepareAgentContext(context),
      model: this.options.model,
      tools: this.options.context.tools ?? [],
      initialized: false,
      running: false,
    };
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  appendUserMessage(input: string): void {
    this.appendMessage(createMessage("user", input));
  }

  appendMessage(message: AgentMessage): void {
    this.appendMessages([message]);
  }

  appendMessages(messages: AgentMessage[]): void {
    this.setMessages([...this.options.context.messages, ...snapshotMessages(messages)]);
  }

  runWithUserInput(input: string, options?: RunOptions): Promise<RunResult> {
    const activeRun = this.activeRun;
    if (activeRun?.resume) {
      // Resume a paused run: deliver the user message into the loop and return
      // the in-flight run promise (resolves only on route:stop). Do NOT append
      // to this.options.context — the loop pushes delivered messages into its
      // own context, and they flow back here once run() completes.
      activeRun.resume([createMessage("user", input)]);
      return activeRun.promise;
    }
    if (activeRun) {
      return Promise.reject(new Error("Agent is already running."));
    }
    this.appendUserMessage(input);
    return this.run(options);
  }

  runWithMessage(message: AgentMessage, options?: RunOptions, internalHooks: RuntimeRunHooks = {}): Promise<RunResult> {
    const activeRun = this.activeRun;
    if (activeRun?.resume) {
      activeRun.resume([message]);
      return activeRun.promise;
    }
    if (activeRun) {
      return Promise.reject(new Error("Agent is already running."));
    }
    this.appendMessage(message);
    return this.run(options, internalHooks);
  }

  /** Internal Runtime seam: executes one leased Agent Input. */
  async executeAgentInput(input: AgentMessage, runId: import("./runtime/domain").AgentRunId, control: AgentRunControl): Promise<Outcome> {
    this.runtimeRunId = runId;
    const internal: RuntimeRunHooks = { onSuspend: control.suspend };
    try {
      return (await this.runWithMessage(input, undefined, internal)).outcome;
    } finally {
      if (!this.activeRun) this.runtimeRunId = undefined;
    }
  }

  resetInitialization(): void {
    this.state.initialized = false;
  }

  getContext(): AgentContext {
    return prepareAgentContext(this.options.context);
  }

  setContext(context: AgentContext): void {
    const nextContext = prepareAgentContext(context);
    this.options = {
      ...this.options,
      context: nextContext,
    };
    this.state.context = prepareAgentContext(nextContext, this.extensionRunner);
    this.state.tools = this.state.context.tools ?? [];
  }

  updateContext(updater: (context: AgentContext) => AgentContext): void {
    this.setContext(updater(this.getContext()));
  }

  forkContext(overrides: Partial<AgentContext> = {}): AgentContext {
    return prepareAgentContext({
      ...this.getContext(),
      ...overrides,
    });
  }

  getMessages(): AgentMessage[] {
    return snapshotMessages(this.options.context.messages);
  }

  setMessages(messages: AgentMessage[]): void {
    this.setContext({
      ...this.options.context,
      messages: snapshotMessages(messages),
    });
  }

  clearMessages(): void {
    this.setMessages([]);
  }

  getTranscript(): AgentMessage[] {
    return this.getMessages();
  }

  replaceTranscript(messages: AgentMessage[]): void {
    this.setMessages(messages);
  }

  getConfig(): AgentExecutionOptions {
    return this.cloneOptions(this.options);
  }

  setConfig(config: AgentExecutionOptions): void {
    const context = prepareAgentContext(config.context);
    this.options = {
      ...config,
      context,
      ...(config.extensions ? { extensions: config.extensions.slice() } : {}),
    };
    this.state.sessionId = config.sessionId;
    this.state.context = prepareAgentContext(context, this.extensionRunner);
    this.state.model = config.model;
    this.state.tools = this.state.context.tools ?? [];
  }

  updateConfig(updater: (config: AgentExecutionOptions) => AgentExecutionOptions): void {
    this.setConfig(updater(this.getConfig()));
  }

  setSessionId(sessionId: string): void {
    this.options = {
      ...this.options,
      sessionId,
    };
    this.state.sessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.state.sessionId;
  }

  getAgentId(): AgentId | undefined {
    return this.state.agentId;
  }

  /** Internal Runtime hook for associating Tool Calls with the leased Run. */
  getRuntimeRunId(): import("./runtime/domain").AgentRunId | undefined {
    return this.runtimeRunId;
  }

  setModel(model: ModelRef): void {
    this.options = {
      ...this.options,
      model,
    };
    this.state.model = model;
  }

  setTools(tools: Tool[]): void {
    this.setContext({
      ...this.options.context,
      tools: tools.slice(),
    });
  }

  setSkills(skills: Skill[]): void {
    this.setContext({
      ...this.options.context,
      skills: skills.slice(),
    });
  }

  setPhases(phases: PhaseRegistry): void {
    this.setContext({
      ...this.options.context,
      phases: clonePhaseRegistry(phases),
    });
  }

  setCwd(cwd: string): void {
    this.options = {
      ...this.options,
      cwd,
    };
  }

  setStream(stream: StreamFn): void {
    this.options = {
      ...this.options,
      stream,
    };
  }

  getModel(): ModelRef {
    return this.state.model;
  }

  getTools(): Tool[] {
    return this.state.context.tools.slice();
  }

  getSkills(): Skill[] {
    return this.state.context.skills.slice();
  }

  getPhases(): PhaseRegistry | undefined {
    return this.state.context.phases ? clonePhaseRegistry(this.state.context.phases) : undefined;
  }

  getCwd(): string | undefined {
    return this.options.cwd;
  }

  private emitToListeners(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result && typeof result === "object" && "then" in result) {
          const task = Promise.resolve(result)
            .catch((error) => {
              this.listenerErrors.push(error);
            })
            .finally(() => {
              this.pendingListenerTasks.delete(task);
            });
          this.pendingListenerTasks.add(task);
        }
      } catch (error) {
        this.listenerErrors.push(error);
      }
    }
  }

  async flushEvents(): Promise<void> {
    while (this.pendingListenerTasks.size > 0) {
      await Promise.all([...this.pendingListenerTasks]);
    }

    for (const listener of this.listeners) {
      try {
        await listener.flush?.();
      } catch (error) {
        this.listenerErrors.push(error);
      }
    }

    if (this.listenerErrors.length > 0) {
      const [error] = this.listenerErrors;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private processEvents(event: AgentEvent): void {
    // State reducer
    switch (event.type) {
      case "message_start":
        this.state.currentResult = undefined;
        break;
      case "message_end":
        break;
      case "agent_end":
        break;
    }

    // Notify listeners
    this.emitToListeners(event);

    // Dispatch to the Agent-owned extension runner
    this.extensionRunner?.emitAgentEvent(event);
  }

  /**
   * Hook for before_tool_call — called before a tool executes.
   * Extensions can block execution by setting allow=false.
   */
  private async handleBeforeToolCall(tool: Tool, args: unknown): Promise<{ allow: boolean; reason?: string }> {
    const runner = this.extensionRunner;
    if (!runner) return { allow: true };
    return runner.emitBeforeToolCall(tool, args);
  }

  /**
   * Hook for after_tool_call — called after a tool executes.
   * Extensions can mutate the result.
   */
  private async handleAfterToolCall(tool: Tool, result: ToolResult): Promise<ToolResult> {
    const runner = this.extensionRunner;
    if (!runner) return result;
    return runner.emitAfterToolCall(tool, result);
  }

  /**
   * Hook for before_phase — called before a phase executes.
   * Extensions can abort, skip, or replace the phase input.
   */
  private async handleBeforePhase(phaseId: string, input: PhaseContext): Promise<BeforePhaseHookResult> {
    const runner = this.extensionRunner;
    if (!runner) return {};
    return runner.emitBeforePhase(phaseId, input);
  }

  /**
   * Hook for after_phase — called after a phase executes.
   * Extensions can abort, retry, or replace the output.
   */
  private async handleAfterPhase(phaseId: string, output: PhaseOutput): Promise<AfterPhaseHookResult> {
    const runner = this.extensionRunner;
    if (!runner) return {};
    return runner.emitAfterPhase(phaseId, output);
  }

  /**
   * Hook for before_prompt — called before model request, allowing extensions to transform PhaseContext.
   * Extensions can transform the PhaseContext (messages, tools, systemPrompt, etc.).
   */
  private async handleBeforePrompt(phaseId: string, input: PhaseContext): Promise<PhaseContext> {
    const runner = this.extensionRunner;
    if (!runner) return input;
    return runner.emitBeforePrompt(phaseId, input);
  }

  private handleRunFailure(error: unknown, aborted: boolean): void {
    const message = error instanceof Error ? error.message : "Agent run failed.";
    this.state.error = message;
    // turn_end and agent_end are handled by runAgentLoop's phase turn() and finally block.
  }

  private runWithLifecycle(
    executor: (input: { signal: AbortSignal; waitForInput: () => Promise<AgentMessage[]> }) => Promise<RunResult>,
    hooks: RuntimeRunHooks = {},
  ): Promise<RunResult> {
    if (this.activeRun) {
      return Promise.reject(new Error("Agent is already running."));
    }

    const abortController = new AbortController();
    let suspensionRequested = false;
    const waitForInput = () => {
      if (!suspensionRequested) {
        suspensionRequested = true;
        void hooks.onSuspend?.("Agent requested input.");
      }
      return new Promise<AgentMessage[]>((resolve) => {
        const activeRun = this.activeRun!;
        activeRun.resume = (messages) => {
          activeRun.resume = undefined;
          resolve(messages);
        };
      });
    };
    const promise = Promise.resolve()
      .then(() => executor({ signal: abortController.signal, waitForInput }))
      .catch((error) => {
        this.handleRunFailure(error, abortController.signal.aborted);
        throw error;
      })
      .finally(() => {
        this.finishRun();
      });
    this.activeRun = { promise, abortController };
    this.state.running = true;
    return promise;
  }

  private finishRun(): void {
    this.state.running = false;
    this.activeRun = undefined;
  }

  private async loadExtensions(extensions: LoadedExtension[], cwd?: string): Promise<void> {
    if (extensions.length === 0) {
      this.extensionRunner?.invalidate();
      this.extensionRunner = undefined;
      this.loadedExtensions = extensions;
      this.loadedExtensionsCwd = cwd;
      return;
    }

    if (this.extensionRunner && this.loadedExtensions === extensions && this.loadedExtensionsCwd === cwd) {
      return;
    }

    const runner = createExtensionRunner({ cwd });
    await runner.loadExtensions(extensions);
    runner.bind();
    this.extensionRunner?.invalidate();
    this.extensionRunner = runner;
    this.loadedExtensions = extensions;
    this.loadedExtensionsCwd = cwd;
  }

  run(config?: RunOptions, internalHooks: RuntimeRunHooks = {}): Promise<RunResult> {
    return this.runWithLifecycle(async ({ signal, waitForInput }) => {
      const resolved = this.resolveRunConfig(config);
      const extensions = resolved.extensions ?? [];
      await this.loadExtensions(extensions, resolved.cwd);
      const runContext = prepareAgentContext(resolved.context, this.extensionRunner);
      const entryPhaseId = this.state.initialized ? DEFAULT_PHASE_ID : runContext.phases?.entryPhaseId ?? DEFAULT_PHASE_ID;
      const loopContext = {
        ...runContext,
        phases: {
          ...runContext.phases!,
          entryPhaseId,
        },
      };
      const sessionId = resolved.sessionId ?? this.state.sessionId;
      this.options = resolved;
      if (sessionId) {
        this.state.sessionId = sessionId;
      }
      this.state.context = runContext;
      this.state.model = resolved.model;
      this.state.tools = runContext.tools ?? [];
      this.state.currentResult = undefined;
      this.state.error = undefined;

      const emit = (event: AgentEvent) => {
        this.processEvents(event);
      };

      // Combine user-provided hooks with extension hooks
      const beforeToolCall: BeforeToolCall = async (input) => {
        // User-provided hook first
        if (resolved.beforeToolCall) {
          const userResult = await resolved.beforeToolCall(input);
          if (!userResult.allow) return userResult;
        }
        // Extension hooks
        const extResult = await this.handleBeforeToolCall(input.tool, input.args);
        if (!extResult.allow) {
          return { allow: false, reason: extResult.reason ?? "Blocked by extension" };
        }
        return { allow: true };
      };

      const afterToolCall: AfterToolCall = async (input) => {
        let result = input.result;
        // User-provided hook first
        if (resolved.afterToolCall) {
          result = await resolved.afterToolCall({ tool: input.tool, result });
        }
        // Extension hooks
        return this.handleAfterToolCall(input.tool, result);
      };

      const result = await runAgentLoop({
        context: loopContext,
        sessionId: sessionId ?? createId("ses"),
        model: resolved.model,
        stream: resolved.stream,
        maxAttempts: resolved.maxAttempts,
        signal,
        beforeToolCall,
        afterToolCall,
        beforePhase: (phaseId: string, input: PhaseContext) => this.handleBeforePhase(phaseId, input),
        afterPhase: (phaseId: string, output: PhaseOutput) => this.handleAfterPhase(phaseId, output),
        beforePrompt: (phaseId: string, input: PhaseContext) => this.handleBeforePrompt(phaseId, input),
        emit,
        onMessage: resolved.onMessage,
        onOutcome: resolved.onOutcome,
        onModelTranscript: resolved.onModelTranscript,
        waitForInput,
        runtime: resolved.runtime,
      });

      const nextContext = {
        ...prepareAgentContext(resolved.context),
        messages: snapshotMessages(result.messages),
      };
      this.state.sessionId = result.sessionId;
      this.state.context = prepareAgentContext(nextContext, this.extensionRunner);
      this.state.currentResult = result;
      this.state.initialized = true;
      this.options = {
        ...resolved,
        sessionId: result.sessionId,
        context: nextContext,
      };
      return result;
    }, internalHooks);
  }

  abort(reason = "Aborted by caller."): void {
    this.abortLocal(reason);
  }

  private abortLocal(reason: string): void {
    const activeRun = this.activeRun;
    // Release a paused loop so it wakes and observes the abort signal.
    activeRun?.resume?.([]);
    activeRun?.abortController.abort(reason);
  }

  /** Internal Runtime hook; public callers abort a precise AgentRun. */
  abortFromRuntime(reason = "Agent Runtime aborted the Run."): void {
    this.abortLocal(reason);
  }

  /**
   * Get formatted skill content for LLM consumption.
   *
   * Finds the skill by name and returns the formatted content using `formatSkillInvocation`.
   * This is a programmatic API for developers to invoke skills directly.
   *
   * @param name - The skill name to look up
   * @param additionalInstructions - Optional additional instructions to append
   * @returns Formatted skill content string
   */
  skill(name: string, additionalInstructions?: string): string {
    const skill = this.state.context.skills.find(s => s.name === name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    const content = readSkillContent(skill);
    return additionalInstructions ? `${content}\n\n${additionalInstructions}` : content;
  }

  /**
   * Get formatted phase content for LLM consumption.
   *
   * Finds the phase by name and returns the formatted content.
   * This is a programmatic API for developers to invoke phases directly.
   *
   * @param name - The phase name to look up
   * @returns Formatted phase content string, or empty string if not found
   */
  async phase(name: string): Promise<string> {
    await this.loadExtensions(this.options.extensions ?? [], this.options.cwd);
    const registry = prepareAgentContext(this.options.context, this.extensionRunner).phases?.phases;
    const phase = registry?.get(name) ?? [...(registry?.values() ?? [])].find((candidate) => candidate.name === name);
    return phase ? readPhaseContent(phase) : "";
  }

  async waitForIdle(): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    await this.activeRun.promise.catch(() => undefined);
    await this.flushEvents().catch(() => undefined);
  }

  private resolveRunConfig(config?: RunOptions): AgentExecutionOptions {
    const merged = {
      ...this.options,
      ...config,
    };
    const context = prepareAgentContext(config?.context ?? this.createContextSnapshot());
    return {
      ...merged,
      context,
      sessionId: config?.sessionId ?? this.state.sessionId ?? this.options.sessionId,
    };
  }

  private createContextSnapshot(): AgentContext {
    return prepareAgentContext(this.options.context);
  }

  private cloneOptions(options: StreamAgentOptions): StreamAgentOptions {
    return {
      ...options,
      context: prepareAgentContext(options.context),
      ...(options.extensions ? { extensions: options.extensions.slice() } : {}),
    };
  }

}

function clonePhaseRegistry(registry: PhaseRegistry): PhaseRegistry {
  return {
    phases: new Map(registry.phases),
    entryPhaseId: registry.entryPhaseId,
  };
}

function prepareAgentContext(context: AgentContext, extensionRunner?: ExtensionRunner): AgentContext {
  const phases = new Map<string, Phase>();
  phases.set(DEFAULT_PHASE_ID, createDefaultPhase());
  for (const [id, phase] of context.phases?.phases ?? []) {
    phases.set(id, phase);
  }
  const extensionRegistry = extensionRunner?.createPhaseRegistry();
  for (const [id, phase] of extensionRegistry?.phases ?? []) {
    phases.set(id, phase);
  }

  return {
    systemPrompt: context.systemPrompt,
    messages: snapshotMessages(context.messages),
    tools: context.tools.slice(),
    skills: context.skills.slice(),
    phases: {
      phases,
      entryPhaseId: extensionRegistry?.entryPhaseId ?? context.phases?.entryPhaseId ?? DEFAULT_PHASE_ID,
    },
  };
}
