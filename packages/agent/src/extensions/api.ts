import type {
  PhaseRegistration,
  ToolDefinition,
  ExtensionRuntime,
  ExtensionManifest,
} from "./types";
import type { EventBus } from "./event-bus";
import type { HooksManager, HookEventType, HookHandler } from "./hooks";
import type {
  PhaseContext,
  PhaseSettingsProvider,
} from "../harness/phases/types";
import type { ExtensionContext, ExtensionUtils } from "./context";

// ---------------------------------------------------------------------------
// ExtensionAPI - Main API for extension developers
// ---------------------------------------------------------------------------

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
  /**
   * Subscribe to a hook event.
   *
   * @param eventType - Hook type, e.g. "before_tool_call"
   * @param handler - Hook handler, can return result to modify behavior
   */
  on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

  /** Unsubscribe from a hook event. */
  off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void;

  /** Tool capabilities — register and unregister custom tools. */
  tool: {
    /** Register a custom LLM-callable tool. */
    register(tool: ToolDefinition): void;
    /** Unregister a previously registered tool by name. */
    unregister(toolName: string): void;
  };

  /** Register a model provider. */
  registerProvider(config: import("@rowan-agent/models").ProviderConfig): void;

  /** Unregister a model provider. */
  unregisterProvider(name: string): void;

  /** Extension manifest from package.json `rowan` field. */
  manifest?: ExtensionManifest;

  /** Utility functions. */
  utils: ExtensionUtils;

  /** Runtime context — cwd, signal, exec, message access, etc. */
  context: ExtensionContext;

  /** Shared event bus for inter-extension communication. */
  events: EventBus;

  /** Phase execution capabilities — provides Phase In/Out, phase identity, phase routing, and registration. */
  phase: {
    /** Register a Phase directory bundle or Phase object. */
    register(phase: PhaseRegistration): Promise<void>;
    /** Unregister a previously registered phase by name. */
    unregister(phaseName: string): void;
    /** Phase In: get payload from previous phase */
    getPayload(): unknown;
    /** Phase Out: set payload for next phase */
    setPayload(payload: unknown): void;
    /** Phase Out: set outcome message */
    setMessage(message: string): void;
    /** Get current phase name */
    getCurrentPhase(): string;
    /** Set next phase (lower priority than PHASE.md target) */
    setNextPhase(phaseName: string): void;
    /** Get the next phase set by setNextPhase */
    getNextPhase(): string | undefined;
    /** Get the message set by setMessage */
    getMessage(): string | undefined;
    /** Phase Settings contributions registered by the Phase extension. */
    settings: {
      register(provider: PhaseSettingsProvider): void;
    };
  };
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

/**
 * @internal
 * Create ExtensionAPI instance.
 * Works for both extension context (with hooks/runtime/eventBus) and phase context (without).
 */
export function createExtensionAPI(
  hooks?: HooksManager,
  options?: {
    registerPhase?: (registration: PhaseRegistration) => Promise<void>;
    unregisterPhase?: (phaseName: string) => void;
    registerProvider?: (config: import("@rowan-agent/models").ProviderConfig) => void;
    unregisterProvider?: (name: string) => void;
    registerTool?: (tool: ToolDefinition) => void;
    unregisterTool?: (toolName: string) => void;
    registerSettings?: (provider: PhaseSettingsProvider) => void;
    context?: ExtensionContext;
    manifest?: ExtensionManifest;
    phase?: PhaseContext;
    trackCleanup?: (cleanup: () => void | Promise<void>) => void;
  },
  runtime?: ExtensionRuntime,
  eventBus?: EventBus,
): ExtensionAPI {
  let idCounter = 0;
  const createId = (prefix: string): string => {
    idCounter++;
    return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
  };

  const formatJson = (value: unknown): string => {
    try {
      return JSON.stringify(value, null, 2) ?? "undefined";
    } catch {
      return "[unserializable]";
    }
  };

  const assertActive = () => runtime?.assertActive?.();

  const noopContext: ExtensionContext = {
    cwd: "",
    signal: undefined,
    isIdle: () => false,
    abort: () => {},
    exec: async () => ({ exitCode: 1, stdout: "", stderr: "not available" }),
  };

  const ctx = options?.context ?? noopContext;
  const phaseIn = options?.phase;
  const trackCleanup = options?.trackCleanup;

  // Phase state — API holds it, runner reads after execution
  let outputPayload: unknown = phaseIn?.state?.payload;
  let nextPhase: string | undefined;
  let outputMessage: string | undefined;
  let settingsProvider: PhaseSettingsProvider | undefined;

  return {
    on: (eventType, handler) => {
      assertActive();
      hooks?.on(eventType, handler);
      trackCleanup?.(() => hooks?.off(eventType, handler));
    },
    off: (eventType, handler) => {
      assertActive();
      hooks?.off(eventType, handler);
    },
    tool: {
      register: (tool) => {
        assertActive();
        options?.registerTool?.(tool);
      },
      unregister: (toolName) => {
        assertActive();
        options?.unregisterTool?.(toolName);
      },
    },
    registerProvider: (config) => {
      assertActive();
      options?.registerProvider?.(config);
      trackCleanup?.(() => options?.unregisterProvider?.(config.id));
    },
    unregisterProvider: (name) => {
      assertActive();
      options?.unregisterProvider?.(name);
    },
    manifest: options?.manifest,
    utils: {
      createId,
      formatJson,
    },
    context: ctx,
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
    phase: {
      register: async (registration) => {
        assertActive();
        await options?.registerPhase?.(registration);
      },
      unregister: (phaseName) => {
        assertActive();
        options?.unregisterPhase?.(phaseName);
      },
      getPayload: () => outputPayload,
      setPayload: (p) => { outputPayload = p; },
      setMessage: (msg) => { outputMessage = msg; },
      getCurrentPhase: () => phaseIn?.state?.current ?? "",
      setNextPhase: (id) => { nextPhase = id; },
      getNextPhase: () => nextPhase,
      getMessage: () => outputMessage,
      settings: {
        register: (provider) => {
          assertActive();
          if (typeof provider !== "function") {
            throw new Error("Phase Settings registration requires a provider function.");
          }
          if (settingsProvider) {
            throw new Error("A Phase may register only one Settings provider.");
          }
          settingsProvider = provider;
          options?.registerSettings?.(provider);
        },
      },
    },
  };
}
