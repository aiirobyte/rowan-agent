import Schema from "typebox/schema";
import {
  createMessage,
  type AgentMessage,
  type Session as CoreSession,
} from "@rowan-agent/session";
import {
  createDirectOutcome,
  createFailedOutcome,
  createOutcome,
  parseTask,
  parseTaskRoutingDecision,
  parseVerificationResult,
} from "./task";
import { scheduleTaskRouting } from "./scheduler";
import type {
  AgentEvent,
  AgentLoopInput,
  ErrorInfo,
  LlmPhase,
  ModelStreamEvent,
  Outcome,
  AgentBudgetUsage,
  Task,
  TaskRoutingDecision,
  Tool,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "./types";
import { createId, nowIso, Validators } from "./types";

type AgentSession = CoreSession<AgentEvent>;
type AgentSessionSnapshot = Omit<CoreSession<unknown>, "log" | "messages" | "createdAt" | "updatedAt">;

type AgentLoopRuntime = AgentLoopInput & {
  messageTrace: AgentMessage[];
  budgetUsage: AgentBudgetUsage;
};

class BudgetExceededError extends Error {
  readonly resource: keyof AgentBudgetUsage;
  readonly limit: number;
  readonly usage: AgentBudgetUsage;

  constructor(input: { resource: keyof AgentBudgetUsage; limit: number; usage: AgentBudgetUsage }) {
    const label = input.resource === "modelCalls" ? "model calls" : "tool calls";
    super(`Agent run exceeded ${label} budget (${input.usage[input.resource]}/${input.limit}).`);
    this.name = "BudgetExceededError";
    this.resource = input.resource;
    this.limit = input.limit;
    this.usage = { ...input.usage };
  }
}

async function emit(input: AgentLoopRuntime, event: AgentEvent): Promise<void> {
  input.session.log.push(event);
  input.session.updatedAt = event.ts;
  await input.emit?.(event);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function detailsFromError(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const details = error.details;
  const normalizedDetails = isRecord(details) ? { ...details } : {};
  const status = typeof error.status === "number" ? error.status : undefined;
  const name = asString(error.name);

  if (status !== undefined) {
    normalizedDetails.status = status;
  }
  if (name && name !== "Error") {
    normalizedDetails.name = name;
  }

  return Object.keys(normalizedDetails).length > 0 ? normalizedDetails : undefined;
}

function makeError(error: unknown): ErrorInfo {
  const record = isRecord(error) ? error : undefined;
  const code = asString(record?.code) ?? "agent_loop_failed";
  const message = error instanceof Error ? error.message : error === undefined ? "Agent loop failed." : String(error);
  const retryable = asBoolean(record?.retryable) ?? false;
  const details = detailsFromError(error);

  return {
    code,
    message,
    retryable,
    ...(details ? { details } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isInvalidModelSchemaError(error: unknown): boolean {
  return errorCode(error) === "invalid_model_schema";
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent run aborted.");
  }
}

function snapshotSession(session: AgentSession): AgentSessionSnapshot {
  return {
    version: session.version,
    id: session.id,
    ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
    systemPrompt: session.systemPrompt,
    userInput: session.userInput,
    skills: session.skills,
    ...(session.title ? { title: session.title } : {}),
  };
}

function cloneBudgetUsage(usage: AgentBudgetUsage): AgentBudgetUsage {
  return {
    modelCalls: usage.modelCalls,
    toolCalls: usage.toolCalls,
  };
}

function budgetLimit(
  input: AgentLoopRuntime,
  resource: keyof AgentBudgetUsage,
): number | undefined {
  return resource === "modelCalls" ? input.budget?.maxModelCalls : input.budget?.maxToolCalls;
}

function consumeBudget(
  input: AgentLoopRuntime,
  resource: keyof AgentBudgetUsage,
): BudgetExceededError | undefined {
  input.budgetUsage[resource] += 1;
  const limit = budgetLimit(input, resource);

  if (limit !== undefined && input.budgetUsage[resource] > limit) {
    return new BudgetExceededError({
      resource,
      limit,
      usage: cloneBudgetUsage(input.budgetUsage),
    });
  }

  return undefined;
}

function createBudgetExceededOutcome(error: BudgetExceededError, task?: Task): Outcome {
  return Validators.outcome.Parse({
    id: createId("out"),
    ...(task ? { taskId: task.id } : {}),
    passed: false,
    message: error.message,
  });
}

function createInvalidModelVerification(_task: Task, _error: unknown): VerificationResult {
  const message = "Model returned invalid verification output.";
  return Validators.verificationResult.Parse({
    passed: false,
    message,
  });
}

function createInvalidExecuteToolResult(error: unknown): ToolResult {
  return Validators.toolResult.Parse({
    toolCallId: createId("call"),
    toolName: "model.execute",
    ok: false,
    content: null,
    error: errorMessage(error),
  });
}

function snapshotMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    ...(message.metadata ? { metadata: { ...message.metadata } } : {}),
  };
}

function snapshotMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(snapshotMessage);
}

async function emitMessageStart(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "message_start",
    content: snapshotMessages(input.messageTrace),
    ts: nowIso(),
  });
}

async function appendTraceMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.messageTrace.push(message);
  await emit(input, {
    type: "message_delta",
    delta: snapshotMessage(message),
    ts: nowIso(),
  });
}

async function appendSessionMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.session.messages.push(message);
  await appendTraceMessage(input, message);
}

async function emitMessageEnd(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "message_end",
    content: snapshotMessages(input.messageTrace),
    ts: nowIso(),
  });
}

async function collectTextAndStructured(input: {
  loop: AgentLoopRuntime;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: LlmPhase;
  recordText?: boolean;
}): Promise<{ text: string; structured?: unknown; toolCalls: ToolCall[] }> {
  const toolCalls: ToolCall[] = [];
  let text = "";
  let flushedText = "";
  let structured: unknown;
  const flushText = async () => {
    if (text.length === 0) {
      return;
    }

    flushedText += text;
    if (input.recordText === false) {
      text = "";
      return;
    }
    await appendSessionMessage(
      input.loop,
      createMessage("assistant", text, { kind: "model_message", phase: input.metadataPhase }),
    );
    text = "";
  };

  for await (const event of input.events) {
    assertNotAborted(input.loop.signal);

    if (event.type === "model_call") {
      const budgetError = consumeBudget(input.loop, "modelCalls");
      await emit(input.loop, {
        type: "model_call",
        phase: event.phase,
        model: event.model,
        usage: event.usage,
        ts: nowIso(),
      });
      if (budgetError) {
        throw budgetError;
      }
    }

    if (event.type === "text_delta") {
      text += event.text;
    }

    if (event.type === "structured_output") {
      await flushText();
      structured = event.content;
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
      await emit(input.loop, {
        type: "tool_call_requested",
        toolCall,
        ts: nowIso(),
      });
    }

    if (event.type === "done") {
      await flushText();
    }
  }

  await flushText();

  return { text: flushedText, structured, toolCalls };
}

async function planTask(input: AgentLoopRuntime): Promise<{ task: Task; text: string }> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(input.model, { phase: "plan", session: input.session }, { signal: input.signal }),
    metadataPhase: "plan",
  });

  if (!collected.structured) {
    throw new Error("Planner did not produce a structured task.");
  }

  return { task: parseTask(collected.structured), text: collected.text };
}

async function routeRequest(input: AgentLoopRuntime): Promise<TaskRoutingDecision & { text: string }> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(input.model, { phase: "route", session: input.session }, { signal: input.signal }),
    metadataPhase: "route",
    recordText: false,
  });

  if (!collected.structured) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const decision = scheduleTaskRouting({
    userInput: input.session.userInput,
    tools: input.tools,
    decision: parseTaskRoutingDecision(collected.structured),
  });
  await appendSessionMessage(
    input,
    createMessage("assistant", JSON.stringify(decision), { kind: "routing_decision", phase: "route" }),
  );
  return { ...decision, text: decision.message };
}

function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

async function executeToolCall(input: {
  loop: AgentLoopRuntime;
  task: Task;
  toolCall: ToolCall;
}): Promise<ToolResult> {
  const tool = findTool(input.loop.tools, input.toolCall.name);
  if (!tool) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: `Unknown tool: ${input.toolCall.name}`,
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: input.toolCall.name,
      result,
      ts: nowIso(),
    });
    return result;
  }

  let args: unknown;
  try {
    args = Schema.Compile(tool.parameters).Parse(input.toolCall.args);
  } catch (error) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : "Invalid tool arguments.",
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: input.toolCall.name,
      result,
      ts: nowIso(),
    });
    return result;
  }

  let decision: Awaited<ReturnType<NonNullable<AgentLoopInput["beforeToolCall"]>>> | undefined;
  if (input.loop.beforeToolCall) {
    await emit(input.loop, {
      type: "tool_call_approval_requested",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      ts: nowIso(),
    });
    decision = await input.loop.beforeToolCall({ task: input.task, tool, args });
    await emit(input.loop, {
      type: "tool_call_approval_result",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      decision: decision ?? { allow: true },
      ts: nowIso(),
    });
  }

  if (decision && !decision.allow) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: tool.name,
      ok: false,
      content: null,
      error: decision.reason,
    };
    await emit(input.loop, {
      type: "tool_call_blocked",
      toolName: tool.name,
      reason: decision.reason,
      ts: nowIso(),
    });
    return result;
  }

  const budgetError = consumeBudget(input.loop, "toolCalls");
  if (budgetError) {
    throw budgetError;
  }

  await emit(input.loop, {
    type: "tool_call_start",
    toolName: tool.name,
    args,
    ts: nowIso(),
  });

  try {
    const toolContext = {
      session: input.loop.session,
      task: input.task,
      toolCallId: input.toolCall.id,
      ...(input.loop.runSubSession ? { runSubSession: input.loop.runSubSession } : {}),
    };
    const rawResult = await tool.execute(
      args,
      toolContext,
      input.loop.signal,
    );
    const normalized = Validators.toolResult.Parse({
      ...rawResult,
      toolCallId: input.toolCall.id,
      toolName: tool.name,
    });
    let result = normalized;
    if (input.loop.afterToolCall) {
      await emit(input.loop, {
        type: "tool_result_review_requested",
        taskId: input.task.id,
        toolName: tool.name,
        result: normalized,
        ts: nowIso(),
      });
      result = await input.loop.afterToolCall({ task: input.task, tool, result: normalized });
      await emit(input.loop, {
        type: "tool_result_review_result",
        taskId: input.task.id,
        toolName: tool.name,
        result,
        ts: nowIso(),
      });
    }

    await emit(input.loop, {
      type: "tool_call_end",
      toolName: tool.name,
      result,
      ts: nowIso(),
    });
    return result;
  } catch (error) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: tool.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : "Tool execution failed.",
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: tool.name,
      result,
      ts: nowIso(),
    });
    return result;
  }
}

async function executeTask(input: AgentLoopRuntime, task: Task, toolResults: ToolResult[]): Promise<void> {
  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  try {
    collected = await collectTextAndStructured({
      loop: input,
      events: input.stream(
        input.model,
        { phase: "execute", session: input.session, task, toolResults },
        { signal: input.signal },
      ),
      metadataPhase: "execute",
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidExecuteToolResult(error);
    toolResults.push(result);
    await appendSessionMessage(
      input,
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
      }),
    );
    return;
  }

  for (const toolCall of collected.toolCalls) {
    const result = await executeToolCall({ loop: input, task, toolCall });
    toolResults.push(result);
    await appendSessionMessage(
      input,
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
      }),
    );
  }
}

async function verifyTask(
  input: AgentLoopRuntime,
  task: Task,
  toolResults: ToolResult[],
): Promise<VerificationResult> {
  await emit(input, {
    type: "verification_start",
    taskId: task.id,
    ts: nowIso(),
  });

  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  try {
    collected = await collectTextAndStructured({
      loop: input,
      events: input.stream(
        input.model,
        {
          phase: "verify",
          session: input.session,
          task,
          toolResults,
          criteria: task.acceptanceCriteria,
        },
        { signal: input.signal },
      ),
      metadataPhase: "verify",
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidModelVerification(task, error);
    await emit(input, {
      type: "verification_end",
      taskId: task.id,
      result,
      ts: nowIso(),
    });
    return result;
  }

  const result = collected.structured
    ? parseVerificationResult(collected.structured)
    : {
        passed: false,
        message: "Verifier did not produce structured output.",
      };

  await emit(input, {
    type: "verification_end",
    taskId: task.id,
    result,
    ts: nowIso(),
  });

  return result;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<Outcome> {
  const runtime: AgentLoopRuntime = {
    ...input,
    messageTrace: snapshotMessages(input.session.messages),
    budgetUsage: { modelCalls: 0, toolCalls: 0 },
  };
  const maxAttempts = input.maxAttempts ?? 2;
  let currentTask: Task | undefined;
  let messageLogEnded = false;
  const endMessageLog = async () => {
    if (!messageLogEnded) {
      await emitMessageEnd(runtime);
      messageLogEnded = true;
    }
  };

  try {
    assertNotAborted(runtime.signal);
    const sessionLifecycle = runtime.sessionLifecycle ?? "created";
    if (sessionLifecycle !== "continued") {
      await emit(runtime, {
        type: sessionLifecycle === "created" ? "session_created" : "session_loaded",
        session: snapshotSession(runtime.session),
        ts: nowIso(),
      });
    }
    await emitMessageStart(runtime);

    const routed = await routeRequest(runtime);
    if (!routed.needsTask) {
      const outcome = createDirectOutcome(routed.message);
      await endMessageLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    const planned = await planTask(runtime);
    const task = planned.task;
    currentTask = task;
    if (planned.text.length === 0) {
      await appendSessionMessage(
        runtime,
        createMessage("assistant", `Planned task: ${task.title}`, {
          kind: "model_message",
          taskId: task.id,
        }),
      );
    }

    await emit(runtime, {
      type: "task_created",
      task,
      ts: nowIso(),
    });

    const toolResults: ToolResult[] = [];
    let lastVerification: VerificationResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      assertNotAborted(runtime.signal);
      task.status = "running";
      task.attempts = attempt;

      await emit(runtime, {
        type: "task_attempt_start",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      await executeTask(runtime, task, toolResults);

      await emit(runtime, {
        type: "task_attempt_end",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      lastVerification = await verifyTask(runtime, task, toolResults);
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await endMessageLog();
        await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
        return outcome;
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    await endMessageLog();
    await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
    return outcome;
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      const outcome = createBudgetExceededOutcome(error, currentTask);
      await emit(runtime, {
        type: "budget_exceeded",
        resource: error.resource,
        limit: error.limit,
        usage: error.usage,
        message: error.message,
        ...(currentTask ? { taskId: currentTask.id } : {}),
        ts: nowIso(),
      });
      await endMessageLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    const errorInfo = makeError(error);
    await endMessageLog();
    await emit(runtime, { type: "error", error: errorInfo, ts: nowIso() });
    throw error;
  }
}
