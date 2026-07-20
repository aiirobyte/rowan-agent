/**
 * @module extensions/hooks
 *
 * Type-safe hook system
 *
 * ## Overview
 *
 * The hook system allows extensions to intercept and modify Agent behavior at specific points.
 *
 * ## Hook Categories
 *
 * ### Modifiable (return result to change behavior)
 *
 * | Hook | Return | Effect |
 * |------|--------|--------|
 * | `before_phase` | `{ abort?, skip?, input? }` | Abort, skip, or modify phase input |
 * | `after_phase` | `{ abort?, retry?, output? }` | Abort, retry, or replace phase output |
 * | `before_prompt` | `{ input? }` | Modify input sent to LLM |
 * | `before_tool_call` | `{ allow, reason? }` | Allow/block tool execution |
 * | `after_tool_call` | `{ result? }` | Modify tool execution result |
 *
 * ### Listen-only (return void)
 *
 * | Hook | Trigger |
 * |------|---------|
 * | `agent_start` | Agent starts |
 * | `agent_end` | Agent ends |
 * | `turn_start` | Conversation turn starts |
 * | `turn_end` | Conversation turn ends |
 * | `message_start` | Message streaming starts |
 * | `message_update` | Message streaming update |
 * | `message_end` | Message completes |
 * | `tool_execution_start` | Tool execution starts |
 * | `tool_execution_update` | Tool execution progress update |
 * | `tool_execution_end` | Tool execution completes |
 * | `queue_update` | Queue state update |
 * | `save_point` | Session save point |
 * | `abort` | Agent aborted |
 * | `settled` | Agent idle |
 *
 * ## Usage Example
 *
 * ```typescript
 * import type { ExtensionAPI } from "@rowan-agent/agent";
 *
 * export default function(api: ExtensionAPI) {
 *   // Block dangerous tools
 *   api.on("before_tool_call", (event) => {
 *     if (event.tool.name === "bash") {
 *       const cmd = (event.args as any).command;
 *       if (cmd.includes("rm -rf")) {
 *         return { allow: false, reason: "Dangerous command" };
 *       }
 *     }
 *     return { allow: true };
 *   });
 *
 *   // Inject context
 *   api.on("before_prompt", (event) => {
 *     return {
 *       input: {
 *         ...event.input,
 *         systemPrompt: event.input.systemPrompt + "\n\nExtra context",
 *       },
 *     };
 *   });
 *
 *   // Log tool calls
 *   api.on("tool_execution_end", (event) => {
 *     console.log(`Tool ${event.toolName}: ${event.result.ok ? "success" : "failed"}`);
 *   });
 * }
 * ```
 */

import type { Outcome, Tool, ToolResult } from "../types";
import type { PhaseContext, PhaseOutput } from "../harness/phases/types";
import type { AgentMessage } from "../types";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * before_phase event - triggered before phase execution
 *
 * Return `{ abort }` to abort the agent.
 * Return `{ skip: { route, message } }` to skip the phase.
 * Return `{ input }` to replace the phase input.
 */
export interface BeforePhaseEvent {
  type: "before_phase";
  /** Phase name about to execute */
  phaseId: string;
  /** Phase input */
  input: PhaseContext;
}

/**
 * after_phase event - triggered after phase execution
 *
 * Return `{ abort }` to abort the agent.
 * Return `{ retry }` to re-execute the phase with new input.
 * Return `{ output }` to replace the phase output.
 */
export interface AfterPhaseEvent {
  type: "after_phase";
  /** Phase name that completed */
  phaseId: string;
  /** Phase output */
  output: PhaseOutput;
}

/**
 * before_prompt event - triggered before building LLM request
 *
 * Return `{ input }` to replace the input sent to LLM.
 */
export interface BeforePromptEvent {
  type: "before_prompt";
  /** Current phase name */
  phaseId: string;
  /** Phase input (modifiable) */
  input: PhaseContext;
}

/**
 * before_tool_call event - triggered before tool execution
 *
 * Return `{ allow: false, reason }` to block execution.
 * Return `{ allow: true }` to allow execution.
 */
export interface BeforeToolCallEvent {
  type: "before_tool_call";
  /** Tool definition */
  tool: Tool;
  /** Tool arguments */
  args: unknown;
}

/**
 * after_tool_call event - triggered after tool execution
 *
 * Return `{ result }` to replace the tool execution result.
 */
export interface AfterToolCallEvent {
  type: "after_tool_call";
  /** Tool definition */
  tool: Tool;
  /** Tool execution result */
  result: ToolResult;
}

/**
 * agent_start event - triggered when agent starts
 */
export interface AgentStartEvent {
  type: "agent_start";
  /** Session ID */
  sessionId: string;
}

/**
 * agent_end event - triggered when agent ends
 */
export interface AgentEndEvent {
  type: "agent_end";
  /** Session ID */
  sessionId: string;
  /** Execution outcome */
  outcome: Outcome;
  /** All messages */
  messages: AgentMessage[];
}

/**
 * turn_start event - triggered when conversation turn starts
 */
export interface TurnStartEvent {
  type: "turn_start";
  /** Current message list */
  messages: AgentMessage[];
}

/**
 * turn_end event - triggered when conversation turn ends
 */
export interface TurnEndEvent {
  type: "turn_end";
  /** Message list */
  messages: AgentMessage[];
  /** Turn outcome (optional) */
  outcome?: Outcome;
}

/**
 * message_start event - triggered when message streaming starts
 */
export interface MessageStartEvent {
  type: "message_start";
  /** Message object */
  message: AgentMessage;
}

/**
 * message_update event - triggered on message streaming update
 */
export interface MessageUpdateEvent {
  type: "message_update";
  /** Message object */
  message: AgentMessage;
  /** Delta text */
  delta: string;
}

/**
 * message_end event - triggered when message completes
 */
export interface MessageEndEvent {
  type: "message_end";
  /** Message object */
  message: AgentMessage;
}

/**
 * tool_execution_start event - triggered when tool execution starts
 */
export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  args: unknown;
}

/**
 * tool_execution_update event - triggered on tool execution progress
 */
export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
}

/**
 * tool_execution_end event - triggered when tool execution completes
 */
export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool execution result */
  result: ToolResult;
}

/**
 * queue_update event - triggered on queue state update
 */
export interface QueueUpdateEvent {
  type: "queue_update";
  /** Pending message count */
  pendingCount: number;
}

/**
 * save_point event - triggered at session save point
 */
export interface SavePointEvent {
  type: "save_point";
  /** Whether there are pending mutations */
  hadPendingMutations: boolean;
}

/**
 * abort event - triggered when agent is aborted
 */
export interface AbortEvent {
  type: "abort";
  /** Abort reason */
  reason?: string;
}

/**
 * settled event - triggered when agent is idle
 */
export interface SettledEvent {
  type: "settled";
}

// ---------------------------------------------------------------------------
// Union type - all events
// ---------------------------------------------------------------------------

/** Union type of all hook events */
export type HookEvent =
  | BeforePhaseEvent
  | AfterPhaseEvent
  | BeforePromptEvent
  | BeforeToolCallEvent
  | AfterToolCallEvent
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | QueueUpdateEvent
  | SavePointEvent
  | AbortEvent
  | SettledEvent;

// ---------------------------------------------------------------------------
// Result types - hook return values
// ---------------------------------------------------------------------------

/**
 * before_phase hook return value
 *
 * - `abort`: Abort the entire agent
 * - `skip`: Skip current phase, route to specified phase
 * - `input`: Replace phase input
 */
export interface BeforePhaseResult {
  /** Abort agent */
  abort?: Outcome;
  /** Skip current phase */
  skip?: { route: string; message: string };
  /** Replace phase input */
  input?: PhaseContext;
}

/**
 * after_phase hook return value
 *
 * - `abort`: Abort the entire agent
 * - `retry`: Re-execute phase with new input
 * - `output`: Replace phase output
 */
export interface AfterPhaseResult {
  /** Abort agent */
  abort?: Outcome;
  /** Re-execute phase */
  retry?: PhaseContext;
  /** Replace phase output */
  output?: PhaseOutput;
}

/**
 * before_prompt hook return value
 *
 * - `input`: Replace input sent to LLM
 */
export interface BeforePromptResult {
  /** Replace phase input */
  input?: PhaseContext;
}

/**
 * before_tool_call hook return value
 *
 * - `allow`: Whether to allow execution
 * - `reason`: Rejection reason (when allow=false)
 */
export interface BeforeToolCallResult {
  /** Whether to allow execution */
  allow: boolean;
  /** Rejection reason */
  reason?: string;
}

/**
 * after_tool_call hook return value
 *
 * - `result`: Replace tool execution result
 */
export interface AfterToolCallResult {
  /** Replace tool execution result */
  result?: ToolResult;
}

// ---------------------------------------------------------------------------
// HookResultMap - event type to return value mapping
// ---------------------------------------------------------------------------

/**
 * Hook result mapping table.
 *
 * Defines the return type for each hook event:
 * - Modifiable hooks return specific objects
 * - Listen-only hooks return undefined
 */
export interface HookResultMap {
  before_phase: BeforePhaseResult | undefined;
  after_phase: AfterPhaseResult | undefined;
  before_prompt: BeforePromptResult | undefined;
  before_tool_call: BeforeToolCallResult | undefined;
  after_tool_call: AfterToolCallResult | undefined;
  agent_start: undefined;
  agent_end: undefined;
  turn_start: undefined;
  turn_end: undefined;
  message_start: undefined;
  message_update: undefined;
  message_end: undefined;
  tool_execution_start: undefined;
  tool_execution_update: undefined;
  tool_execution_end: undefined;
  queue_update: undefined;
  save_point: undefined;
  abort: undefined;
  settled: undefined;
}

// ---------------------------------------------------------------------------
// Event type discriminant
// ---------------------------------------------------------------------------

/** Hook event type string */
export type HookEventType = HookEvent["type"];

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

/**
 * Hook handler type.
 *
 * @typeParam K - Hook event type
 * @param event - Event object
 * @returns Result object or void
 */
export type HookHandler<K extends HookEventType> = (
  event: Extract<HookEvent, { type: K }>,
) => HookResultMap[K] | Promise<HookResultMap[K]> | void | Promise<void>;

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Hook execution error
 */
export class HookError extends Error {
  constructor(
    /** Event type that caused the error */
    public readonly eventType: string,
    message: string,
    cause?: Error,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HookError";
  }
}

// ---------------------------------------------------------------------------
// HooksManager - Hook manager
// ---------------------------------------------------------------------------

type AnyHandler = (event: any) => any;

/**
 * Type-safe hook manager.
 *
 * ## Usage
 *
 * ```typescript
 * const hooks = new HooksManager();
 *
 * // Register hook
 * hooks.on("before_tool_call", (event) => {
 *   return { allow: false, reason: "Blocked" };
 * });
 *
 * // Emit event (listen-only)
 * await hooks.emit("agent_start", { type: "agent_start", sessionId: "123" });
 *
 * // Emit event and collect result
 * const result = await hooks.emitFirst("before_tool_call", { type: "before_tool_call", tool, args });
 * ```
 */
export class HooksManager {
  private handlers = new Map<string, AnyHandler[]>();

  /**
   * Register a hook handler.
   * Handlers execute in registration order.
   *
   * @param eventType - Event type
   * @param handler - Handler function
   */
  on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler as AnyHandler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Unregister a hook handler.
   */
  off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;
    const index = handlers.indexOf(handler as AnyHandler);
    if (index >= 0) handlers.splice(index, 1);
  }

  /**
   * Clear all handlers, or clear handlers for specified event type.
   */
  clear(eventType?: HookEventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Check if there are handlers registered for specified event type.
   */
  has(eventType: HookEventType): boolean {
    const handlers = this.handlers.get(eventType);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get handler count for specified event type.
   */
  count(eventType: HookEventType): number {
    return this.handlers.get(eventType)?.length ?? 0;
  }

  /**
   * Emit event (listen-only, ignore return values).
   * Errors are collected and thrown.
   *
   * @param eventType - Event type
   * @param event - Event object
   */
  async emit<K extends HookEventType>(
    eventType: K,
    event: Extract<HookEvent, { type: K }>,
  ): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers?.length) return;

    const errors: Error[] = [];
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }),
    );

    if (errors.length > 0) {
      throw new HookError(
        eventType,
        `${errors.length} handler(s) failed for "${eventType}"`,
        errors[0],
      );
    }
  }

  /**
   * Emit event and return first non-undefined result (short-circuit).
   *
   * @param eventType - Event type
   * @param event - Event object
   * @returns First non-undefined result, or undefined
   */
  async emitFirst<K extends HookEventType>(
    eventType: K,
    event: Extract<HookEvent, { type: K }>,
  ): Promise<HookResultMap[K] | undefined> {
    const handlers = this.handlers.get(eventType);
    if (!handlers?.length) return undefined;

    for (const handler of handlers) {
      try {
        const result = await handler(event);
        if (result !== undefined) return result;
      } catch (error) {
        throw new HookError(
          eventType,
          `Handler failed for "${eventType}"`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    return undefined;
  }

  }

// ---------------------------------------------------------------------------
// Global hooks instance (optional convenience)
// ---------------------------------------------------------------------------

let _globalHooks: HooksManager | undefined;

/**
 * Get global hooks manager instance (singleton).
 */
export function getGlobalHooks(): HooksManager {
  _globalHooks ??= new HooksManager();
  return _globalHooks;
}

/**
 * Reset global hooks manager (mainly for testing).
 */
export function resetGlobalHooks(): void {
  _globalHooks = undefined;
}
