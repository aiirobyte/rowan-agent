/**
 * Extension runner — manages extension loading and hook execution.
 *
 * Architecture reference: PI's ExtensionRunner
 * - Per-extension tracking via Extension objects
 * - Shared ExtensionRuntime with invalidate/assertActive
 * - Direct `on()` API for hook registration
 * - Error listener pattern for structured error handling
 * - Tool registration support
 */

import { execFile } from "node:child_process";
import type { ProviderConfig } from "@rowan-agent/models";
import {
  registerModel,
  unregisterProviderModels,
  registerApiProvider,
} from "@rowan-agent/models";
import type {
  ExecOptions,
  ExecResult,
  Extension,
  ExtensionError,
  ExtensionErrorListener,
  ExtensionRuntime,
  PhaseRegistration,
  PhaseDefinition,
  RegisteredPhase,
  RegisteredTool,
  ToolDefinition,
} from "./types";
import { createExtension, createExtensionRuntime } from "./types";
import { parseModelRef } from "@rowan-agent/models";
import type { Tool, ToolResult, AgentContext } from "../types";
import type { Phase, PhaseContext, PhaseOutput, PhaseRegistry } from "../harness/phases/types";
import {
  validateDescription,
  validatePhaseTarget,
  validateResourceId,
  validateResourceName,
  validateSkillReferences,
  warnResourceDiagnostics,
} from "../harness/resource-validation";
import { HooksManager } from "./hooks";
import type {
  HookEventType,
  HookHandler,
  HookResultMap,
} from "./hooks";
import {
  type ExtensionAPI,
  createExtensionAPI,
} from "./api";
import type { ExtensionContext } from "./context";
import type { LoadedExtension, ExtensionManifest } from "./types";
import { createSourceInfo } from "./types";
import { createEventBus, type EventBus } from "./context";

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options?.cwd ?? cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        timeout: options?.timeout,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && error.killed && options?.signal?.aborted) {
          reject(new Error("Command was aborted"));
          return;
        }
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );

    if (options?.signal) {
      options.signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
        },
        { once: true },
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Provider registration helpers
// ---------------------------------------------------------------------------

function applyProviderRegistration(config: ProviderConfig): void {
  if (config.streamSimple) {
    registerApiProvider({ protocol: config.protocol, stream: config.streamSimple });
  }
  for (const modelConfig of config.models) {
    registerModel({
      id: modelConfig.id,
      name: modelConfig.name,
      protocol: config.protocol,
      provider: config.id,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      reasoning: modelConfig.reasoning,
      input: modelConfig.input,
      cost: modelConfig.cost,
      contextWindow: modelConfig.contextWindow,
      maxTokens: modelConfig.maxTokens,
      ...(config.headers ? { headers: config.headers } : {}),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      ...(config.retryDelayMs !== undefined ? { retryDelayMs: config.retryDelayMs } : {}),
    });
  }
}

function applyProviderUnregistration(name: string): void {
  unregisterProviderModels(name);
}

// ---------------------------------------------------------------------------
// ExtensionRunner
// ---------------------------------------------------------------------------

export type ExtensionRunnerOptions = {
  entryPhaseId?: string | null;
  cwd?: string;
};

/**
 * Manages extensions and provides hooks for the agent loop.
 *
 * Features:
 * - Per-extension tracking (handlers, tools, phases)
 * - Shared runtime with lifecycle protection (invalidate/assertActive)
 * - Error listener pattern for structured error handling
 * - Direct hook API and extension-loaded hook API
 * - Tool registration for LLM-callable tools
 * - EventBus for inter-extension communication
 *
 * @example
 * ```ts
 * const runner = createExtensionRunner();
 *
 * // Direct hook registration
 * const unsub = runner.on("before_tool_call", (event) => {
 *   return { allow: false, reason: "Blocked" };
 * });
 *
 * // Error handling
 * runner.onError((error) => {
 *   console.error(`Extension error in ${error.extensionPath}:`, error.error);
 * });
 *
 * // Load extensions
 * await runner.loadExtensions(extensions);
 * runner.bind();
 * ```
 */
export class ExtensionRunner {
  readonly hooks: HooksManager;
  readonly runtime: ExtensionRuntime;
  readonly events: EventBus;

  private readonly cwd: string;
  private readonly abortController = new AbortController();
  private _idle = true;

  // Per-extension tracking
  private readonly extensions: Extension[] = [];

  // Phase management
  private readonly phases = new Map<string, RegisteredPhase>();
  private _phaseCache: Map<string, RegisteredPhase> | null = null;

  // Provider management
  private readonly pendingProviders: Array<
    | { kind: "register"; config: ProviderConfig }
    | { kind: "unregister"; name: string }
  > = [];
  private bound = false;

  // Error listeners
  private readonly errorListeners = new Set<ExtensionErrorListener>();

  // Loaded extension metadata (pre-initialization form)
  private readonly loadedExtensions: LoadedExtension[] = [];

  /** Current agent context — set by the agent before each phase */
  currentContext?: AgentContext;

  constructor(options?: ExtensionRunnerOptions) {
    this.hooks = new HooksManager();
    this.runtime = createExtensionRuntime();
    this.events = createEventBus();
    this.cwd = options?.cwd ?? process.cwd();
  }

  /** Whether the agent is currently idle (not streaming). */
  get isIdle(): boolean {
    return this._idle;
  }

  /** Set idle state — called by the agent loop. */
  setIdle(idle: boolean): void {
    this._idle = idle;
  }

  /** Abort signal for the current runner instance. */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Abort the current runner operation. */
  abort(): void {
    this.abortController.abort();
  }

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  /**
   * Register an error listener.
   * Returns an unsubscribe function.
   */
  onError(listener: ExtensionErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Emit a structured extension error to all listeners.
   */
  emitError(error: ExtensionError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error("[extension-runner] Error listener failed:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle: invalidate / assertActive
  // ---------------------------------------------------------------------------

  /**
   * Mark all extension contexts as stale.
   * After calling this, any captured ExtensionAPI or ExtensionContext will throw
   * on use. Used during session replacement or reload.
   */
  invalidate(
    message?: string,
  ): void {
    this.runtime.invalidate(message);
  }

  // ---------------------------------------------------------------------------
  // Direct hook API
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to a specific hook event type.
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsub = runner.on("before_tool_call", (event) => {
   *   return { allow: false, reason: "Blocked" };
   * });
   * unsub(); // Cancel subscription
   * ```
   */
  on<K extends HookEventType>(
    type: K,
    handler: HookHandler<K>,
  ): () => void {
    this.hooks.on(type, handler);
    return () => this.hooks.off(type, handler);
  }

  /**
   * Subscribe to all events (read-only).
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsub = runner.subscribe((event) => {
   *   console.log(event.type);
   * });
   * ```
   */
  subscribe(
    listener: (event: { type: HookEventType }) => void,
  ): () => void {
    const handlers = new Map<HookEventType, Function>();

    for (const eventType of this.getAllEventTypes()) {
      const handler = (event: any) => listener(event);
      handlers.set(eventType, handler);
      this.hooks.on(eventType, handler as any);
    }

    return () => {
      for (const [eventType, handler] of handlers) {
        this.hooks.off(eventType, handler as any);
      }
    };
  }

  private getAllEventTypes(): HookEventType[] {
    return [
      "before_phase", "after_phase", "before_prompt",
      "before_tool_call", "after_tool_call",
      "agent_start", "agent_end",
      "turn_start", "turn_end",
      "message_start", "message_update", "message_end",
      "tool_execution_start", "tool_execution_update", "tool_execution_end",
      "queue_update", "save_point", "abort", "settled",
    ];
  }

  // ---------------------------------------------------------------------------
  // Extension loading
  // ---------------------------------------------------------------------------

  /**
   * Load and initialize extensions.
   * Creates Extension tracking objects and calls each factory with an ExtensionAPI.
   */
  async loadExtensions(extensions: LoadedExtension[]): Promise<void> {
    for (const ext of extensions) {
      try {
        const sourceInfo = createSourceInfo(ext.path, {
          source: "local",
          baseDir: ext.path.startsWith("<") ? undefined : ext.path,
        });
        const extension = createExtension(ext.path, sourceInfo);

        const api = this.createExtensionAPI(extension, ext.manifest);
        await ext.factory(api);

        this.extensions.push(extension);
        this.loadedExtensions.push(ext);
        this._phaseCache = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitError({
          extensionPath: ext.path,
          event: "load",
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tool management
  // ---------------------------------------------------------------------------

  /**
   * Get all registered tools from all extensions (first registration per name wins).
   */
  getAllRegisteredTools(): RegisteredTool[] {
    const toolsByName = new Map<string, RegisteredTool>();
    for (const ext of this.extensions) {
      for (const tool of ext.tools.values()) {
        if (!toolsByName.has(tool.definition.name)) {
          toolsByName.set(tool.definition.name, tool);
        }
      }
    }
    return Array.from(toolsByName.values());
  }

  /**
   * Get a tool definition by name. Returns undefined if not found.
   */
  getToolDefinition(toolName: string): RegisteredTool["definition"] | undefined {
    for (const ext of this.extensions) {
      const tool = ext.tools.get(toolName);
      if (tool) return tool.definition;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Handler queries
  // ---------------------------------------------------------------------------

  /**
   * Check if there are handlers registered for specified event type.
   */
  hasHandlers(eventType: HookEventType): boolean {
    return this.hooks.has(eventType);
  }

  /**
   * Get the number of handlers for specified event type.
   */
  handlerCount(eventType: HookEventType): number {
    return this.hooks.count(eventType);
  }

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  getPhase(name: string): Phase | undefined {
    const reg = this.getRegisteredPhase(name);
    if (!reg) return undefined;
    return this.adaptToPhase(reg);
  }

  getPhases(): Phase[] {
    return [...this.collectRegisteredPhases().values()].map(
      (p) => this.adaptToPhase(p),
    );
  }

  createPhaseRegistry(
    input: { entryPhaseId?: string | null } = {},
  ): PhaseRegistry {
    const registered = this.collectRegisteredPhases();
    const phases = new Map<string, Phase>();
    for (const [name, reg] of registered) {
      phases.set(name, this.adaptToPhase(reg));
    }
    // Default to null (start from "none") unless explicitly provided
    const entryPhaseId = input.entryPhaseId ?? null;
    return { phases, entryPhaseId };
  }

  /** Adapt an extension RegisteredPhase to the core Phase type. */
  private adaptToPhase(reg: RegisteredPhase): Phase {
    const def = reg.definition;
    return {
      name: def.name,
      description: def.description,
      tools: def.tools,
      skills: def.skills,
      target: def.target,
      input: def.input,
      run: def.run as Phase["run"],
      filePath: "",
      baseDir: "",
      content: "",
      ...(def.model ? { model: parseModelRef(def.model) } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Bind the runner — flushes pending provider registrations and
   * replaces runtime stubs with real implementations.
   */
  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.flushPendingProviders();

    // Replace runtime provider registration with direct calls
    this.runtime.registerProvider = (_name, config) => {
      applyProviderRegistration(config);
    };
    this.runtime.unregisterProvider = (_name) => {
      applyProviderUnregistration(_name);
    };
  }

  // ---------------------------------------------------------------------------
  // Unified hook emission
  // ---------------------------------------------------------------------------

  /**
   * Generic emit — fire-and-forget for any event type.
   */
  async emit<K extends HookEventType>(
    eventType: K,
    event: Parameters<HookHandler<K>>[0],
  ): Promise<void> {
    await this.hooks.emit(eventType, event as any);
  }

  /**
   * Unified hook emission — returns the first non-undefined result.
   */
  private async emitHook<K extends HookEventType>(
    type: K,
    event: Parameters<HookHandler<K>>[0],
  ): Promise<HookResultMap[K] | undefined> {
    return this.hooks.emitFirst(type, event as any);
  }

  // ---------------------------------------------------------------------------
  // Phase hooks (with inline processing)
  // ---------------------------------------------------------------------------

  async emitBeforePhase(
    phaseId: string,
    input: PhaseContext,
  ): Promise<{ abort?: any; skip?: any; input?: PhaseContext }> {
    const result = await this.emitHook("before_phase", {
      type: "before_phase",
      phaseId,
      input,
    });
    return result ?? {};
  }

  async emitAfterPhase(
    phaseId: string,
    output: PhaseOutput,
  ): Promise<{ abort?: any; retry?: PhaseContext; output?: PhaseOutput }> {
    const result = await this.emitHook("after_phase", {
      type: "after_phase",
      phaseId,
      output,
    });
    return result ?? {};
  }

  async emitBeforePrompt(
    phaseId: string,
    input: PhaseContext,
  ): Promise<PhaseContext> {
    const result = await this.emitHook("before_prompt", {
      type: "before_prompt",
      phaseId,
      input,
    });
    return result?.input ?? input;
  }

  async emitBeforeToolCall(
    tool: Tool,
    args: unknown,
  ): Promise<{ allow: boolean; reason?: string }> {
    const result = await this.emitHook("before_tool_call", {
      type: "before_tool_call",
      tool,
      args,
    });
    return result ?? { allow: true };
  }

  async emitAfterToolCall(
    tool: Tool,
    result: ToolResult,
  ): Promise<ToolResult> {
    const hookResult = await this.emitHook("after_tool_call", {
      type: "after_tool_call",
      tool,
      result,
    });
    return hookResult?.result ?? result;
  }

  // ---------------------------------------------------------------------------
  // Agent event hooks (fire-and-forget)
  // ---------------------------------------------------------------------------

  async emitAgentStart(sessionId: string): Promise<void> {
    await this.hooks.emit("agent_start", { type: "agent_start", sessionId });
  }

  async emitAgentEnd(sessionId: string, outcome: any, messages: any[]): Promise<void> {
    await this.hooks.emit("agent_end", { type: "agent_end", sessionId, outcome, messages });
  }

  async emitTurnStart(messages: any[]): Promise<void> {
    await this.hooks.emit("turn_start", { type: "turn_start", messages });
  }

  async emitTurnEnd(messages: any[], outcome?: any): Promise<void> {
    await this.hooks.emit("turn_end", { type: "turn_end", messages, outcome });
  }

  async emitMessageStart(message: any): Promise<void> {
    await this.hooks.emit("message_start", { type: "message_start", message });
  }

  async emitMessageUpdate(message: any, delta: string): Promise<void> {
    await this.hooks.emit("message_update", { type: "message_update", message, delta });
  }

  async emitMessageEnd(message: any): Promise<void> {
    await this.hooks.emit("message_end", { type: "message_end", message });
  }

  async emitToolExecutionStart(toolCallId: string, toolName: string, args: unknown): Promise<void> {
    await this.hooks.emit("tool_execution_start", {
      type: "tool_execution_start",
      toolCallId,
      toolName,
      args,
    });
  }

  async emitToolExecutionUpdate(toolCallId: string, toolName: string, _progress?: string): Promise<void> {
    await this.hooks.emit("tool_execution_update", {
      type: "tool_execution_update",
      toolCallId,
      toolName,
    });
  }

  async emitToolExecutionEnd(toolCallId: string, toolName: string, result: ToolResult): Promise<void> {
    await this.hooks.emit("tool_execution_end", {
      type: "tool_execution_end",
      toolCallId,
      toolName,
      result,
    });
  }

  async emitSavePoint(hadPendingMutations: boolean): Promise<void> {
    await this.hooks.emit("save_point", { type: "save_point", hadPendingMutations });
  }

  async emitAbort(reason?: string): Promise<void> {
    await this.hooks.emit("abort", { type: "abort", reason });
  }

  async emitSettled(): Promise<void> {
    await this.hooks.emit("settled", { type: "settled" });
  }

  // ---------------------------------------------------------------------------
  // AgentEvent bridge (backward compatibility)
  // ---------------------------------------------------------------------------

  /**
   * Emit an AgentEvent by routing to the appropriate typed hook.
   */
  async emitAgentEvent(event: any): Promise<void> {
    switch (event.type) {
      case "agent_start":
        await this.emitAgentStart(event.sessionId);
        break;
      case "agent_end":
        await this.emitAgentEnd(event.sessionId, event.outcome, event.messages);
        break;
      case "turn_start":
        await this.emitTurnStart(event.messages);
        break;
      case "turn_end":
        await this.emitTurnEnd(event.messages, event.outcome);
        break;
      case "message_start":
        await this.emitMessageStart(event.message);
        break;
      case "message_update":
        await this.emitMessageUpdate(event.message, event.delta);
        break;
      case "message_end":
        await this.emitMessageEnd(event.message);
        break;
      case "tool_execution_start":
        await this.emitToolExecutionStart(event.toolCallId, event.toolName, event.args);
        break;
      case "tool_execution_update":
        await this.emitToolExecutionUpdate(event.toolCallId, event.toolName);
        break;
      case "tool_execution_end":
        await this.emitToolExecutionEnd(event.toolCallId, event.toolName, event.result);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Create an ExtensionAPI for a specific extension.
   * Registration methods write to the extension tracking object.
   * Action methods delegate to the shared runtime.
   */
  private createExtensionAPI(extension: Extension, manifest?: ExtensionManifest): ExtensionAPI {
    const runner = this;
    const extContext: ExtensionContext = {
      get cwd() { return runner.cwd; },
      get signal() { return runner.abortController.signal; },
      isIdle() { return runner._idle; },
      abort() { runner.abortController.abort(); },
      exec(command, args, options) {
        return execCommand(command, args, runner.cwd, options);
      },
      manifest,
      getSystemPrompt() { return runner.currentContext?.systemPrompt ?? ""; },
      setSystemPrompt(prompt) { if (runner.currentContext) runner.currentContext.systemPrompt = prompt; },
      getMessages() { return (runner.currentContext?.messages ?? []) as Array<{ role: string; content: string }>; },
      addMessage(role, content) { runner.currentContext?.messages.push({ role, content } as any); },
      getAvailableTools() { return (runner.currentContext?.tools ?? []).map(t => ({ name: t.name, description: t.description })); },
      getAvailableSkills() { return (runner.currentContext?.skills ?? []).map(s => ({ name: s.name, description: s.description })); },
      getSkillContent(skillName) {
        const skill = runner.currentContext?.skills.find(s => s.name === skillName);
        return skill?.content ?? "";
      },
      getAvailablePhases() { return [...runner.phases.keys()]; },
      getPhaseContent(phaseId) { return runner.phases.get(phaseId)?.definition.description ?? ""; },
    };

    return createExtensionAPI(this.hooks, extension.path, {
      registerPhase: (registration) =>
        this.registerPhase(extension, registration),
      registerProvider: (config) => this.registerProvider(config),
      unregisterProvider: (name) => this.unregisterProvider(name),
      registerTool: (tool) => this.registerTool(extension, tool),
      context: extContext,
      manifest,
    }, this.runtime, this.events);
  }

  private registerTool(extension: Extension, tool: ToolDefinition): void {
    // Check for duplicate tool names across extensions
    for (const ext of this.extensions) {
      if (ext.tools.has(tool.name)) {
        this.emitError({
          extensionPath: extension.path,
          event: "register_tool",
          error: `Tool "${tool.name}" is already registered by extension ${ext.path}`,
        });
        return;
      }
    }

    const sourceInfo = createSourceInfo(extension.path);
    extension.tools.set(tool.name, {
      definition: tool,
      sourceInfo,
    });
  }

  private registerPhase(
    extension: Extension,
    registration: PhaseRegistration,
  ): void {
    if (typeof registration.name !== "string" || registration.name.length === 0) {
      throw new Error(`Phase registration requires a "name" field.`);
    }

    const name = registration.name;
    const description = validateDescription(registration.description);
    const errors = validateResourceId(name, "name");
    if (description.missing) errors.push(...description.warnings);
    errors.push(...validateSkillReferences(registration.skills));
    errors.push(...validatePhaseTarget(registration.target));

    if (errors.length > 0) {
      throw new Error(`Invalid phase registration "${name}": ${errors.join("; ")}`);
    }
    if (description.warnings.length > 0) {
      warnResourceDiagnostics("phase", `extension ${extension.path}`, description.warnings);
    }

    if (this.phases.has(name)) {
      throw new Error(`Duplicate phase name: ${name}`);
    }

    const definition: PhaseDefinition = {
      name,
      description: description.description!,
      run: registration.run,
      ...(registration.model ? { model: registration.model } : {}),
    };

    const registered: RegisteredPhase = {
      definition,
      source: { extensionPath: extension.path },
    };

    this.phases.set(name, registered);

    // Track in extension object
    extension.phases.set(name, registered);

    this._phaseCache = null;
  }

  private registerProvider(config: ProviderConfig): void {
    if (this.bound) {
      applyProviderRegistration(config);
    } else {
      this.pendingProviders.push({ kind: "register", config });
    }
  }

  private unregisterProvider(name: string): void {
    if (this.bound) {
      applyProviderUnregistration(name);
    } else {
      this.pendingProviders.push({ kind: "unregister", name });
    }
  }

  private flushPendingProviders(): void {
    for (const action of this.pendingProviders) {
      if (action.kind === "register") {
        applyProviderRegistration(action.config);
      } else {
        applyProviderUnregistration(action.name);
      }
    }
    this.pendingProviders.length = 0;
  }

  private getRegisteredPhase(name: string): RegisteredPhase | undefined {
    return this.collectRegisteredPhases().get(name);
  }

  private collectRegisteredPhases(): Map<string, RegisteredPhase> {
    if (this._phaseCache) return this._phaseCache;
    this._phaseCache = new Map(this.phases);
    return this._phaseCache;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createExtensionRunner(
  options?: ExtensionRunnerOptions,
): ExtensionRunner {
  return new ExtensionRunner(options);
}
