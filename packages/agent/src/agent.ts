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
import type {
  AgentMessage,
  LlmModelRef,
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

export type AgentOptions = {
  context: AgentContext;
  model: LlmModelRef;
  stream: StreamFn;
  cwd?: string;
  phases?: PhaseRegistry;
  extensions?: LoadedExtension[];
  sessionId?: string;
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onOutcome?: (outcome: Outcome) => Promise<void>;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: LlmModelRef }) => Promise<void>;
};

export type RunOptions = Partial<AgentOptions>;

export type AgentStatus = {
  sessionId?: string;
  context: AgentContext;
  model: LlmModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentResult?: RunResult;
  error?: string;
};

export class Agent {
  readonly state: AgentStatus;
  private options: AgentOptions;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private activeRun?: { promise: Promise<RunResult>; resolve: (result: RunResult) => void; abortController: AbortController };
  private extensionRunner?: ExtensionRunner;
  private loadedExtensions?: LoadedExtension[];
  private loadedExtensionsCwd?: string;

  static loadSkills(targetPath: string): Promise<AgentContext["skills"]> {
    return loadSkillsFromFiles(targetPath);
  }

  static loadPhases(targetPath: Parameters<typeof loadPhasesFromFiles>[0]): Promise<PhaseRegistry> {
    return loadPhasesFromFiles(targetPath);
  }

  static loadExtensions(targetPath: string): Promise<LoadExtensionsResult> {
    return loadExtensionsFromPath(targetPath);
  }

  constructor(options: AgentOptions) {
    const context = cloneAgentContext({
      ...options.context,
      phases: options.phases ?? options.context.phases,
    });
    this.options = {
      ...options,
      context,
    };
    this.state = {
      ...(this.options.sessionId ? { sessionId: this.options.sessionId } : {}),
      context: cloneAgentContext(context),
      model: this.options.model,
      tools: this.options.context.tools ?? [],
      isRunning: false,
    };
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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

  private async runWithLifecycle(
    executor: (signal: AbortSignal) => Promise<RunResult>,
  ): Promise<RunResult> {
    if (this.activeRun) {
      throw new Error("Agent is already running.");
    }

    let resolvePromise!: (result: RunResult) => void;
    const abortController = new AbortController();
    const promise = new Promise<RunResult>((resolve) => {
      resolvePromise = resolve;
    });
    this.activeRun = { promise, resolve: resolvePromise, abortController };
    this.state.isRunning = true;

    try {
      const result = await executor(abortController.signal);
      resolvePromise(result);
      return result;
    } catch (error) {
      this.handleRunFailure(error, abortController.signal.aborted);
      resolvePromise(undefined as unknown as RunResult);
      throw error;
    } finally {
      this.finishRun();
    }
  }

  private finishRun(): void {
    this.state.isRunning = false;
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

  async run(config?: RunOptions): Promise<RunResult> {
    const resolved = this.resolveRunConfig(config);
    const extensions = resolved.extensions ?? [];
    await this.loadExtensions(extensions, resolved.cwd);
    const runContext = cloneAgentContext(resolved.context, this.extensionRunner);
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

    return this.runWithLifecycle(async (signal) => {
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
        context: runContext,
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
      });

      const nextContext = {
        ...cloneAgentContext(resolved.context),
        messages: snapshotMessages(result.messages),
      };
      this.state.sessionId = result.sessionId;
      this.state.context = cloneAgentContext(nextContext, this.extensionRunner);
      this.state.currentResult = result;
      this.options = {
        ...resolved,
        sessionId: result.sessionId,
        context: nextContext,
      };
      return result;
    });
  }

  abort(reason = "Aborted by caller."): void {
    this.activeRun?.abortController.abort(reason);
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
    const registry = cloneAgentContext(this.options.context, this.extensionRunner).phases?.phases;
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

  private resolveRunConfig(config?: RunOptions): AgentOptions {
    const merged = {
      ...this.options,
      ...config,
    };
    const context = cloneAgentContext({
      ...(config?.context ?? this.createContextSnapshot()),
      phases: merged.phases ?? config?.context?.phases ?? this.options.context.phases,
    });
    return {
      ...merged,
      context,
      sessionId: config?.sessionId ?? this.state.sessionId ?? this.options.sessionId,
    };
  }

  private createContextSnapshot(): AgentContext {
    return cloneAgentContext(this.options.context);
  }

}

function cloneAgentContext(context: AgentContext, extensionRunner?: ExtensionRunner): AgentContext {
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
