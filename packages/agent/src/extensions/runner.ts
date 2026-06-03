/**
 * Extension runner — manages extension loading and hook execution.
 *
 * Architecture reference: PI's AgentHarness
 * - Direct `on()` API for hook registration
 * - Unified `emitHook()` for result collection
 * - ExtensionContext delegates to runner's hooks
 */

import { execFile } from "node:child_process";
import {
  createPhaseRegistry,
  type PhaseRegistry,
  type PhaseDefinition,
} from "../loop/phases/registry";
import { buildModelRequest } from "../harness/context/prompt-builder";
import type { ProviderConfig } from "@rowan-agent/models";
import {
  registerModel,
  unregisterProviderModels,
  registerApiProvider,
} from "@rowan-agent/models";
import type {
  ExecOptions,
  ExecResult,
  PhaseRegistration,
  RegisteredPhase,
} from "./types";
import type { Tool, ToolResult } from "../types";
import type { PhaseInput, PhaseOutput } from "../loop/phases/registry";
import { HooksManager } from "./hooks";
import type {
  HookEventType,
  HookHandler,
  HookResultMap,
} from "./hooks";
import {
  createExtensionContext,
  type ExtensionContext,
  type ExtensionManifest,
  type LoadedExtension,
} from "./context";

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
    registerApiProvider({ api: config.api, stream: config.streamSimple });
  }
  for (const modelConfig of config.models) {
    registerModel({
      id: modelConfig.id,
      name: modelConfig.name,
      api: config.api,
      provider: config.name,
      baseUrl: config.baseUrl,
      reasoning: modelConfig.reasoning,
      input: modelConfig.input,
      cost: modelConfig.cost,
      contextWindow: modelConfig.contextWindow,
      maxTokens: modelConfig.maxTokens,
      ...(config.headers ? { headers: config.headers } : {}),
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
  entryPhaseId?: string;
  validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean;
  cwd?: string;
};

/**
 * Manages extensions and provides hooks for the agent loop.
 *
 * Direct API (like PI's AgentHarness):
 * ```ts
 * const runner = createExtensionRunner();
 *
 * // Direct hook registration
 * const unsub = runner.on("before_tool_call", (event) => {
 *   return { allow: false, reason: "Blocked" };
 * });
 *
 * // Cancel subscription
 * unsub();
 * ```
 *
 * Extension API:
 * ```ts
 * runner.loadExtensions([{
 *   factory: (ctx) => {
 *     ctx.on("before_tool_call", handler);
 *   }
 * }]);
 * ```
 */
export class ExtensionRunner {
  readonly hooks: HooksManager;
  private readonly validatePhaseOverride?: (
    phaseId: string,
    extensionPath: string,
  ) => boolean;
  private readonly cwd: string;

  // Phase management
  private readonly phases = new Map<string, RegisteredPhase>();
  private _phaseCache: Map<string, RegisteredPhase> | null = null;

  // Provider management
  private readonly pendingProviders: Array<
    | { kind: "register"; config: ProviderConfig }
    | { kind: "unregister"; name: string }
  > = [];
  private bound = false;

  // Loaded extensions
  private readonly extensions: LoadedExtension[] = [];

  constructor(options?: ExtensionRunnerOptions) {
    this.hooks = new HooksManager();
    this.validatePhaseOverride = options?.validatePhaseOverride;
    this.cwd = options?.cwd ?? process.cwd();
  }

  // ---------------------------------------------------------------------------
  // Direct hook API (like PI's AgentHarness.on)
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
    // Use a wrapper handler for each event type
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
   */
  async loadExtensions(extensions: LoadedExtension[]): Promise<void> {
    for (const ext of extensions) {
      try {
        const ctx = this.createContext(ext.path, ext.manifest);
        await ext.factory(ctx);
        this.extensions.push(ext);
      } catch (error) {
        console.error(`[extension] Failed to load ${ext.name}:`, error);
        throw error;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  getPhase(id: string): PhaseDefinition | undefined {
    return this.getRegisteredPhase(id)?.definition;
  }

  getPhases(): PhaseDefinition[] {
    return [...this.collectRegisteredPhases().values()].map(
      (p) => p.definition,
    );
  }

  getPhaseHandler(id: string): RegisteredPhase["handler"] | undefined {
    return this.getRegisteredPhase(id)?.handler;
  }

  createPhaseRegistry(
    input: { entryPhaseId?: string } = {},
  ): PhaseRegistry {
    const registered = this.collectRegisteredPhases();
    return createPhaseRegistry({
      entryPhaseId: input.entryPhaseId,
      phases: [...registered.values()].map((p) => p.definition),
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Bind the runner — flushes pending provider registrations.
   */
  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.flushPendingProviders();
  }

  // ---------------------------------------------------------------------------
  // Unified hook emission (like PI's emitHook)
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
   * Unified hook emission — returns the last non-undefined result.
   *
   * Like PI's AgentHarness.emitHook():
   * - Runs all handlers sequentially
   * - Returns the last non-undefined result
   * - Throws on handler errors
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

  /**
   * Emit before_phase hook.
   * Returns the hook result for caller to process.
   */
  async emitBeforePhase(
    phaseId: string,
    input: PhaseInput,
  ): Promise<{ abort?: any; skip?: any; input?: PhaseInput }> {
    const result = await this.emitHook("before_phase", {
      type: "before_phase",
      phaseId,
      input,
    });
    return result ?? {};
  }

  /**
   * Emit after_phase hook.
   * Returns the hook result for caller to process.
   */
  async emitAfterPhase(
    phaseId: string,
    output: PhaseOutput,
  ): Promise<{ abort?: any; retry?: PhaseInput; output?: PhaseOutput }> {
    const result = await this.emitHook("after_phase", {
      type: "after_phase",
      phaseId,
      output,
    });
    return result ?? {};
  }

  /**
   * Emit before_prompt hook.
   * Returns modified input or original if no hook.
   */
  async emitBeforePrompt(
    phaseId: string,
    input: PhaseInput,
  ): Promise<PhaseInput> {
    const result = await this.emitHook("before_prompt", {
      type: "before_prompt",
      phaseId,
      input,
    });
    return result?.input ?? input;
  }

  /**
   * Emit before_tool_call hook.
   * Returns { allow, reason } decision.
   */
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

  /**
   * Emit after_tool_call hook.
   * Returns modified result or original.
   */
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

  private createContext(extensionPath: string, manifest?: ExtensionManifest): ExtensionContext {
    return createExtensionContext(this.hooks, extensionPath, {
      registerPhase: (registration) =>
        this.registerPhase(extensionPath, registration),
      registerProvider: (config) => this.registerProvider(config),
      unregisterProvider: (name) => this.unregisterProvider(name),
      manifest,
    });
  }

  private registerPhase(
    extensionPath: string,
    registration: PhaseRegistration,
  ): void {
    if (!registration.id) {
      throw new Error(`Phase registration requires an "id" field.`);
    }

    if (this.validatePhaseOverride?.(registration.id, extensionPath)) {
      throw new Error(
        `External extension cannot override built-in phase: ${registration.id}`,
      );
    }

    if (this.phases.has(registration.id)) {
      throw new Error(`Duplicate phase id: ${registration.id}`);
    }

    let buildPrompt = registration.buildPrompt;
    if (!buildPrompt) {
      const promptConfig = registration.prompt;
      if (promptConfig?.instructions?.length) {
        buildPrompt = (input) => {
          const req = buildModelRequest(input);
          req.messages.push({
            role: "user",
            content: promptConfig.instructions!.join("\n"),
          });
          return req;
        };
      } else {
        buildPrompt = (input) => buildModelRequest(input);
      }
    }

    const definition: PhaseDefinition = {
      id: registration.id,
      name: registration.name ?? registration.id,
      description: registration.description ?? "",
      run: registration.run,
      buildPrompt,
    };

    this.phases.set(registration.id, {
      definition,
      handler: { buildPrompt },
      source: { extensionPath },
    });
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

  private getRegisteredPhase(id: string): RegisteredPhase | undefined {
    return this.collectRegisteredPhases().get(id);
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
