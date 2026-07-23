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
import { createExtensionRuntime } from "./types";
import { parseModelRef } from "@rowan-agent/models";
import type { Tool, ToolResult, AgentContext } from "../types";
import type { Phase, PhaseContext, PhaseOutput, PhaseRegistry } from "../harness/phases/types";
import {
  validateDescription,
  validatePhaseTarget,
  validateResourceId,
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
   * on use. Used during runtime replacement or reload.
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
        const extension: Extension = { path: ext.path, tools: new Map() };

        const api = this.createExtensionAPI(extension, ext.manifest);
        await ext.factory(api);

        this.extensions.push(extension);
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
      registerProvider: (config) => this.registerProvider(config),
      unregisterProvider: (name) => this.unregisterProvider(name),
      registerTool: (tool) => this.registerTool(extension, tool),
      context: extContext,
      manifest,
    }, this.runtime, this.events);
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
      ...(registration.tools ? { tools: registration.tools.slice() } : {}),
      ...(registration.skills ? { skills: registration.skills.slice() } : {}),
      ...(registration.target ? { target: registration.target } : {}),
      ...(registration.input ? { input: { ...registration.input } } : {}),
      ...(registration.model ? { model: registration.model } : {}),
    };

    const registered: RegisteredPhase = {
      definition,
      source: { extensionPath: extension.path },
    };

    this.phases.set(name, registered);

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
