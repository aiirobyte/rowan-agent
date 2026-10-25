import type { ToolCallPhase } from "../runtime/contracts";
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
  ExtensionError,
  ExtensionErrorListener,
  ExtensionHost,
  ExtensionRuntime,
  PhaseRegistration,
  RegisteredPhase,
  RegisteredSkill,
  RegisteredTool,
  ScopeRef,
  SkillRegistration,
  Tool,
} from "./types";
import { InMemoryExtensionHost, scopeToKey } from "./host";
import type { JsonObject, JsonValue } from "../runtime-events";
import { assertJsonValue } from "../runtime/json";
import type { ToolResult } from "@rowan-agent/models";
import type { AgentContext } from "../loop/types";
import type { Phase, PhaseContext, PhaseOutput, PhaseRegistry } from "../harness/phases/types";
import type { Skill } from "../protocol";
import { HooksManager } from "./hooks";
import type {
  BeforeToolCallResult,
  HookEventType,
  HookHandler,
  HookResultMap,
} from "./hooks";
import {
  type ExtensionAPI,
  type ExtensionAgentsRuntimeDelegate,
  type PhaseRunHandler,
  createExtensionAPI,
} from "./api";
import type { ExtensionContext } from "./context";
import type { LoadedExtension, ExtensionManifest } from "./types";
import { createExtensionRuntime, createSourceInfo } from "./types";
import { createEventBus, type EventBus } from "./context";
import { loadPhase } from "../harness/phases/loader";
import { loadSkill } from "../harness/skills";
import type { PhaseExecution } from "../loop/execution";

/** The Resource Source an Extension registration lands in: Global (`[]`) is `rowan.extensions`, any other Scope `rowan.extensions:<scopeToKey(scope)>`. */
export function extensionSourceId(scope?: ScopeRef): string {
  if (!scope || scope.length === 0) return "rowan.extensions";
  return `rowan.extensions:${scopeToKey(scope)}`;
}

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

  // Skill management
  private readonly skills = new Map<string, RegisteredSkill>();

  // Provider management
  private readonly pendingProviders: Array<
    | { kind: "register"; config: ProviderConfig }
    | { kind: "unregister"; name: string }
  > = [];
  private bound = false;
  private readonly providersChangedListeners = new Set<() => void>();

  // Error listeners
  private readonly errorListeners = new Set<ExtensionErrorListener>();

  // Resource change listeners (for Registry live sync)
  private readonly resourceChangeListeners = new Set<(kind: "tool" | "phase" | "skill") => Promise<void> | void>();
  private runtimeAgents?: ExtensionAgentsRuntimeDelegate;
  private readonly activeExtensionPhases = new Map<string, { extension: Extension; phase: Phase; scope?: ScopeRef; sourceId?: string; handler?: PhaseRunHandler }>();

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
        void this.notifyConfigChanged(extensionId, scope);
      });
      if (typeof unsub === "function") {
        this.hostUnsubscribers.push(unsub);
      }
    }
  }

  setRuntime(runtime: ExtensionAgentsRuntimeDelegate): void {
    this.runtimeAgents = runtime;
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
      const hostApi = this.host.extendApi?.(extensionId, "extension", { path: ext.path });
      const extension: Extension = {
        id: extensionId,
        path: ext.path,
        tools: new Map(),
        phases: new Set(),
        skills: new Set(),
        cleanup: [],
        runtime: createExtensionRuntime(),
        hostApi,
      };
      try {
        const api = this.createExtensionAPI(extension, ext.manifest, hostApi?.namespaces);
        const disposer = await ext.factory(api);
        if (typeof disposer === "function") extension.disposer = disposer;

        this.extensions.push(extension);
        this._phaseCache = null;
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

  async activatePhase(
    phase: Phase,
    scope?: ScopeRef,
    sourceId?: string,
    source: Readonly<{ path: string }> = { path: phase.filePath },
  ): Promise<void> {
    if (!phase.extensionFactory) return;
    const phaseKey = `${scopeToKey(scope ?? [])}::${phase.name}`;
    if (this.activeExtensionPhases.has(phaseKey)) return;

    const extension: Extension = {
      id: phase.name,
      path: source.path || phase.name,
      tools: new Map(),
      phases: new Set(),
      skills: new Set(),
      cleanup: [],
      runtime: createExtensionRuntime(),
      hostApi: this.host.extendApi?.(phase.name, "phase", source),
    };
    let executeHandler: PhaseRunHandler | undefined;
    const api = this.createExtensionAPI(extension, undefined, extension.hostApi?.namespaces, {
      isExtensionPhase: true,
      onExecute: (handler) => { executeHandler = handler; },
    });

    try {
      const disposer = await phase.extensionFactory(api);
      if (typeof disposer === "function") extension.disposer = disposer;
      this.extensions.push(extension);
      this.activeExtensionPhases.set(phaseKey, { extension, phase, scope, sourceId, handler: executeHandler });
    } catch (error) {
      await this.rollbackExtension(extension);
      throw error;
    }
  }

  getPhaseHandler(phaseName: string, scope?: ScopeRef): PhaseRunHandler | undefined {
    const direct = this.activeExtensionPhases.get(`${scopeToKey(scope ?? [])}::${phaseName}`)?.handler;
    if (direct) return direct;
    if (scope && scope.length > 0) {
      return this.activeExtensionPhases.get(`${scopeToKey([])}::${phaseName}`)?.handler;
    }
    return undefined;
  }

  async deactivatePhase(phaseName: string, scope?: ScopeRef): Promise<void> {
    const phaseKey = `${scopeToKey(scope ?? [])}::${phaseName}`;
    const active = this.activeExtensionPhases.get(phaseKey);
    if (!active) return;
    this.activeExtensionPhases.delete(phaseKey);
    const index = this.extensions.indexOf(active.extension);
    if (index !== -1) this.extensions.splice(index, 1);
    await this.disposeExtension(active.extension, "Phase unloaded or reloaded.");
  }

  async deactivatePhasesForSource(sourceId: string): Promise<void> {
    for (const [key, active] of [...this.activeExtensionPhases]) {
      const activeSource = active.sourceId ?? extensionSourceId(active.scope);
      if (activeSource !== sourceId) continue;
      this.activeExtensionPhases.delete(key);
      const index = this.extensions.indexOf(active.extension);
      if (index !== -1) this.extensions.splice(index, 1);
      await this.disposeExtension(active.extension, "Phase source unloaded.");
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
    this.activeExtensionPhases.clear();
    this.resourceChangeListeners.clear();
    this.providersChangedListeners.clear();
    this.phases.clear();
    this._phaseCache = null;
    this.skills.clear();
    this.bound = false;
    this.runtime.invalidate("This Extension Runtime has been closed.");
  }

  get extensionHost(): ExtensionHost {
    return this.host;
  }

  async notifyConfigChanged(extensionId: string, scope: ScopeRef): Promise<void> {
    const listeners = this.configChangeListeners.get(extensionId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        await listener(scope);
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
      for (const tool of ext.tools.values()) {
        if (tool.definition.name === toolName) return tool.definition;
      }
    }
    return undefined;
  }

  /**
   * Subscribe to resource changes (tools, phases, skills registered, unregistered, or disposed).
   * Used by RuntimeBootstrapRegistry to re-commit implicit sources after activation.
   */
  onResourceChange(listener: (kind: "tool" | "phase" | "skill") => Promise<void> | void): () => void {
    this.resourceChangeListeners.add(listener);
    return () => this.resourceChangeListeners.delete(listener);
  }

  private async notifyResourceChange(kind: "tool" | "phase" | "skill"): Promise<void> {
    if (!this.bound) return;
    for (const listener of this.resourceChangeListeners) {
      await listener(kind);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  getPhase(name: string): Phase | undefined {
    for (const reg of this.collectRegisteredPhases().values()) {
      if (reg.definition.name === name) return this.adaptToPhase(reg);
    }
    return undefined;
  }

  getPhases(): Phase[] {
    return [...this.collectRegisteredPhases().values()].map(
      (p) => this.adaptToPhase(p),
    );
  }

  getRegisteredPhases(): readonly RegisteredPhase[] {
    return [...this.collectRegisteredPhases().values()];
  }

  createPhaseRegistry(
    input: { entryPhaseId?: string | null } = {},
  ): PhaseRegistry {
    const registered = this.collectRegisteredPhases();
    const phases = new Map<string, Phase>();
    for (const reg of registered.values()) {
      phases.set(reg.definition.name, this.adaptToPhase(reg));
    }
    // Default to null (start from "none") unless explicitly provided
    const entryPhaseId = input.entryPhaseId ?? null;
    return { phases, entryPhaseId };
  }

  /** Adapt an extension RegisteredPhase to the core Phase type. */
  adaptToPhase(reg: RegisteredPhase): Phase {
    const def = reg.definition;
    return {
      ...def,
      ...(def.tools ? { tools: [...def.tools] } : {}),
      skills: def.skills ? [...def.skills] : [],
      ...(def.input ? { input: { ...def.input } } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Skill management
  // ---------------------------------------------------------------------------

  getSkills(): Skill[] {
    return [...this.skills.values()].map((s) => s.definition);
  }

  getRegisteredSkills(): readonly RegisteredSkill[] {
    return [...this.skills.values()];
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
      agentMetadata?: Readonly<Record<string, unknown>>;
      answer?: unknown;
      scope?: ScopeRef;
      turn?: JsonObject;
      phase?: ToolCallPhase;
    },
  ): Promise<BeforeToolCallResult> {
    const scope = context?.scope ?? [];
    const turn = context?.turn ?? {};
    const result = await this.emitHook("before_tool_call", {
      type: "before_tool_call",
      tool,
      args,
      ...(context?.runId !== undefined ? { runId: context.runId } : {}),
      ...(context?.agentId !== undefined ? { agentId: context.agentId } : {}),
      ...(context?.toolCallId !== undefined ? { toolCallId: context.toolCallId } : {}),
      ...(context?.metadata !== undefined ? { metadata: context.metadata } : {}),
      ...(context?.agentMetadata !== undefined ? { agentMetadata: context.agentMetadata } : {}),
      ...(context?.answer !== undefined ? { answer: context.answer } : {}),
      scope,
      turn,
      ...(context?.phase !== undefined ? { phase: context.phase } : {}),
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
      phase?: ToolCallPhase;
    },
  ): Promise<ToolResult> {
    const scope = context?.scope ?? [];
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
      ...(context?.phase !== undefined ? { phase: context.phase } : {}),
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
  private createExtensionAPI(
    extension: Extension,
    manifest?: ExtensionManifest,
    namespaces?: Readonly<Record<string, unknown>>,
    phaseOpts?: { isExtensionPhase?: boolean; onExecute?: (handler: PhaseRunHandler) => void },
  ): ExtensionAPI {
    const runner = this;
    const extContext: ExtensionContext = {
      get cwd() { return runner.cwd; },
      get signal() { return runner.abortController.signal; },
      exec(command, args, options) {
        return execCommand(command, args, runner.cwd, options);
      },
    };

    return createExtensionAPI(this.hooks, {
      registerPhase: (registration, scope) =>
        this.registerPhase(extension, registration, scope),
      unregisterPhase: (phaseName, scope) =>
        this.unregisterPhase(extension, phaseName, scope),
      registerSkill: (registration, scope) =>
        this.registerSkill(extension, registration, scope),
      unregisterSkill: (skillName, scope) =>
        this.unregisterSkill(extension, skillName, scope),
      registerProvider: (config) => this.registerProvider(config),
      unregisterProvider: (name) => this.unregisterProvider(name),
      registerTool: (tool, scope) => this.registerTool(extension, tool, scope),
      unregisterTool: (toolName, scope) => this.unregisterTool(extension, toolName, scope),
      context: extContext,
      namespaces,
      runtimeAgents: this.runtimeAgents,
      isExtensionPhase: phaseOpts?.isExtensionPhase,
      onExecute: phaseOpts?.onExecute,
      trackCleanup: (cleanup) => extension.cleanup.push(cleanup),
      config: {
        get: async (scope) => {
          const effectiveScope = scope ?? [];
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
        global: () => ({
          get: async (key) => runner.host.getGlobalState(extension.id, key),
          set: async (key, value) => runner.host.setGlobalState(extension.id, key, value),
          delete: async (key) => runner.host.deleteGlobalState(extension.id, key),
        }),
      },
    }, extension.runtime, this.events);
  }

  // Validation stays synchronous so a duplicate throws at the call site even
  // when the caller does not await the Registry re-commit.
  private registerTool(extension: Extension, tool: Tool, scope?: ScopeRef): Promise<void> {
    const sourceId = extensionSourceId(scope);
    const regKey = `${sourceId}::${tool.name}`;
    if (extension.tools.has(regKey)) {
      throw new Error(`Duplicate Tool name "${tool.name}" in extension ${extension.path}.`);
    }
    // Check for duplicate tool names across extensions in the same source
    for (const ext of this.extensions) {
      if (ext.tools.has(regKey)) {
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
    extension.tools.set(regKey, {
      definition: tool,
      sourceInfo,
      sourceId,
      scope,
    });
    return this.notifyResourceChange("tool");
  }

  private unregisterTool(extension: Extension, toolName: string, scope?: ScopeRef): Promise<void> {
    const sourceId = extensionSourceId(scope);
    const regKey = `${sourceId}::${toolName}`;
    if (!extension.tools.delete(regKey)) return Promise.resolve();
    return this.notifyResourceChange("tool");
  }

  private async registerPhase(
    extension: Extension,
    registration: PhaseRegistration,
    scope?: ScopeRef,
  ): Promise<void> {
    if (typeof registration === "string") {
      if (registration.length === 0) {
        throw new Error(`Phase registration requires a directory path.`);
      }
      return this.loadRegisteredPhase(extension, registration, scope);
    }
    if (typeof registration === "object" && registration !== null && "name" in registration) {
      const phase = registration as Phase;
      return this.registerPhaseDefinition(extension, phase, scope);
    }
    throw new Error(`Phase registration requires a directory path or Phase object.`);
  }

  private async registerPhaseDefinition(
    extension: Extension,
    phase: import("../harness/phases/types").Phase,
    scope?: ScopeRef,
  ): Promise<void> {
    if (phase.extensionFactory) {
      await this.activatePhase(phase, scope, undefined, {
        path: phase.filePath || extension.path,
      });
    }
    const sourceId = extensionSourceId(scope);
    const name = phase.name;
    const regKey = `${sourceId}::${name}`;
    if (this.phases.has(regKey)) {
      throw new Error(`Duplicate phase name: ${name}`);
    }

    const registered: RegisteredPhase = {
      definition: phase,
      source: { extensionPath: extension.path },
      sourceId,
      scope,
    };

    this.phases.set(regKey, registered);
    extension.phases.add(regKey);
    this._phaseCache = null;
    await this.notifyResourceChange("phase");
  }

  private async unregisterPhase(extension: Extension, phaseName: string, scope?: ScopeRef): Promise<void> {
    const sourceId = extensionSourceId(scope);
    const regKey = `${sourceId}::${phaseName}`;
    const registered = this.phases.get(regKey);
    if (registered && registered.source.extensionPath === extension.path) {
      this.phases.delete(regKey);
      extension.phases.delete(regKey);
      this._phaseCache = null;
      await this.deactivatePhase(phaseName, scope);
      await this.notifyResourceChange("phase");
    }
  }

  private async loadRegisteredPhase(extension: Extension, registration: string, scope?: ScopeRef): Promise<void> {
    const extensionBase = extension.path.startsWith("<") ? this.cwd : dirname(extension.path);
    const phase = await loadPhase(resolve(extensionBase, registration));
    await this.registerPhaseDefinition(extension, phase, scope);
  }

  private async registerSkill(
    extension: Extension,
    registration: SkillRegistration,
    scope?: ScopeRef,
  ): Promise<void> {
    if (typeof registration === "string") {
      if (registration.length === 0) {
        throw new Error(`Skill registration requires a directory path.`);
      }
      return this.loadRegisteredSkill(extension, registration, scope);
    }
    if (typeof registration === "object" && registration !== null && "name" in registration) {
      return this.registerSkillDefinition(extension, registration as Skill, scope);
    }
    throw new Error(`Skill registration requires a directory path or Skill object.`);
  }

  private async registerSkillDefinition(extension: Extension, skill: Skill, scope?: ScopeRef): Promise<void> {
    const sourceId = extensionSourceId(scope);
    const name = skill.name;
    const regKey = `${sourceId}::${name}`;
    const existing = this.skills.get(regKey);
    if (existing && existing.source.extensionPath !== extension.path) {
      for (const ext of this.extensions) {
        if (ext.path === existing.source.extensionPath) {
          ext.skills.delete(regKey);
          break;
        }
      }
    }

    const registered: RegisteredSkill = {
      definition: skill,
      source: { extensionPath: extension.path },
      sourceId,
      scope,
    };

    this.skills.set(regKey, registered);
    extension.skills.add(regKey);
    await this.notifyResourceChange("skill");
  }

  private async unregisterSkill(extension: Extension, skillName: string, scope?: ScopeRef): Promise<void> {
    const sourceId = extensionSourceId(scope);
    const regKey = `${sourceId}::${skillName}`;
    const registered = this.skills.get(regKey);
    if (registered && registered.source.extensionPath === extension.path) {
      this.skills.delete(regKey);
      extension.skills.delete(regKey);
      await this.notifyResourceChange("skill");
    }
  }

  private async loadRegisteredSkill(extension: Extension, registration: string, scope?: ScopeRef): Promise<void> {
    const extensionBase = extension.path.startsWith("<") ? this.cwd : dirname(extension.path);
    const skill = await loadSkill(resolve(extensionBase, registration));
    await this.registerSkillDefinition(extension, skill, scope);
  }

  /** Called after a Provider registration change has been applied to the model registry. */
  onProvidersChanged(listener: () => void): () => void {
    this.providersChangedListeners.add(listener);
    return () => this.providersChangedListeners.delete(listener);
  }

  private notifyProvidersChanged(): void {
    for (const listener of this.providersChangedListeners) {
      try {
        listener();
      } catch (err) {
        console.error("[extension-runner] Providers-changed listener failed:", err);
      }
    }
  }

  private registerProvider(config: ProviderConfig): void {
    if (this.bound) {
      applyProviderRegistration(config);
      this.notifyProvidersChanged();
    } else {
      this.pendingProviders.push({ kind: "register", config });
    }
  }

  private unregisterProvider(name: string): void {
    if (this.bound) {
      applyProviderUnregistration(name);
      this.notifyProvidersChanged();
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
    const applied = this.pendingProviders.length > 0;
    this.pendingProviders.length = 0;
    if (applied) this.notifyProvidersChanged();
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
    const hadTools = extension.tools.size > 0;
    const hadPhases = extension.phases.size > 0;
    const hadSkills = extension.skills.size > 0;

    extension.tools.clear();
    for (const name of extension.phases) this.phases.delete(name);
    extension.phases.clear();
    for (const name of extension.skills) {
      if (this.skills.get(name)?.source.extensionPath === extension.path) {
        this.skills.delete(name);
      }
    }
    extension.skills.clear();

    for (const cleanup of [...extension.cleanup].reverse()) {
      await Promise.resolve().then(() => cleanup()).catch(() => undefined);
    }
    if (extension.disposer) {
      await Promise.resolve().then(() => extension.disposer!()).catch(() => undefined);
    }
    if (extension.hostApi?.dispose) {
      const hostDispose = extension.hostApi.dispose;
      extension.hostApi = { ...extension.hostApi, dispose: undefined };
      await Promise.resolve().then(() => hostDispose()).catch(() => undefined);
    }
    this._phaseCache = null;
    if (this.bound) {
      if (hadTools) await this.notifyResourceChange("tool");
      if (hadPhases) await this.notifyResourceChange("phase");
      if (hadSkills) await this.notifyResourceChange("skill");
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
