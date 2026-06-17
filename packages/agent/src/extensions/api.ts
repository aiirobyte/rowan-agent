import type {
  PhaseRegistration,
  ToolDefinition,
  ExtensionRuntime,
  ExtensionManifest,
} from "./types";
import type { EventBus } from "./event-bus";
import type { HooksManager, HookEventType, HookHandler } from "./hooks";
import type { AgentContext } from "../types";
import type { PhaseContext } from "../harness/phases/types";
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

  /** Register a custom LLM-callable tool. */
  registerTool(tool: ToolDefinition): void;

  /** Register a custom phase. */
  registerPhase(registration: PhaseRegistration): void;

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

  /** Session context — provides access to the session-level AgentContext. */
  session: {
    /** Get the current session AgentContext */
    getContext(): AgentContext;
  };

  /** Phase execution capabilities — rovides Phase In/Out, phase identity, and phase routing. */
  phase: {
    /** Phase In: get payload from previous phase */
    getPayload(): unknown;
    /** Phase Out: set payload for next phase */
    setPayload(payload: unknown): void;
    /** Phase Out: set outcome message */
    setMessage(message: string): void;
    /** Get current phase id */
    getCurrentPhase(): string;
    /** Set next phase (lower priority than PHASE.md target) */
    setNextPhase(phaseId: string): void;
    /** Get the next phase set by setNextPhase */
    getNextPhase(): string | undefined;
    /** Get the message set by setMessage */
    getMessage(): string | undefined;
  };
}

// ---------------------------------------------------------------------------
// ExtensionFactory
// ---------------------------------------------------------------------------

/**
 * Extension factory function.
 * Receives ExtensionAPI for registering hooks, phases, and providers.
 */
export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;

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
  _extensionPath?: string,
  options?: {
    registerPhase?: (registration: PhaseRegistration) => void;
    registerProvider?: (config: import("@rowan-agent/models").ProviderConfig) => void;
    unregisterProvider?: (name: string) => void;
    registerTool?: (tool: ToolDefinition) => void;
    context?: ExtensionContext;
    manifest?: ExtensionManifest;
    phase?: PhaseContext;
    session?: AgentContext;
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

  // Phase state — API holds it, runner reads after execution
  let outputPayload: unknown = phaseIn?.payload;
  let nextPhase: string | undefined;
  let outputMessage: string | undefined;

  return {
    on: (eventType, handler) => {
      assertActive();
      hooks?.on(eventType, handler);
    },
    off: (eventType, handler) => {
      assertActive();
      hooks?.off(eventType, handler);
    },
    registerTool: (tool) => {
      assertActive();
      options?.registerTool?.(tool);
    },
    registerPhase: (registration) => {
      assertActive();
      options?.registerPhase?.(registration);
    },
    registerProvider: (config) => {
      assertActive();
      options?.registerProvider?.(config);
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
    events: eventBus ?? { on: () => () => {}, off: () => {}, emit: () => {}, has: () => false, count: () => 0 },
    session: {
      getContext: () => {
        if (!options?.session) throw new Error("session.getContext() is not available in this context.");
        return options.session;
      },
    },
    phase: {
      getPayload: () => outputPayload,
      setPayload: (p) => { outputPayload = p; },
      setMessage: (msg) => { outputMessage = msg; },
      getCurrentPhase: () => phaseIn?.currentPhase ?? "",
      setNextPhase: (id) => { nextPhase = id; },
      getNextPhase: () => nextPhase,
      getMessage: () => outputMessage,
    },
  };
}
