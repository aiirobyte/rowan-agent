import { execFile } from "node:child_process";
import { createPhaseRegistry, type PhaseRegistry, type PhaseDefinition } from "../loop/phases/registry";
import { latestUserInput, buildModelRequest } from "../harness/context/prompt-builder";
import { createId, createJson } from "../utils";
import type { ProviderConfig } from "@rowan-agent/models";
import { registerModel, unregisterProviderModels } from "@rowan-agent/models";
import { registerApiProvider } from "@rowan-agent/models";
import type {
  ExecOptions,
  ExecResult,
  Extension,
  ExtensionAPI,
  ExtensionHandler,
  ExtensionPhaseHandler,
  ExtensionRuntime,
  PendingProviderAction,
  RegisteredPhase,
  BeforeToolCallContext,
  AfterToolCallContext,
  BeforePhaseHookResult,
  AfterPhaseHookResult,
} from "./types";
import type { AgentEvent, Tool, ToolResult } from "../types";
import type { PhaseInput, PhaseOutput } from "../loop/phases/registry";

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
          exitCode: typeof error?.code === "number" ? error.code : (error ? 1 : 0),
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );

    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      }, { once: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Extension Runtime
// ---------------------------------------------------------------------------

export function createExtensionRuntime(options?: { cwd?: string }): ExtensionRuntime {
  const cwd = options?.cwd ?? process.cwd();
  const state: { staleMessage?: string; bound: boolean } = { bound: false };

  // Pending provider registrations — only used before bind()
  const pending: PendingProviderAction[] = [];

  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };

  // --- Internal helpers ---

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

  function flushPending(): void {
    for (const action of pending) {
      if (action.kind === "register") {
        applyProviderRegistration(action.config);
      } else {
        applyProviderUnregistration(action.name);
      }
    }
    pending.length = 0;
  }

  // --- Public API ---

  return {
    assertActive,
    invalidate: (message) => {
      state.staleMessage ??=
        message ?? "This extension context is stale after session replacement or reload.";
    },

    registerPhase(extension, registration) {
      assertActive();

      // Generate buildPrompt from prompt config if not provided
      let buildPrompt = registration.buildPrompt;
      if (!buildPrompt && registration.prompt) {
        const promptConfig = registration.prompt;
        buildPrompt = (input) => {
          const req = buildModelRequest(input);
          if (promptConfig.instructions?.length) {
            req.messages.push({
              role: "user",
              content: promptConfig.instructions.join("\n"),
            });
          }
          return req;
        };
      }

      const definition: PhaseDefinition = {
        id: registration.id,
        name: registration.name,
        description: registration.description,
        run: registration.run,
        buildPrompt,
      };
      extension.phases.set(registration.id, { definition, handler: { buildPrompt }, source: { extensionPath: extension.path } });
    },

    addEventHandler(extension, event, handler) {
      assertActive();
      const handlers = extension.eventHandlers.get(event) ?? [];
      handlers.push(handler);
      extension.eventHandlers.set(event, handlers);
    },

    exec(command, args, options) {
      assertActive();
      return execCommand(command, args, cwd, options);
    },

    registerProvider(config: ProviderConfig): void {
      assertActive();
      if (state.bound) {
        applyProviderRegistration(config);
      } else {
        pending.push({ kind: "register", config });
      }
    },

    unregisterProvider(name: string): void {
      assertActive();
      if (state.bound) {
        applyProviderUnregistration(name);
      } else {
        pending.push({ kind: "unregister", name });
      }
    },

    bind(): void {
      if (state.bound) return;
      state.bound = true;
      flushPending();
    },

    id: { create: createId },
    format: { json: createJson.stringify },
    input: { latestUserMessage: latestUserInput },
    prompt: { buildModelRequest },
  };
}

// ---------------------------------------------------------------------------
// Extension API creation
// ---------------------------------------------------------------------------

export function createExtensionAPI(extension: Extension, runtime: ExtensionRuntime): ExtensionAPI {
  return {
    on(event, handler) { runtime.addEventHandler(extension, event, handler); },
    registerPhase(registration) { runtime.registerPhase(extension, registration); },
    beforePhase(hook) { runtime.addEventHandler(extension, "before_phase", hook as ExtensionHandler); },
    afterPhase(hook) { runtime.addEventHandler(extension, "after_phase", hook as ExtensionHandler); },
    beforePrompt(hook) { runtime.addEventHandler(extension, "before_prompt", hook as ExtensionHandler); },
    beforeToolCall(hook) { runtime.addEventHandler(extension, "before_tool_call", hook as ExtensionHandler); },
    afterToolCall(hook) { runtime.addEventHandler(extension, "after_tool_call", hook as ExtensionHandler); },
    exec(command, args, options) { return runtime.exec(command, args, options); },
    registerProvider(config) { runtime.registerProvider(config); },
    unregisterProvider(name) { runtime.unregisterProvider(name); },
    id: runtime.id,
    format: runtime.format,
    input: runtime.input,
    prompt: runtime.prompt,
  };
}

// ---------------------------------------------------------------------------
// Extension Runner
// ---------------------------------------------------------------------------

export type ExtensionRunnerOptions = {
  entryPhaseId?: string;
  validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean;
};

export class ExtensionRunner {
  private readonly validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean;
  private _phaseCache: Map<string, RegisteredPhase> | null = null;

  constructor(
    private readonly extensions: Extension[],
    options?: { validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean },
  ) {
    this.validatePhaseOverride = options?.validatePhaseOverride;
  }

  getPhase(id: string): PhaseDefinition | undefined {
    return this.getRegisteredPhase(id)?.definition;
  }

  getPhases(): PhaseDefinition[] {
    return [...this.collectRegisteredPhases().values()].map((p) => p.definition);
  }

  getPhaseHandler(id: string): ExtensionPhaseHandler | undefined {
    return this.getRegisteredPhase(id)?.handler;
  }

  createPhaseRegistry(input: { entryPhaseId?: string } = {}): PhaseRegistry {
    const registered = this.collectRegisteredPhases();
    return createPhaseRegistry({
      entryPhaseId: input.entryPhaseId,
      phases: [...registered.values()].map((p) => p.definition),
    });
  }

  /**
   * Emit an event to all registered extension handlers for that event type.
   * Handlers within each extension run concurrently; extensions are processed in registration order.
   */
  async emit(event: AgentEvent): Promise<void> {
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get(event.type);
      if (!handlers?.length) continue;
      const results = await Promise.allSettled(handlers.map((h) => h(event)));
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(
            `[extension] handler error for "${event.type}" in ${extension.path}:`,
            result.reason,
          );
        }
      }
    }
  }

  /**
   * Invoke all extension-registered before_phase handlers and aggregate results.
   * Returns the combined result: abort takes priority, then skip, then input replacement.
   */
  async emitBeforePhase(phaseId: string, input: PhaseInput): Promise<BeforePhaseHookResult> {
    const result: BeforePhaseHookResult = {};
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get("before_phase");
      if (!handlers?.length) continue;
      for (const handler of handlers) {
        try {
          const ctx = { phaseId, input };
          await handler(ctx);
          // Check for abort/skip/input mutations via the mutable context pattern
          const hookResult = ctx as unknown as BeforePhaseHookResult;
          if (hookResult.abort) { result.abort = hookResult.abort; return result; }
          if (hookResult.skip) { result.skip = hookResult.skip; }
          if (hookResult.input) { result.input = hookResult.input; }
        } catch (error) {
          console.error(`[extension] before_phase handler error in ${extension.path}:`, error);
        }
      }
    }
    return result;
  }

  /**
   * Invoke all extension-registered after_phase handlers and aggregate results.
   * Returns the combined result: abort takes priority, then retry, then output replacement.
   */
  async emitAfterPhase(phaseId: string, output: PhaseOutput): Promise<AfterPhaseHookResult> {
    const result: AfterPhaseHookResult = {};
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get("after_phase");
      if (!handlers?.length) continue;
      for (const handler of handlers) {
        try {
          const ctx = { phaseId, output };
          await handler(ctx);
          const hookResult = ctx as unknown as AfterPhaseHookResult;
          if (hookResult.abort) { result.abort = hookResult.abort; return result; }
          if (hookResult.retry) { result.retry = hookResult.retry; }
          if (hookResult.output) { result.output = hookResult.output; }
        } catch (error) {
          console.error(`[extension] after_phase handler error in ${extension.path}:`, error);
        }
      }
    }
    return result;
  }

  /**
   * Invoke before_prompt handlers. Each handler can mutate the PhaseInput in place.
   * This runs before buildPrompt, allowing extensions to
   * transform messages, tools, systemPrompt, etc.
   */
  async emitBeforePrompt(phaseId: string, input: PhaseInput): Promise<PhaseInput> {
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get("before_prompt");
      if (!handlers?.length) continue;
      for (const handler of handlers) {
        try {
          const ctx = { phaseId, input };
          await handler(ctx);
          // Handler may replace input via mutation
          if (ctx.input !== input) {
            input = ctx.input;
          }
        } catch (error) {
          console.error(`[extension] before_prompt handler error in ${extension.path}:`, error);
        }
      }
    }
    return input;
  }

  /**
   * Invoke before_tool_call handlers. Returns whether the call should be blocked.
   * Short-circuits as soon as any handler sets allow=false.
   */
  async emitBeforeToolCall(tool: Tool, args: unknown): Promise<{ allow: boolean; reason?: string }> {
    const ctx: BeforeToolCallContext = { tool, args, allow: true };
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get("before_tool_call");
      if (!handlers?.length) continue;
      for (const handler of handlers) {
        try {
          await handler(ctx);
        } catch (error) {
          console.error(`[extension] before_tool_call handler error in ${extension.path}:`, error);
        }
        if (!ctx.allow) return { allow: false, reason: ctx.reason };
      }
    }
    return { allow: ctx.allow, reason: ctx.reason };
  }

  /**
   * Invoke after_tool_call handlers. Handlers can mutate the result.
   */
  async emitAfterToolCall(tool: Tool, result: ToolResult): Promise<ToolResult> {
    const ctx: AfterToolCallContext = { tool, result };
    for (const extension of this.extensions) {
      const handlers = extension.eventHandlers.get("after_tool_call");
      if (!handlers?.length) continue;
      for (const handler of handlers) {
        try {
          await handler(ctx);
        } catch (error) {
          console.error(`[extension] after_tool_call handler error in ${extension.path}:`, error);
        }
      }
    }
    return ctx.result;
  }

  private getRegisteredPhase(id: string): RegisteredPhase | undefined {
    return this.collectRegisteredPhases().get(id);
  }

  private collectRegisteredPhases(): Map<string, RegisteredPhase> {
    if (this._phaseCache) return this._phaseCache;
    const phases = new Map<string, RegisteredPhase>();
    for (const extension of this.extensions) {
      for (const [id, phase] of extension.phases) {
        if (this.validatePhaseOverride?.(id, phase.source.extensionPath)) {
          throw new Error(`External extension cannot override built-in phase: ${id}`);
        }
        if (phases.has(id)) {
          throw new Error(`Duplicate phase id: ${id}`);
        }
        phases.set(id, phase);
      }
    }
    this._phaseCache = phases;
    return phases;
  }
}
