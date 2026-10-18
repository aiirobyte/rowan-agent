import type {
  PhaseRegistration,
  SkillRegistration,
  Tool,
  ExtensionRuntime,
  ScopeRef,
  ExtensionStateStore,
  ExtensionCapabilityContribution,
} from "./types";
import type { EventBus } from "./event-bus";
import type { HooksManager, HookEventType, HookHandler } from "./hooks";
import type { PhaseRunHandler } from "../harness/phases/types";
import type { PhaseExecution } from "../loop/execution";
import type { ExtensionContext } from "./context";
import type { JsonObject, JsonValue } from "../runtime-events";
import { assertJsonValue } from "../runtime/json";
import type {
  AgentId,
  AgentListCursor,
  AgentRun,
  AgentSummary,
  ContextStatus,
  DurableConsumer,
  DurableRunEvent,
  Message,
  Page,
  RunListCursor,
  RunSnapshot,
  RunState,
  RunSummary,
  UserInput,
} from "../runtime/contracts";
import type { ProviderConfig } from "@rowan-agent/models";

// ---------------------------------------------------------------------------
// ExtensionAPI - Main API for extension developers
// ---------------------------------------------------------------------------

export type { PhaseRunHandler } from "../harness/phases/types";

export type ExtensionAgentConsumerDisposer = (() => void) & {
  readonly stop: () => void;
  readonly caughtUp: Promise<void>;
  readonly done: Promise<void>;
};

export interface ExtensionAgentsAPI {
  list(input?: { after?: AgentListCursor; limit?: number }): Promise<Page<AgentSummary, AgentListCursor>>;
  history(agentId: AgentId | string): Promise<readonly Message[]>;
  contextStatus(agentId: AgentId | string, options?: { contextWindow?: number }): Promise<ContextStatus>;
  runs(
    agentId: AgentId | string,
    filter?: { states?: readonly RunState[]; after?: RunListCursor; limit?: number },
  ): Promise<Page<RunSummary, RunListCursor>>;
  /** One Run in full, including its outcome once it ended. */
  run(runId: string): Promise<RunSnapshot>;
  runPhase(
    agentId: AgentId | string,
    options: {
      phase: string;
      payload?: JsonValue;
      input?: UserInput;
      yieldToInput?: boolean;
      idempotencyKey?: string;
    },
  ): Promise<AgentRun>;
  consume(
    consumerId: string,
    onEvent: (event: DurableRunEvent, context: Readonly<{ signal: AbortSignal }>) => void | Promise<void>,
  ): Promise<ExtensionAgentConsumerDisposer>;
}

export interface ExtensionAgentsRuntimeDelegate {
  listAgents(input?: { after?: AgentListCursor; limit?: number }): Promise<Page<AgentSummary, AgentListCursor>>;
  history(agentId: AgentId): Promise<readonly Message[]>;
  contextStatus(agentId: AgentId, options?: { contextWindow?: number }): Promise<ContextStatus>;
  listRuns(input?: { agentId?: AgentId; states?: readonly RunState[]; after?: RunListCursor; limit?: number }): Promise<Page<RunSummary, RunListCursor>>;
  snapshot(runId: RunSnapshot["runId"]): Promise<RunSnapshot>;
  runPhase(agentId: AgentId, options: {
    phase: string;
    payload?: JsonValue;
    input?: UserInput;
    yieldToInput?: boolean;
    idempotencyKey?: string;
  }): Promise<AgentRun>;
  consume(input: {
    consumerId: string;
    signal: AbortSignal;
    onEvent(event: DurableRunEvent, context: Readonly<{ signal: AbortSignal }>): void | Promise<void>;
  }): Promise<DurableConsumer>;
}

/**
 * Extension API object passed to extension factory function.
 *
 * @example
 * ```typescript
 * export default function(api: ExtensionAPI) {
 *   // api provides all extension APIs
 * }
 * ```
 */
export interface ExtensionAPI {
  /** Hook events — subscribe or unsubscribe. */
  hooks: {
    /**
     * Subscribe to a hook event.
     *
     * @param eventType - Hook type, e.g. "before_tool_call"
     * @param handler - Hook handler, can return result to modify behavior
     */
    on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

    /** Unsubscribe from a hook event. */
    off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;
  };

  /** Extension configuration — read own layered config or listen for changes. */
  config: {
    /** Get the extension's own effective configuration block. */
    get(scope?: ScopeRef): Promise<JsonObject | null>;
    /** Listen for configuration changes for a scope. */
    changed(handler: (scope: ScopeRef) => void): void;
  };

  /** Extension state — scoped to run (in-memory) or agent (durable) or global (durable). */
  state: {
    /** Run-scoped in-memory state; dropped when the Run ends. */
    run(runId: string): ExtensionStateStore;
    /** Agent-scoped durable state; persisted with the Agent record. */
    agent(agentId: string): ExtensionStateStore;
    /** Extension-scoped durable state; survives process restarts. */
    global(): ExtensionStateStore;
  };

  /** Tool capabilities — register and unregister custom tools. */
  tools: {
    /** Register a custom LLM-callable tool. */
    register(tool: Tool, scope?: ScopeRef): Promise<void>;
    /** Unregister a previously registered tool by name. */
    unregister(toolName: string, scope?: ScopeRef): Promise<void>;
  };

  /** Skill capabilities — register and unregister standalone skills. */
  skills: {
    /** Register a Skill directory (containing SKILL.md) or a Skill object. Registering an existing name replaces it. */
    register(skill: SkillRegistration, scope?: ScopeRef): Promise<void>;
    /** Unregister a previously registered Skill by name. */
    unregister(skillName: string, scope?: ScopeRef): Promise<void> | void;
  };

  /** Phase capabilities — register, unregister, and execute. */
  phases: {
    /** Register a Phase directory bundle or Phase object. */
    register(phase: PhaseRegistration, scope?: ScopeRef): Promise<void>;
    /** Unregister a previously registered phase by name. */
    unregister(phaseName: string, scope?: ScopeRef): Promise<void> | void;
    /** Set the Phase's execution handler. Only available within an Extension Phase factory. */
    execute(handler: PhaseRunHandler): void;
  };

  /** Model provider registration. */
  models: {
    /** Register a model provider. Registering with an existing id replaces it. */
    registerProvider(config: ProviderConfig): void;
    /** Unregister a model provider by id. */
    unregisterProvider(id: string): void;
  };

  /** Runtime Agent control and consumption. Delegates to the AgentRuntime the Extension is activated in. */
  agents: ExtensionAgentsAPI;

  /** Shared event bus for inter-extension communication. */
  events: EventBus;

  /** Capability contributions — advertise tools or features to the host. */
  capabilities: {
    /** Contribute a capability to the host. Returns a disposer to remove the contribution. */
    contribute(contribution: ExtensionCapabilityContribution): () => void;
  };

  /** Runtime context — cwd, signal, exec. */
  context: ExtensionContext;
}

// ---------------------------------------------------------------------------
// ExtensionFactory
// ---------------------------------------------------------------------------

/**
 * Extension factory function.
 * Receives ExtensionAPI for registering hooks, phases, and providers.
 */
export type ExtensionDisposer = () => void | Promise<void>;
export type ExtensionFactoryResult = void | ExtensionDisposer;
export type ExtensionFactory = (api: ExtensionAPI) => ExtensionFactoryResult | Promise<ExtensionFactoryResult>;

// ---------------------------------------------------------------------------
// createExtensionAPI
// ---------------------------------------------------------------------------

export interface CreateExtensionAPIOptions {
  registerPhase?: (registration: PhaseRegistration, scope?: ScopeRef) => Promise<void>;
  unregisterPhase?: (phaseName: string, scope?: ScopeRef) => void | Promise<void>;
  registerSkill?: (registration: SkillRegistration, scope?: ScopeRef) => Promise<void>;
  unregisterSkill?: (skillName: string, scope?: ScopeRef) => void | Promise<void>;
  registerProvider?: (config: ProviderConfig) => void;
  unregisterProvider?: (id: string) => void;
  registerTool?: (tool: Tool, scope?: ScopeRef) => void | Promise<void>;
  unregisterTool?: (toolName: string, scope?: ScopeRef) => void | Promise<void>;
  context?: ExtensionContext;
  trackCleanup?: (cleanup: () => void | Promise<void>) => void;
  config?: {
    get: (scope?: ScopeRef) => Promise<JsonObject | null>;
    changed: (handler: (scope: ScopeRef) => void) => void;
  };
  state?: {
    run: (runId: string) => ExtensionStateStore;
    agent: (agentId: string) => ExtensionStateStore;
    global: () => ExtensionStateStore;
  };
  contributeCapability?: (contribution: ExtensionCapabilityContribution) => () => void;
  namespaces?: Readonly<Record<string, unknown>>;
  runtimeAgents?: ExtensionAgentsRuntimeDelegate;
  isExtensionPhase?: boolean;
  onExecute?: (handler: PhaseRunHandler) => void;
}

/**
 * @internal
 * Create ExtensionAPI instance.
 */
export function createExtensionAPI(
  hooks?: HooksManager,
  options?: CreateExtensionAPIOptions,
  runtime?: ExtensionRuntime,
  eventBus?: EventBus,
): ExtensionAPI {
  const assertActive = () => runtime?.assertActive?.();

  const noopContext: ExtensionContext = {
    cwd: "",
    signal: undefined,
    exec: async () => ({ exitCode: 1, stdout: "", stderr: "not available" }),
  };

  const ctx = options?.context ?? noopContext;
  const trackCleanup = options?.trackCleanup;
  const agentsDelegate = options?.runtimeAgents;

  const api: ExtensionAPI = {
    hooks: {
      on: (eventType, handler) => {
        assertActive();
        hooks?.on(eventType, handler);
        trackCleanup?.(() => hooks?.off(eventType, handler));
      },
      off: (eventType, handler) => {
        assertActive();
        hooks?.off(eventType, handler);
      },
    },
    config: {
      get: async (scope) => {
        assertActive();
        return (await options?.config?.get(scope)) ?? null;
      },
      changed: (handler) => {
        assertActive();
        options?.config?.changed(handler);
      },
    },
    state: {
      run: (runId) => {
        assertActive();
        const store = options?.state?.run(runId);
        return {
          get: async (key) => {
            assertActive();
            return store?.get(key);
          },
          set: async (key, value) => {
            assertActive();
            assertJsonValue(value);
            return store?.set(key, value);
          },
          delete: async (key) => {
            assertActive();
            return store?.delete(key);
          },
        };
      },
      agent: (agentId) => {
        assertActive();
        const store = options?.state?.agent(agentId);
        return {
          get: async (key) => {
            assertActive();
            return store?.get(key);
          },
          set: async (key, value) => {
            assertActive();
            assertJsonValue(value);
            return store?.set(key, value);
          },
          delete: async (key) => {
            assertActive();
            return store?.delete(key);
          },
        };
      },
      global: () => {
        assertActive();
        const store = options?.state?.global();
        return {
          get: async (key) => {
            assertActive();
            return store?.get(key);
          },
          set: async (key, value) => {
            assertActive();
            assertJsonValue(value);
            return store?.set(key, value);
          },
          delete: async (key) => {
            assertActive();
            return store?.delete(key);
          },
        };
      },
    },
    tools: {
      register: (tool, scope) => {
        assertActive();
        return Promise.resolve(options?.registerTool?.(tool, scope));
      },
      unregister: (toolName, scope) => {
        assertActive();
        return Promise.resolve(options?.unregisterTool?.(toolName, scope));
      },
    },
    skills: {
      register: async (skill, scope) => {
        assertActive();
        await options?.registerSkill?.(skill, scope);
      },
      unregister: (skillName, scope) => {
        assertActive();
        return options?.unregisterSkill?.(skillName, scope);
      },
    },
    phases: {
      register: async (registration, scope) => {
        assertActive();
        await options?.registerPhase?.(registration, scope);
      },
      unregister: (phaseName, scope) => {
        assertActive();
        return options?.unregisterPhase?.(phaseName, scope);
      },
      execute: (handler) => {
        assertActive();
        if (!options?.isExtensionPhase) {
          throw new Error("api.phases.execute is only available inside an Extension Phase.");
        }
        if (typeof handler !== "function") {
          throw new TypeError("api.phases.execute requires a handler function.");
        }
        options.onExecute?.(handler);
      },
    },
    models: {
      registerProvider: (config) => {
        assertActive();
        options?.registerProvider?.(config);
        trackCleanup?.(() => options?.unregisterProvider?.(config.id));
      },
      unregisterProvider: (id) => {
        assertActive();
        options?.unregisterProvider?.(id);
      },
    },
    agents: {
      list: async (input) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.listAgents(input);
      },
      history: async (agentId) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.history(agentId as AgentId);
      },
      contextStatus: async (agentId, opt) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.contextStatus(agentId as AgentId, opt);
      },
      runs: async (agentId, filter) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.listRuns({ agentId: agentId as AgentId, ...filter });
      },
      run: async (runId) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.snapshot(runId as RunSnapshot["runId"]);
      },
      runPhase: async (agentId, runOpt) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        return agentsDelegate.runPhase(agentId as AgentId, runOpt);
      },
      consume: async (consumerId, onEvent) => {
        assertActive();
        if (!agentsDelegate) throw new Error("AgentRuntime is not available in this extension context.");
        const controller = new AbortController();
        const consumer = await agentsDelegate.consume({
          consumerId,
          signal: controller.signal,
          onEvent,
        });
        let stopped = false;
        const stop = () => {
          if (stopped) return;
          stopped = true;
          controller.abort();
          consumer.stop();
        };
        trackCleanup?.(stop);
        return Object.assign(stop, {
          stop,
          caughtUp: consumer.caughtUp,
          done: consumer.done,
        });
      },
    },
    events: eventBus
      ? {
        on: (event, listener) => {
          const unsubscribe = eventBus.on(event, listener);
          trackCleanup?.(unsubscribe);
          return unsubscribe;
        },
        off: (event) => eventBus.off(event),
        emit: (event, ...args) => eventBus.emit(event, ...args),
        has: (event) => eventBus.has(event),
        count: (event) => eventBus.count(event),
      }
      : { on: () => () => {}, off: () => {}, emit: () => {}, has: () => false, count: () => 0 },
    capabilities: {
      contribute: (contribution) => {
        assertActive();
        if (!contribution || typeof contribution !== "object") {
          throw new TypeError("Capability contribution must be an object.");
        }
        if (contribution.kind !== "tool") {
          throw new TypeError(`Unsupported capability contribution kind: "${(contribution as any).kind}".`);
        }
        if (typeof contribution.name !== "string" || contribution.name.trim() === "") {
          throw new TypeError("Capability contribution requires a non-empty name.");
        }
        if (typeof contribution.description !== "string") {
          throw new TypeError("Capability contribution requires a description string.");
        }
        return options?.contributeCapability ? options.contributeCapability(contribution) : () => {};
      },
    },
    context: ctx,
  };

  if (options?.namespaces) {
    for (const [key, value] of Object.entries(options.namespaces)) {
      if (key in api) {
        throw new Error(`Host API namespace collision: "${key}" is a built-in API key.`);
      }
      Object.defineProperty(api, key, { value, enumerable: true });
    }
  }

  return api;
}
