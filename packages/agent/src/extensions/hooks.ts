import type { Outcome, Tool, ToolResult } from "../types";
import type { PhaseContext, PhaseOutput } from "../harness/phases/types";

export interface BeforePhaseEvent {
  type: "before_phase";
  phaseId: string;
  input: PhaseContext;
}

export interface AfterPhaseEvent {
  type: "after_phase";
  phaseId: string;
  output: PhaseOutput;
}

export interface BeforePromptEvent {
  type: "before_prompt";
  phaseId: string;
  input: PhaseContext;
}

export interface BeforeToolCallEvent {
  type: "before_tool_call";
  tool: Tool;
  args: unknown;
}

export interface AfterToolCallEvent {
  type: "after_tool_call";
  tool: Tool;
  result: ToolResult;
}

export type HookEvent =
  | BeforePhaseEvent
  | AfterPhaseEvent
  | BeforePromptEvent
  | BeforeToolCallEvent
  | AfterToolCallEvent;

export interface BeforePhaseResult {
  abort?: Outcome;
  skip?: { route: string; message: string };
  input?: PhaseContext;
}

export interface AfterPhaseResult {
  abort?: Outcome;
  retry?: PhaseContext;
  output?: PhaseOutput;
}

export interface BeforePromptResult {
  input?: PhaseContext;
}

export interface BeforeToolCallResult {
  allow: boolean;
  reason?: string;
}

export interface AfterToolCallResult {
  result?: ToolResult;
}

export interface HookResultMap {
  before_phase: BeforePhaseResult | undefined;
  after_phase: AfterPhaseResult | undefined;
  before_prompt: BeforePromptResult | undefined;
  before_tool_call: BeforeToolCallResult | undefined;
  after_tool_call: AfterToolCallResult | undefined;
}

export type HookEventType = HookEvent["type"];
export type HookHandler<K extends HookEventType> = (
  event: Extract<HookEvent, { type: K }>,
) => HookResultMap[K] | Promise<HookResultMap[K]> | void | Promise<void>;

export class HookError extends Error {
  constructor(
    public readonly eventType: string,
    message: string,
    cause?: Error,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HookError";
  }
}

type AnyHandler = (event: unknown) => unknown;

export class HooksManager {
  private handlers = new Map<HookEventType, AnyHandler[]>();

  on<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler as AnyHandler);
    this.handlers.set(eventType, handlers);
  }

  off<K extends HookEventType>(eventType: K, handler: HookHandler<K>): void {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;
    const index = handlers.indexOf(handler as AnyHandler);
    if (index >= 0) handlers.splice(index, 1);
  }

  async emit<K extends HookEventType>(
    eventType: K,
    event: Extract<HookEvent, { type: K }>,
  ): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers?.length) return;
    const results = await Promise.allSettled(handlers.map((handler) => handler(event)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      throw new HookError(
        eventType,
        `${results.filter((result) => result.status === "rejected").length} handler(s) failed for "${eventType}"`,
        failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason)),
      );
    }
  }

  async emitFirst<K extends HookEventType>(
    eventType: K,
    event: Extract<HookEvent, { type: K }>,
  ): Promise<HookResultMap[K] | undefined> {
    const handlers = this.handlers.get(eventType);
    if (!handlers?.length) return undefined;
    for (const handler of handlers) {
      try {
        const result = await handler(event);
        if (result !== undefined) return result as HookResultMap[K];
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
