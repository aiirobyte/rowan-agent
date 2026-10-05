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
import { dirname, resolve } from "node:path";
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
  ExtensionCapability,
  ExtensionCapabilityContribution,
  UiContribution,
  ExtensionError,
  ExtensionErrorListener,
  ExtensionHost,
  ExtensionRuntime,
  PhaseRegistration,
  RegisteredPhase,
  RegisteredTool,
  ScopeRef,
  ToolDefinition,
} from "./types";
import { createExtensionRuntime } from "./types";
import { InMemoryExtensionHost, resolveScopeFromMetadata } from "./host";
import type { JsonObject, JsonValue } from "../runtime-events";
import { assertJsonValue } from "../runtime/json";
import type { Tool, ToolResult, AgentContext } from "../types";
import type { Phase, PhaseContext, PhaseOutput, PhaseRegistry } from "../harness/phases/types";
import { HooksManager } from "./hooks";
import type {
  BeforeToolCallResult,
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
import { loadPhase } from "../harness/phases/loader";

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
  unregisterProviderModels(config.id);
  if (config.stream) {
    registerApiProvider({ protocol: config.protocol, stream: config.stream });
  }
  for (const modelConfig of config.models) {
    registerModel({
      id: modelConfig.id,
      name: modelConfig.name,
      protocol: config.protocol,
      provider: config.id,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      reasoning: modelConfig.reasoning ?? false,
      ...(modelConfig.thinkingLevel !== undefined ? { thinkingLevel: modelConfig.thinkingLevel } : {}),
      ...(modelConfig.thinkingLevels !== undefined ? { thinkingLevels: modelConfig.thinkingLevels } : {}),
      input: modelConfig.input ?? ["text"],
      cost: modelConfig.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: modelConfig.contextWindow ?? 128_000,
      maxTokens: modelConfig.maxTokens ?? 4096,
      ...(config.headers || modelConfig.headers
        ? { headers: { ...config.headers, ...modelConfig.headers } }
        : {}),
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
  host?: ExtensionHost;
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
  readonly host: ExtensionHost;

  private readonly cwd: string;
  private readonly abortController = new AbortController();
  private _idle = true;

  // Per-extension tracking
  private readonly extensions: Extension[] = [];

  // Run state: runId -> extensionId -> key -> value
  private readonly runState = new Map<string, Map<string, Map<string, JsonValue>>>();

  // Config change listeners: extensionId -> Set of handlers
  private readonly configChangeListeners = new Map<string, Set<(scope: ScopeRef) => void>>();
  private readonly hostUnsubscribers: Array<() => void> = [];

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

  // Capability change listeners
  private readonly capabilityListeners = new Set<(capabilities: readonly ExtensionCapability[]) => void>();

  // UI contribution change listeners
  private readonly uiContributionListeners = new Set<(contributions: readonly UiContribution[]) => void>();

  /** Current agent context — set by the agent before each phase */
  currentContext?: AgentContext;

  constructor(options?: ExtensionRunnerOptions) {
    this.hooks = new HooksManager();
    this.runtime = createExtensionRuntime();
    this.events = createEventBus();
    this.cwd = options?.cwd ?? process.cwd();
    this.host = options?.host ?? new InMemoryExtensionHost();

    if (this.host.onConfigChanged) {
      const unsub = this.host.onConfigChanged((extensionId, scope) => {
        this.notifyConfigChanged(extensionId, scope);
      });
      if (typeof unsub === "function") {
        this.hostUnsubscribers.push(unsub);
      }
    }
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
   * on use. Used during runtime replacement or reload.
   */
  invalidate(
    message?: string,
  ): void {
    this.runtime.invalidate(message);
    for (const extension of this.extensions) extension.runtime.invalidate(message);
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

  // ---------------------------------------------------------------------------
  // Extension loading
  // ---------------------------------------------------------------------------

  /**
   * Load and initialize extensions.
   * Creates Extension tracking objects and calls each factory with an ExtensionAPI.
   */
  async loadExtensions(extensions: LoadedExtension[]): Promise<void> {
    for (const ext of extensions) {
      const extensionId = ext.id ?? ext.manifest?.id ?? ext.name;
      const extension: Extension = {
        id: extensionId,
        path: ext.path,
        tools: new Map(),
        phases: new Set(),
        capabilities: new Map(),
        uiContributions: new Map(),
        cleanup: [],
        runtime: createExtensionRuntime(),
      };
      try {
        const api = this.createExtensionAPI(extension, ext.manifest);
        const disposer = await ext.factory(api);
        if (typeof disposer === "function") extension.disposer = disposer;

        this.extensions.push(extension);
        this._phaseCache = null;
        if (extension.capabilities.size > 0) {
          this.notifyCapabilitiesChanged();
        }
        if (extension.uiContributions.size > 0) {
          this.notifyUiContributionsChanged();
        }
      } catch (error) {
        await this.rollbackExtension(extension);
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

  /** Dispose all active Extensions in reverse activation order. */
  async close(): Promise<void> {
    this.abortController.abort();
    for (const unsub of this.hostUnsubscribers) {
      try { unsub(); } catch {}
    }
    this.hostUnsubscribers.length = 0;
    this.configChangeListeners.clear();
    this.runState.clear();
    for (const extension of [...this.extensions].reverse()) {
      await this.disposeExtension(extension, "This Extension Runtime has been closed.");
    }
    this.extensions.length = 0;
    this.capabilityListeners.clear();
    this.phases.clear();
    this._phaseCache = null;
    this.runtime.invalidate("This Extension Runtime has been closed.");
  }

  get extensionHost(): ExtensionHost {
    return this.host;
  }

  notifyConfigChanged(extensionId: string, scope: ScopeRef): void {
    const listeners = this.configChangeListeners.get(extensionId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(scope);
      } catch (error) {
        this.emitError({
          extensionPath: "<runtime>",
          event: "config_changed",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  getRunState(runId: string, extensionId: string, key: string): JsonValue | undefined {
    const val = this.runState.get(runId)?.get(extensionId)?.get(key);
    return val !== undefined ? structuredClone(val) : undefined;
  }

  setRunState(runId: string, extensionId: string, key: string, value: JsonValue): void {
    assertJsonValue(value);
    let runMap = this.runState.get(runId);
    if (!runMap) {
      runMap = new Map();
      this.runState.set(runId, runMap);
    }
    let extMap = runMap.get(extensionId);
    if (!extMap) {
      extMap = new Map();
      runMap.set(extensionId, extMap);
    }
    extMap.set(key, structuredClone(value));
  }

  deleteRunState(runId: string, extensionId: string, key: string): void {
    this.runState.get(runId)?.get(extensionId)?.delete(key);
  }

  dropRunState(runId: string): void {
    this.runState.delete(runId);
  }

  // ---------------------------------------------------------------------------
  // Tool management
  // ---------------------------------------------------------------------------

  /** Get all registered tools from all extensions. */
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
  // Capability management
  // ---------------------------------------------------------------------------

  /** Get all contributed capabilities across all extensions. */
  getCapabilities(): readonly ExtensionCapability[] {
    const result: ExtensionCapability[] = [];
    for (const ext of this.extensions) {
      for (const contrib of ext.capabilities.values()) {
        result.push({
          extensionId: ext.id,
          kind: contrib.kind,
          name: contrib.name,
          description: contrib.description,
        });
      }
    }
    return Object.freeze(result);
  }

  /**
   * Subscribe to capability changes (contributions added, removed, or extensions disposed).
   * Returns an unsubscribe function.
   */
  onCapabilitiesChanged(listener: (capabilities: readonly ExtensionCapability[]) => void): () => void {
    this.capabilityListeners.add(listener);
    return () => this.capabilityListeners.delete(listener);
  }

  /** Get all contributed UI elements across all extensions. */
  getUiContributions(): readonly UiContribution[] {
    const result: UiContribution[] = [];
    for (const ext of this.extensions) {
      for (const contrib of ext.uiContributions.values()) {
        result.push(contrib);
      }
    }
    return Object.freeze(result);
  }

  /**
   * Subscribe to UI contribution changes (contributions added, removed, or extensions disposed).
   * Returns an unsubscribe function.
   */
  onUiContributionsChanged(listener: (contributions: readonly UiContribution[]) => void): () => void {
    this.uiContributionListeners.add(listener);
    return () => this.uiContributionListeners.delete(listener);
  }

  triggerUiAction(event: { contributionId: string; actionId: string; scope?: ScopeRef }): void {
    this.events.emit("ui.action", event);
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
      ...def,
      ...(def.tools ? { tools: [...def.tools] } : {}),
      skills: def.skills ? [...def.skills] : [],
      ...(def.input ? { input: { ...def.input } } : {}),
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

  async emitRunStart(event: {
    runId: string;
    agentId: string;
    metadata: Readonly<Record<string, unknown>>;
    turn: JsonObject;
  }): Promise<void> {
    try {
      await this.hooks.emit("run_start", {
        type: "run_start",
        ...event,
      });
    } catch (error) {
      this.emitError({
        extensionPath: "<runtime>",
        event: "run_start",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  async emitRunEnd(event: {
    runId: string;
    agentId: string;
    outcome: unknown;
  }): Promise<void> {
    try {
      await this.hooks.emit("run_end", {
        type: "run_end",
        ...event,
      });
    } catch (error) {
      this.emitError({
        extensionPath: "<runtime>",
        event: "run_end",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  async emitBeforeToolCall(
    tool: Tool,
    args: unknown,
    context?: {
      runId?: string;
      agentId?: string;
      toolCallId?: string;
      metadata?: Readonly<Record<string, unknown>>;
      answer?: unknown;
      scope?: ScopeRef;
      turn?: JsonObject;
    },
  ): Promise<BeforeToolCallResult> {
    const scope = context?.scope ?? resolveScopeFromMetadata(context?.metadata);
    const turn = context?.turn ?? {};
    const result = await this.emitHook("before_tool_call", {
      type: "before_tool_call",
      tool,
      args,
      ...(context?.runId !== undefined ? { runId: context.runId } : {}),
      ...(context?.agentId !== undefined ? { agentId: context.agentId } : {}),
      ...(context?.toolCallId !== undefined ? { toolCallId: context.toolCallId } : {}),
      ...(context?.metadata !== undefined ? { metadata: context.metadata } : {}),
      ...(context?.answer !== undefined ? { answer: context.answer } : {}),
      scope,
      turn,
    });
    return result ?? { allow: true };
  }

  async emitAfterToolCall(
    tool: Tool,
    result: ToolResult,
    context?: {
      runId?: string;
      agentId?: string;
      toolCallId?: string;
      metadata?: Readonly<Record<string, unknown>>;
      scope?: ScopeRef;
      turn?: JsonObject;
    },
  ): Promise<ToolResult> {
    const scope = context?.scope ?? resolveScopeFromMetadata(context?.metadata);
    const turn = context?.turn ?? {};
    const hookResult = await this.emitHook("after_tool_call", {
      type: "after_tool_call",
      tool,
      result,
      ...(context?.runId !== undefined ? { runId: context.runId } : {}),
      ...(context?.agentId !== undefined ? { agentId: context.agentId } : {}),
      ...(context?.toolCallId !== undefined ? { toolCallId: context.toolCallId } : {}),
      ...(context?.metadata !== undefined ? { metadata: context.metadata } : {}),
      scope,
      turn,
    });
    return hookResult?.result ?? result;
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
      getAvailablePhases() { return [...(runner.currentContext?.phases?.phases.keys() ?? [])]; },
      getPhaseContent(phaseId) {
        const phase = runner.currentContext?.phases?.phases.get(phaseId);
        return phase?.content || phase?.description || "";
      },
    };

    return createExtensionAPI(this.hooks, {
      registerPhase: (registration) =>
        this.registerPhase(extension, registration),
      unregisterPhase: (phaseName) =>
        this.unregisterPhase(extension, phaseName),
      registerProvider: (config) => this.registerProvider(config),
      unregisterProvider: (name) => this.unregisterProvider(name),
      registerTool: (tool) => this.registerTool(extension, tool),
      unregisterTool: (toolName) => this.unregisterTool(extension, toolName),
      contributeCapability: (contribution) =>
        this.contributeCapability(extension, contribution),
      contributeUi: (contribution) =>
        this.contributeUi(extension, contribution),
      context: extContext,
      manifest,
      trackCleanup: (cleanup) => extension.cleanup.push(cleanup),
      config: {
        get: async (scope) => {
          const effectiveScope = scope ?? { kind: "global" };
          const res = await runner.host.getConfig(extension.id, effectiveScope);
          return res ?? null;
        },
        changed: (handler) => {
          let listeners = runner.configChangeListeners.get(extension.id);
          if (!listeners) {
            listeners = new Set();
            runner.configChangeListeners.set(extension.id, listeners);
          }
          listeners.add(handler);
          extension.cleanup.push(() => {
            listeners?.delete(handler);
            if (listeners && listeners.size === 0) {
              runner.configChangeListeners.delete(extension.id);
            }
          });
        },
      },
      state: {
        run: (runId) => ({
          get: async (key) => runner.getRunState(runId, extension.id, key),
          set: async (key, value) => runner.setRunState(runId, extension.id, key, value),
          delete: async (key) => runner.deleteRunState(runId, extension.id, key),
        }),
        agent: (agentId) => ({
          get: async (key) => runner.host.getAgentState(extension.id, agentId, key),
          set: async (key, value) => runner.host.setAgentState(extension.id, agentId, key, value),
          delete: async (key) => runner.host.deleteAgentState(extension.id, agentId, key),
        }),
      },
    }, extension.runtime, this.events);
  }

  private registerTool(extension: Extension, tool: ToolDefinition): void {
    if (extension.tools.has(tool.name)) {
      throw new Error(`Duplicate Tool name "${tool.name}" in extension ${extension.path}.`);
    }
    // Check for duplicate tool names across extensions
    for (const ext of this.extensions) {
      if (ext.tools.has(tool.name)) {
        const message = `Duplicate Tool name "${tool.name}" from extensions ${ext.path} and ${extension.path}.`;
        this.emitError({
          extensionPath: extension.path,
          event: "register_tool",
          error: message,
        });
        throw new Error(message);
      }
    }

    const sourceInfo = createSourceInfo(extension.path);
    extension.tools.set(tool.name, {
      definition: tool,
      sourceInfo,
    });
  }

  private unregisterTool(extension: Extension, toolName: string): void {
    if (extension.tools.has(toolName)) {
      extension.tools.delete(toolName);
    }
  }

  private contributeCapability(
    extension: Extension,
    contribution: ExtensionCapabilityContribution,
  ): () => void {
    const key = `${contribution.kind}:${contribution.name}`;
    const entry: ExtensionCapabilityContribution = {
      kind: contribution.kind,
      name: contribution.name,
      description: contribution.description,
    };
    extension.capabilities.set(key, entry);
    if (this.extensions.includes(extension)) {
      this.notifyCapabilitiesChanged();
    }

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (extension.capabilities.get(key) === entry) {
        extension.capabilities.delete(key);
        if (this.extensions.includes(extension)) {
          this.notifyCapabilitiesChanged();
        }
      }
    };
    extension.cleanup.push(dispose);
    return dispose;
  }

  private notifyCapabilitiesChanged(): void {
    const capabilities = this.getCapabilities();
    for (const listener of this.capabilityListeners) {
      try {
        listener(capabilities);
      } catch (error) {
        this.emitError({
          extensionPath: "<runtime>",
          event: "capabilities_changed",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  private contributeUi(
    extension: Extension,
    contribution: UiContribution,
  ): () => void {
    const key = `${contribution.slot}:${contribution.id}`;
    const entry: UiContribution = {
      ...contribution,
    };
    extension.uiContributions.set(key, entry);
    if (this.extensions.includes(extension)) {
      this.notifyUiContributionsChanged();
    }

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (extension.uiContributions.get(key) === entry) {
        extension.uiContributions.delete(key);
        if (this.extensions.includes(extension)) {
          this.notifyUiContributionsChanged();
        }
      }
    };
    extension.cleanup.push(dispose);
    return dispose;
  }

  private notifyUiContributionsChanged(): void {
    const contributions = this.getUiContributions();
    for (const listener of this.uiContributionListeners) {
      try {
        listener(contributions);
      } catch (error) {
        this.emitError({
          extensionPath: "<runtime>",
          event: "ui_contributions_changed",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  private async registerPhase(
    extension: Extension,
    registration: PhaseRegistration,
  ): Promise<void> {
    if (typeof registration === "string") {
      if (registration.length === 0) {
        throw new Error(`Phase registration requires a directory path.`);
      }
      return this.loadRegisteredPhase(extension, registration);
    }
    if (typeof registration === "object" && registration !== null && "name" in registration) {
      return this.registerPhaseDefinition(extension, registration as import("../harness/phases/types").Phase);
    }
    throw new Error(`Phase registration requires a directory path or Phase object.`);
  }

  private registerPhaseDefinition(extension: Extension, phase: import("../harness/phases/types").Phase): void {
    const name = phase.name;
    if (this.phases.has(name)) {
      throw new Error(`Duplicate phase name: ${name}`);
    }

    const registered: RegisteredPhase = {
      definition: phase,
      source: { extensionPath: extension.path },
    };

    this.phases.set(name, registered);
    extension.phases.add(name);
    this._phaseCache = null;
  }

  private unregisterPhase(extension: Extension, phaseName: string): void {
    const registered = this.phases.get(phaseName);
    if (registered && registered.source.extensionPath === extension.path) {
      this.phases.delete(phaseName);
      extension.phases.delete(phaseName);
      this._phaseCache = null;
    }
  }

  private async loadRegisteredPhase(extension: Extension, registration: string): Promise<void> {
    const extensionBase = extension.path.startsWith("<") ? this.cwd : dirname(extension.path);
    const phase = await loadPhase(resolve(extensionBase, registration));
    const name = phase.name;
    if (this.phases.has(name)) {
      throw new Error(`Duplicate phase name: ${name}`);
    }

    const registered: RegisteredPhase = {
      definition: phase,
      source: { extensionPath: extension.path },
    };

    this.phases.set(name, registered);
    extension.phases.add(name);
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

  private async rollbackExtension(extension: Extension): Promise<void> {
    await this.disposeExtension(extension, "This Extension activation was rolled back.");
  }

  private async disposeExtension(extension: Extension, message: string): Promise<void> {
    extension.runtime.invalidate(message);
    for (const name of extension.phases) this.phases.delete(name);
    const hadCapabilities = extension.capabilities.size > 0;
    extension.capabilities.clear();
    const hadUiContributions = extension.uiContributions.size > 0;
    extension.uiContributions.clear();
    for (const cleanup of [...extension.cleanup].reverse()) {
      await Promise.resolve().then(() => cleanup()).catch(() => undefined);
    }
    if (extension.disposer) {
      await Promise.resolve().then(() => extension.disposer!()).catch(() => undefined);
    }
    this._phaseCache = null;
    if (hadCapabilities) {
      this.notifyCapabilitiesChanged();
    }
    if (hadUiContributions) {
      this.notifyUiContributionsChanged();
    }
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
