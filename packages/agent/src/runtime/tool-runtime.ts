import type { AgentContext, AfterToolCall, BeforeToolCall, Tool } from "../types";
import type { ToolCall, ToolResult } from "../protocol";
import type { AgentId, AgentRunId } from "./domain";
import type { RuntimeStateStore } from "./store";

export type ToolRuntimePolicy = {
  /** A narrowing allow-list. It can never add a Tool to an Agent. */
  allowedTools?: readonly string[];
  maxConcurrent?: number;
  perToolMaxConcurrent?: Readonly<Record<string, number>>;
};

export type RuntimeToolExecutionInput = {
  agentId: AgentId;
  runId: AgentRunId;
  tool: Tool;
  toolCall: ToolCall;
  context: Pick<AgentContext, "skills">;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  signal?: AbortSignal;
};

type Waiter = {
  toolName: string;
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (release: () => void) => void;
  reject: (error: unknown) => void;
};

type ActiveToolCall = {
  runId: AgentRunId;
  controller: AbortController;
};

function failed(toolCall: ToolCall, message: string): ToolResult {
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    ok: false,
    content: message,
    error: message,
  };
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Tool Runtime concurrency limits must be positive finite numbers.");
  }
  return Math.floor(value);
}

/** The only executor used by managed Agents for Tool Calls. */
export class ToolRuntime {
  private readonly maxConcurrent: number;
  private readonly perToolMaxConcurrent: Readonly<Record<string, number>>;
  private running = 0;
  private readonly runningByTool = new Map<string, number>();
  private readonly waiters: Waiter[] = [];
  private readonly activeToolCalls = new Map<string, ActiveToolCall>();

  constructor(
    private readonly stateStore: RuntimeStateStore,
    policy: ToolRuntimePolicy = {},
    private readonly onTransition: () => void | Promise<void> = () => undefined,
  ) {
    this.maxConcurrent = positiveLimit(policy.maxConcurrent, Number.MAX_SAFE_INTEGER);
    this.perToolMaxConcurrent = Object.fromEntries(
      Object.entries(policy.perToolMaxConcurrent ?? {}).map(([name, value]) => [name, positiveLimit(value, 1)]),
    );
    this.allowedTools = policy.allowedTools ? new Set(policy.allowedTools) : undefined;
  }

  private readonly allowedTools?: Set<string>;

  async execute(input: RuntimeToolExecutionInput): Promise<ToolResult> {
    const call = await this.stateStore.createToolCall({
      agentId: input.agentId,
      runId: input.runId,
      name: input.toolCall.name,
      args: input.toolCall.args,
    });
    await this.onTransition();

    if (!input.tool || this.allowedTools && !this.allowedTools.has(input.tool.name)) {
      const result = failed(input.toolCall, `Tool ${input.toolCall.name} is not permitted by Runtime policy.`);
      await this.stateStore.completeToolCall({ toolCallId: call.id, result, state: "failed" });
      await this.onTransition();
      return result;
    }

    const before = await input.beforeToolCall?.({ tool: input.tool, args: input.toolCall.args });
    if (before && !before.allow) {
      const result = failed(input.toolCall, before.reason);
      await this.stateStore.completeToolCall({ toolCallId: call.id, result, state: "failed" });
      await this.onTransition();
      return result;
    }

    let release: (() => void) | undefined;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    this.activeToolCalls.set(call.id, { runId: input.runId, controller });
    try {
      try {
        release = await this.acquire(input.tool.name, controller.signal);
      } catch (error) {
        const result = failed(input.toolCall, error instanceof Error ? error.message : "Tool execution was cancelled.");
        await this.stateStore.completeToolCall({ toolCallId: call.id, result, state: "failed" });
        await this.onTransition();
        return result;
      }
      if (controller.signal.aborted) {
        const result = failed(input.toolCall, "Tool execution was aborted before it started.");
        await this.stateStore.completeToolCall({ toolCallId: call.id, result, state: "failed" });
        await this.onTransition();
        return result;
      }
      await this.stateStore.startToolCall(call.id);
      await this.onTransition();
      let result: ToolResult;
      try {
        result = await input.tool.execute(input.toolCall.args, {
          skills: input.context.skills,
          toolCallId: call.id,
        }, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          await this.stateStore.markToolCallIndeterminate({
            toolCallId: call.id,
            reason: error instanceof Error ? error.message : "Tool execution was interrupted.",
          });
          await this.onTransition();
          return failed(input.toolCall, "Tool Call became indeterminate after abort.");
        }
        result = failed(input.toolCall, error instanceof Error ? error.message : "Tool execution failed.");
      }
      if (controller.signal.aborted) {
        await this.stateStore.markToolCallIndeterminate({ toolCallId: call.id, reason: "Tool execution was interrupted after it may have had an external effect." });
        await this.onTransition();
        return failed(input.toolCall, "Tool Call became indeterminate after abort.");
      }
      try {
        result = await input.afterToolCall?.({ tool: input.tool, result }) ?? result;
      } catch (error) {
        result = failed(input.toolCall, error instanceof Error ? error.message : "Tool result review failed.");
      }
      await this.stateStore.completeToolCall({
        toolCallId: call.id,
        result,
        state: result.ok ? "completed" : "failed",
      });
      await this.onTransition();
      return result;
    } finally {
      input.signal?.removeEventListener("abort", forwardAbort);
      this.activeToolCalls.delete(call.id);
      release?.();
    }
  }

  abortRun(runId: AgentRunId): void {
    for (const active of this.activeToolCalls.values()) {
      if (active.runId === runId) active.controller.abort("Agent Run aborted.");
    }
  }

  private async acquire(toolName: string, signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw new Error("Tool execution aborted while waiting for capacity.");
    const limit = this.perToolMaxConcurrent[toolName] ?? this.maxConcurrent;
    if (this.running < this.maxConcurrent && (this.runningByTool.get(toolName) ?? 0) < limit) {
      return this.reserve(toolName);
    }
    return new Promise<() => void>((resolve, reject) => {
      let waiter!: Waiter;
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Tool execution aborted while waiting for capacity."));
      };
      waiter = { toolName, signal, onAbort, resolve, reject };
      this.waiters.push(waiter);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private reserve(toolName: string): () => void {
    this.running += 1;
    this.runningByTool.set(toolName, (this.runningByTool.get(toolName) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running -= 1;
      const count = (this.runningByTool.get(toolName) ?? 1) - 1;
      if (count <= 0) this.runningByTool.delete(toolName);
      else this.runningByTool.set(toolName, count);
      this.pumpWaiters();
    };
  }

  private pumpWaiters(): void {
    for (let index = 0; index < this.waiters.length; index += 1) {
      const waiter = this.waiters[index]!;
      const limit = this.perToolMaxConcurrent[waiter.toolName] ?? this.maxConcurrent;
      if (this.running >= this.maxConcurrent || (this.runningByTool.get(waiter.toolName) ?? 0) >= limit) continue;
      this.waiters.splice(index, 1);
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(this.reserve(waiter.toolName));
      index -= 1;
    }
  }
}
