import Schema from "typebox/schema";
import {
  createMessage,
  latestUserInput,
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
  TaskOutput,
  TaskRoutingDecision,
  ThreadRunResult,
  ThreadTaskOutput,
  Tool,
  ToolCall,
  ToolTaskOutput,
  ToolResult,
  VerificationResult,
  RuntimeDepth,
} from "./types";
import { createId, nowIso, resolveMaxThreadDepth, Validators } from "./types";

type AgentSession = CoreSession<AgentEvent>;
type AgentSessionSnapshot = Omit<CoreSession<unknown>, "log" | "messages" | "createdAt" | "updatedAt">;

type AgentLoopRuntime = AgentLoopInput & {
  messageTrace: AgentMessage[];
  budgetUsage: AgentBudgetUsage;
  threadDepth: number;
  maxThreadDepth: number;
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
    input: session.input,
    ...(session.task ? { task: session.task } : {}),
    ...(session.goal ? { goal: session.goal } : {}),
    skills: session.skills,
    ...(session.title ? { title: session.title } : {}),
  };
}

function runtimeDepth(input: AgentLoopRuntime): RuntimeDepth {
  return {
    threadDepth: input.threadDepth,
    maxThreadDepth: input.maxThreadDepth,
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

function stringifyTaskOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value) ?? String(value);
}

function latestExecuteMessage(session: AgentSession): string | undefined {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const metadata = message.metadata;
    if (metadata?.kind !== "model_message" || metadata.phase !== "execute") {
      continue;
    }

    const content = asString(message.content);
    if (content) {
      return content;
    }
  }

  return undefined;
}

function createUnverifiedTaskOutcome(input: AgentLoopRuntime, task: Task, toolResults: ToolResult[]): Outcome {
  const failedResult = toolResults.find((result) => !result.ok);
  const outputResult = failedResult ?? [...toolResults].reverse().find((result) => result.ok);
  const message = outputResult
    ? (outputResult.error ?? stringifyTaskOutput(outputResult.content))
    : (latestExecuteMessage(input.session) ?? "Task completed without local verification.");

  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: !failedResult,
    message,
  });
}

function createToolTaskOutput(toolResults: ToolResult[]): ToolTaskOutput {
  return {
    kind: "tools",
    toolResults,
  };
}

function createThreadTaskOutput(input: {
  thread: ThreadRunResult;
  prompt: string;
  task: string;
  goal: string;
}): ThreadTaskOutput {
  return {
    kind: "thread",
    sessionId: input.thread.session.id,
    parentSessionId: input.thread.parentSessionId,
    prompt: input.prompt,
    task: input.task,
    goal: input.goal,
    outcome: input.thread.outcome,
    budgetUsage: input.thread.budgetUsage,
    threadDepth: input.thread.threadDepth,
    maxThreadDepth: input.thread.maxThreadDepth,
  };
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

async function emitChatStart(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "chat_start",
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

async function emitChatEnd(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "chat_end",
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

    if (event.type === "prompt_message") {
      await appendSessionMessage(
        input.loop,
        createMessage(event.message.role, event.message.content, {
          kind: "phase_prompt",
          phase: event.phase,
        }),
      );
    }

    if (event.type === "model_requested") {
      const budgetError = consumeBudget(input.loop, "modelCalls");
      await emit(input.loop, {
        type: "model_requested",
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
        type: "tool_requested",
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
    events: input.stream(
      input.model,
      { phase: "plan", session: input.session, runtime: runtimeDepth(input) },
      { signal: input.signal },
    ),
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
    events: input.stream(
      input.model,
      { phase: "route", session: input.session, runtime: runtimeDepth(input) },
      { signal: input.signal },
    ),
    metadataPhase: "route",
    recordText: false,
  });

  if (!collected.structured) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const canStartThreadRoute = Boolean(input.runThread) && input.threadDepth < input.maxThreadDepth;
  const shouldDefaultToThreadRoute =
    canStartThreadRoute && !input.session.parentSessionId && !input.session.task && !input.session.goal;
  const decision = scheduleTaskRouting({
    input: latestUserInput(input.session),
    tools: input.tools,
    decision: parseTaskRoutingDecision(collected.structured),
    defaultNeedsTaskRoute: shouldDefaultToThreadRoute ? "thread" : "task",
    allowThreadRoute: canStartThreadRoute,
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
      type: "tool_end",
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
      type: "tool_end",
      toolName: input.toolCall.name,
      result,
      ts: nowIso(),
    });
    return result;
  }

  let decision: Awaited<ReturnType<NonNullable<AgentLoopInput["beforeToolCall"]>>> | undefined;
  if (input.loop.beforeToolCall) {
    await emit(input.loop, {
      type: "tool_approval_requested",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      ts: nowIso(),
    });
    decision = await input.loop.beforeToolCall({ task: input.task, tool, args });
    await emit(input.loop, {
      type: "tool_approval_result",
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
      type: "tool_blocked",
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
    type: "tool_start",
    toolName: tool.name,
    args,
    ts: nowIso(),
  });

  try {
    const toolContext = {
      session: input.loop.session,
      task: input.task,
      toolCallId: input.toolCall.id,
      ...(input.loop.runThread ? { runThread: input.loop.runThread } : {}),
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
      type: "tool_end",
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
      type: "tool_end",
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
        { phase: "execute", session: input.session, task, toolResults, runtime: runtimeDepth(input) },
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
  taskOutput: TaskOutput,
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
          taskOutput,
          criteria: task.acceptanceCriteria,
          runtime: runtimeDepth(input),
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

function shortThreadTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function createThreadTask(decision: TaskRoutingDecision, fallbackPrompt: string): Task {
  const thread = decision.thread;
  const taskText = thread?.task ?? decision.message;
  const goalText = thread?.goal ?? `Thread outcome must satisfy: ${taskText || fallbackPrompt}`;

  return Validators.task.Parse({
    id: createId("task"),
    title: `Thread: ${shortThreadTitle(taskText || fallbackPrompt)}`,
    instruction: taskText || fallbackPrompt,
    acceptanceCriteria: [
      {
        id: createId("crit"),
        type: "model_judge",
        description: goalText,
        required: true,
      },
    ],
    toolNames: [],
    skillIds: [],
    status: "pending",
    attempts: 0,
  });
}

async function executeThreadRoute(
  input: AgentLoopRuntime,
  decision: TaskRoutingDecision,
): Promise<Outcome> {
  if (input.threadDepth >= input.maxThreadDepth) {
    const task = createThreadTask(decision, latestUserInput(input.session));
    task.status = "failed";
    return createFailedOutcome(task, {
      passed: false,
      message: `Thread depth limit reached (${input.threadDepth}/${input.maxThreadDepth}).`,
    });
  }

  if (!input.runThread) {
    const task = createThreadTask(decision, latestUserInput(input.session));
    task.status = "failed";
    return createFailedOutcome(task, {
      passed: false,
      message: "Thread route was selected, but no thread runner is configured.",
    });
  }

  const currentInput = latestUserInput(input.session);
  const prompt = decision.thread?.prompt ?? currentInput;
  const threadTask = decision.thread?.task ?? currentInput;
  const goal = decision.thread?.goal ?? `Complete the delegated work and return a verifiable outcome for: ${threadTask}`;
  const task = createThreadTask(
    {
      ...decision,
      thread: { prompt, task: threadTask, goal },
    },
    currentInput,
  );

  await emit(input, {
    type: "task_created",
    task,
    ts: nowIso(),
  });

  task.status = "running";
  task.attempts = 1;
  await emit(input, {
    type: "task_start",
    taskId: task.id,
    attempt: 1,
    ts: nowIso(),
  });

  const thread = await input.runThread({
    prompt,
    task: threadTask,
    goal,
    tools: input.tools,
    skills: input.session.skills,
    maxAttempts: input.maxAttempts,
    budget: input.budget,
    threadDepth: input.threadDepth + 1,
    verify: false,
  });
  const threadOutput = createThreadTaskOutput({
    thread,
    prompt,
    task: threadTask,
    goal,
  });
  await appendSessionMessage(
    input,
    createMessage("assistant", JSON.stringify(threadOutput), {
      kind: "thread_output",
      threadSessionId: thread.session.id,
      parentSessionId: thread.parentSessionId,
    }),
  );

  await emit(input, {
    type: "task_end",
    taskId: task.id,
    attempt: 1,
    ts: nowIso(),
  });

  if (!input.verifyTasks) {
    task.status = thread.outcome.passed ? "passed" : "failed";
    return Validators.outcome.Parse({
      id: createId("out"),
      taskId: task.id,
      passed: thread.outcome.passed,
      message: thread.outcome.message,
    });
  }

  const verification = await verifyTask(input, task, threadOutput);
  if (verification.passed) {
    task.status = "passed";
    return createOutcome(task, verification);
  }

  task.status = "failed";
  return createFailedOutcome(task, verification);
}

export async function runAgentLoop(input: AgentLoopInput): Promise<Outcome> {
  const runtime: AgentLoopRuntime = {
    ...input,
    messageTrace: snapshotMessages(input.session.messages),
    budgetUsage: { modelCalls: 0, toolCalls: 0 },
    threadDepth: input.threadDepth ?? 0,
    maxThreadDepth: resolveMaxThreadDepth(input.budget),
    verifyTasks: input.verifyTasks ?? true,
  };
  const maxAttempts = input.maxAttempts ?? 2;
  let currentTask: Task | undefined;
  let chatLogEnded = false;
  const endChatLog = async () => {
    if (!chatLogEnded) {
      await emitChatEnd(runtime);
      chatLogEnded = true;
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
    await emitChatStart(runtime);

    const routed = await routeRequest(runtime);
    if (routed.route === "direct") {
      const outcome = createDirectOutcome(routed.message);
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    if (routed.route === "thread") {
      const outcome = await executeThreadRoute(runtime, routed);
      await endChatLog();
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
        type: "task_start",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      await executeTask(runtime, task, toolResults);

      await emit(runtime, {
        type: "task_end",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      if (!runtime.verifyTasks) {
        const outcome = createUnverifiedTaskOutcome(runtime, task, toolResults);
        task.status = outcome.passed ? "passed" : "failed";
        await endChatLog();
        await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
        return outcome;
      }

      lastVerification = await verifyTask(runtime, task, createToolTaskOutput(toolResults));
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await endChatLog();
        await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
        return outcome;
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    await endChatLog();
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
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    const errorInfo = makeError(error);
    await endChatLog();
    await emit(runtime, { type: "error", error: errorInfo, ts: nowIso() });
    throw error;
  }
}
