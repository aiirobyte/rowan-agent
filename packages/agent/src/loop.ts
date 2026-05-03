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
import { agentPhases } from "./phases";
import { scheduleTaskRouting } from "./phases/routing";
import type {
  AgentEvent,
  AgentLoopInput,
  AgentContext,
  ErrorInfo,
  LlmPhase,
  ModelCallUsage,
  ModelStreamEvent,
  Outcome,
  AgentLimitUsage,
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
import type { ExecutionTurnEntry } from "@rowan-agent/protocol";
import { recordPhaseStep } from "./recorder";
import type {
  ExecuteInput,
  ExecuteOutput,
  PhaseInputMap,
  PhaseOutputMap,
  PlanInput,
  RouteInput,
  VerifyInput,
} from "./phases/types";

type AgentSession = CoreSession<AgentEvent>;
type AgentSessionSnapshot = Omit<CoreSession<unknown>, "log" | "messages" | "createdAt" | "updatedAt">;

const routePhase = agentPhases.route.phase;
const planPhase = agentPhases.plan.phase;
const executePhase = agentPhases.execute.phase;
const verifyPhase = agentPhases.verify.phase;

type AgentLoopRuntime = AgentLoopInput & {
  messageLog: AgentMessage[];
  limitUsage: AgentLimitUsage;
  threadDepth: number;
  maxThreadDepth: number;
  status: AgentContext["state"]["status"];
  attempt: number;
  toolResults: ToolResult[];
  currentTask?: Task;
  lastExecuteText?: string;
};

class LimitExceededError extends Error {
  readonly resource: keyof AgentLimitUsage;
  readonly limit: number;
  readonly usage: AgentLimitUsage;

  constructor(input: { resource: keyof AgentLimitUsage; limit: number; usage: AgentLimitUsage }) {
    const label = input.resource === "modelCalls" ? "model calls" : "tool calls";
    super(`Agent run exceeded ${label} limit (${input.usage[input.resource]}/${input.limit}).`);
    this.name = "LimitExceededError";
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

function createAgentContext(input: AgentLoopRuntime): AgentContext {
  return {
    config: {
      sessionLifecycle: input.sessionLifecycle ?? "created",
      model: input.model,
      stream: input.stream,
      tools: input.tools,
      maxAttempts: input.maxAttempts ?? 2,
      verifyTasks: input.verifyTasks ?? true,
      ...(input.limits ? { limits: input.limits } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.runtime ? { runtime: input.runtime } : {}),
      ...(input.beforeToolCall ? { beforeToolCall: input.beforeToolCall } : {}),
      ...(input.afterToolCall ? { afterToolCall: input.afterToolCall } : {}),
      ...(input.runThread ? { runThread: input.runThread } : {}),
    },
    state: {
      session: input.session,
      messageLog: input.messageLog,
      status: input.status,
      attempt: input.attempt,
      ...(input.currentTask ? { task: input.currentTask } : {}),
      toolResults: input.toolResults,
      limitUsage: input.limitUsage,
      depth: runtimeDepth(input),
      ...(input.lastExecuteText ? { lastExecuteText: input.lastExecuteText } : {}),
    },
    ...(input.signal ? { signal: input.signal } : {}),
    emit: (event) => emit(input, event),
    record: (step) => input.recordStep?.(step) ?? Promise.resolve(),
    appendEventMessage: (message) => appendEventMessage(input, message),
    appendSessionMessage: (message) => appendSessionMessage(input, message),
    consumeLimit: (resource) => {
      const limitError = consumeLimit(input, resource);
      if (limitError) {
        throw limitError;
      }
    },
    ...(input.runThread ? { runThread: input.runThread } : {}),
  };
}

function cloneLimitUsage(usage: AgentLimitUsage): AgentLimitUsage {
  return {
    modelCalls: usage.modelCalls,
    toolCalls: usage.toolCalls,
  };
}

function limitForResource(
  input: AgentLoopRuntime,
  resource: keyof AgentLimitUsage,
): number | undefined {
  return resource === "modelCalls" ? input.limits?.maxModelCalls : input.limits?.maxToolCalls;
}

function consumeLimit(
  input: AgentLoopRuntime,
  resource: keyof AgentLimitUsage,
): LimitExceededError | undefined {
  input.limitUsage[resource] += 1;
  const limit = limitForResource(input, resource);

  if (limit !== undefined && input.limitUsage[resource] > limit) {
    return new LimitExceededError({
      resource,
      limit,
      usage: cloneLimitUsage(input.limitUsage),
    });
  }

  return undefined;
}

function createLimitExceededOutcome(error: LimitExceededError, task?: Task): Outcome {
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

function createUnverifiedTaskOutcome(input: AgentLoopRuntime, task: Task, toolResults: ToolResult[]): Outcome {
  const failedResult = toolResults.find((result) => !result.ok);
  const outputResult = failedResult ?? [...toolResults].reverse().find((result) => result.ok);
  const message = outputResult
    ? (outputResult.error ?? stringifyTaskOutput(outputResult.content))
    : (input.lastExecuteText ?? "Task completed without local verification.");

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
    limitUsage: input.thread.limitUsage,
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
    content: snapshotMessages(input.messageLog),
    ts: nowIso(),
  });
}

async function appendEventMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.messageLog.push(message);
  await emit(input, {
    type: "message_delta",
    delta: snapshotMessage(message),
    ts: nowIso(),
  });
}

async function appendSessionMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.session.messages.push(message);
  await appendEventMessage(input, message);
}

async function publishConversationAssistantMessage(
  input: AgentLoopRuntime,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendSessionMessage(input, createMessage("assistant", content, {
    ...metadata,
    scope: "conversation",
  }));
}

async function emitChatEnd(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "chat_end",
    content: snapshotMessages(input.messageLog),
    ts: nowIso(),
  });
}

async function collectTextAndStructured(input: {
  context: AgentContext;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: LlmPhase;
  recordText?: boolean;
}): Promise<{
  text: string;
  structured?: unknown;
  toolCalls: ToolCall[];
  stepEntries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
}> {
  const toolCalls: ToolCall[] = [];
  const stepEntries: ExecutionTurnEntry[] = [];
  let text = "";
  let flushedText = "";
  let structured: unknown;
  let usage: ModelCallUsage | undefined;
  const flushText = async () => {
    if (text.length === 0) {
      return;
    }

    flushedText += text;
    stepEntries.push({ kind: "assistant_text", text });
    if (input.recordText === false) {
      await input.context.appendEventMessage(
        createMessage("assistant", text, {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: "execution",
        }),
      );
      text = "";
      return;
    }
    await input.context.appendEventMessage(
      createMessage("assistant", text, {
        kind: "model_message",
        phase: input.metadataPhase,
        scope: "execution",
      }),
    );
    text = "";
  };

  for await (const event of input.events) {
    assertNotAborted(input.context.signal);

    if (event.type === "prompt_message") {
      stepEntries.push({ kind: "prompt", message: event.message });
      await input.context.appendEventMessage(
        createMessage(event.message.role, event.message.content, {
          kind: "phase_prompt",
          phase: event.phase,
          scope: "execution",
        }),
      );
    }

    if (event.type === "model_requested") {
      input.context.consumeLimit("modelCalls");
      usage = event.usage;
      await input.context.emit({
        type: "model_requested",
        phase: event.phase,
        model: event.model,
        usage: event.usage,
        ts: nowIso(),
      });
    }

    if (event.type === "text_delta") {
      text += event.text;
    }

    if (event.type === "structured_output") {
      await flushText();
      structured = event.content;
      stepEntries.push({ kind: "structured_output", content: event.content });
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
      stepEntries.push({ kind: "tool_call", toolCall });
      await input.context.emit({
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

  return { text: flushedText, structured, toolCalls, stepEntries, usage };
}

async function recordContextPhaseStep(input: {
  context: AgentContext;
  phase: LlmPhase;
  requestedAtMs: number;
  entries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
  scope?: "conversation" | "execution" | "diagnostic";
}): Promise<void> {
  if (input.entries.length === 0) {
    return;
  }

  const session = input.context.state.session;
  await input.context.record({
    id: createId("step"),
    sessionId: session.id,
    ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
    phase: input.phase,
    requestedAtMs: input.requestedAtMs,
    completedAtMs: Date.now(),
    model: input.context.config.model,
    ...(input.usage ? { usage: input.usage } : {}),
    scope: input.scope ?? "execution",
    entries: input.entries,
  });
}

async function planTask(context: AgentContext, input: PlanInput): Promise<{ task: Task; text: string }> {
  const requestedAtMs = Date.now();
  const collected = await collectTextAndStructured({
    context,
    events: context.config.stream(
      context.config.model,
      { phase: planPhase, session: input.session, runtime: input.runtime },
      { signal: context.signal },
    ),
    metadataPhase: planPhase,
  });

  if (!collected.structured) {
    throw new Error("Planner did not produce a structured task.");
  }

  const task = parseTask(collected.structured);
  await recordContextPhaseStep({
    context,
    phase: planPhase,
    requestedAtMs,
    entries: collected.stepEntries,
    usage: collected.usage,
  });

  return { task, text: collected.text };
}

async function routeRequest(
  context: AgentContext,
  input: RouteInput,
): Promise<TaskRoutingDecision & { text: string }> {
  const requestedAtMs = Date.now();
  const collected = await collectTextAndStructured({
    context,
    events: context.config.stream(
      context.config.model,
      { phase: routePhase, session: input.session, runtime: input.runtime },
      { signal: context.signal },
    ),
    metadataPhase: routePhase,
    recordText: false,
  });

  if (!collected.structured) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const decision = scheduleTaskRouting({
    input: latestUserInput(input.session),
    tools: input.tools,
    decision: parseTaskRoutingDecision(collected.structured),
    defaultNeedsTaskRoute: input.shouldDefaultToThreadRoute ? "thread" : "task",
    allowThreadRoute: input.canStartThreadRoute,
    workerTask: input.workerTask,
    workerGoal: input.workerGoal,
  });
  collected.stepEntries.push({ kind: "structured_output", content: decision });
  if (decision.route !== "direct") {
    await context.appendEventMessage(
      createMessage("assistant", JSON.stringify(decision), {
        kind: "routing_decision",
        phase: routePhase,
        scope: "execution",
      }),
    );
  }
  await recordContextPhaseStep({
    context,
    phase: routePhase,
    requestedAtMs,
    entries: collected.stepEntries,
    usage: collected.usage,
  });
  return { ...decision, text: decision.message };
}

function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

async function executeToolCall(input: {
  context: AgentContext;
  task: Task;
  toolCall: ToolCall;
}): Promise<ToolResult> {
  if (input.context.config.runtime?.tools) {
    return input.context.config.runtime.tools({
      context: input.context,
      task: input.task,
      toolCall: input.toolCall,
    });
  }

  const tool = findTool(input.context.config.tools, input.toolCall.name);
  if (!tool) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: `Unknown tool: ${input.toolCall.name}`,
    };
    await input.context.emit({
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
    await input.context.emit({
      type: "tool_end",
      toolName: input.toolCall.name,
      result,
      ts: nowIso(),
    });
    return result;
  }

  let decision: Awaited<ReturnType<NonNullable<AgentLoopInput["beforeToolCall"]>>> | undefined;
  if (input.context.config.beforeToolCall) {
    await input.context.emit({
      type: "tool_approval_requested",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      ts: nowIso(),
    });
    decision = await input.context.config.beforeToolCall({ task: input.task, tool, args });
    await input.context.emit({
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
    await input.context.emit({
      type: "tool_blocked",
      toolName: tool.name,
      reason: decision.reason,
      ts: nowIso(),
    });
    return result;
  }

  input.context.consumeLimit("toolCalls");

  await input.context.emit({
    type: "tool_start",
    toolName: tool.name,
    args,
    ts: nowIso(),
  });

  try {
    const toolContext = {
      session: input.context.state.session,
      task: input.task,
      toolCallId: input.toolCall.id,
      ...(input.context.runThread ? { runThread: input.context.runThread } : {}),
    };
    const rawResult = await tool.execute(
      args,
      toolContext,
      input.context.signal,
    );
    const normalized = Validators.toolResult.Parse({
      ...rawResult,
      toolCallId: input.toolCall.id,
      toolName: tool.name,
    });
    let result = normalized;
    if (input.context.config.afterToolCall) {
      await input.context.emit({
        type: "tool_result_review_requested",
        taskId: input.task.id,
        toolName: tool.name,
        result: normalized,
        ts: nowIso(),
      });
      result = await input.context.config.afterToolCall({ task: input.task, tool, result: normalized });
      await input.context.emit({
        type: "tool_result_review_result",
        taskId: input.task.id,
        toolName: tool.name,
        result,
        ts: nowIso(),
      });
    }

    await input.context.emit({
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
    await input.context.emit({
      type: "tool_end",
      toolName: tool.name,
      result,
      ts: nowIso(),
    });
    return result;
  }
}

async function executeTask(
  context: AgentContext,
  input: ExecuteInput,
): Promise<ExecuteOutput> {
  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  const requestedAtMs = Date.now();
  try {
    collected = await collectTextAndStructured({
      context,
      events: context.config.stream(
        context.config.model,
        {
          phase: executePhase,
          session: input.session,
          task: input.task,
          toolResults: input.toolResults,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: executePhase,
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidExecuteToolResult(error);
    input.toolResults.push(result);
    await context.appendEventMessage(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      }),
    );
    await recordContextPhaseStep({
      context,
      phase: executePhase,
      requestedAtMs,
      entries: [{ kind: "tool_result", result }],
      scope: "diagnostic",
    });
    return {
      text: "",
      toolCalls: [],
      taskOutput: createToolTaskOutput(input.toolResults),
    };
  }

  for (const toolCall of collected.toolCalls) {
    const result = await executeToolCall({ context, task: input.task, toolCall });
    input.toolResults.push(result);
    collected.stepEntries.push({ kind: "tool_result", result });
    await context.appendEventMessage(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      }),
    );
  }

  await recordContextPhaseStep({
    context,
    phase: executePhase,
    requestedAtMs,
    entries: collected.stepEntries,
    usage: collected.usage,
  });

  return {
    text: collected.text,
    toolCalls: collected.toolCalls,
    taskOutput: createToolTaskOutput(input.toolResults),
  };
}

async function verifyTask(
  context: AgentContext,
  input: VerifyInput,
): Promise<VerificationResult> {
  await context.emit({
    type: "verification_start",
    taskId: input.task.id,
    ts: nowIso(),
  });

  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  const requestedAtMs = Date.now();
  try {
    collected = await collectTextAndStructured({
      context,
      events: context.config.stream(
        context.config.model,
        {
          phase: verifyPhase,
          session: input.session,
          task: input.task,
          taskOutput: input.taskOutput,
          criteria: input.criteria,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: verifyPhase,
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidModelVerification(input.task, error);
    await recordContextPhaseStep({
      context,
      phase: verifyPhase,
      requestedAtMs,
      entries: [{ kind: "structured_output", content: result }],
      scope: "diagnostic",
    });
    await context.emit({
      type: "verification_end",
      taskId: input.task.id,
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
  await recordContextPhaseStep({
    context,
    phase: verifyPhase,
    requestedAtMs,
    entries: collected.stepEntries,
    usage: collected.usage,
  });

  await context.emit({
    type: "verification_end",
    taskId: input.task.id,
    result,
    ts: nowIso(),
  });

  return result;
}

type RunPhaseOutput<TPhase extends LlmPhase> =
  | { type: "output"; output: PhaseOutputMap[TPhase] }
  | { type: "abort"; outcome: Outcome };

function hasAbort(value: unknown): value is { abort: Outcome } {
  return isRecord(value) && isRecord(value.abort);
}

function hasSkip<TPhase extends LlmPhase>(value: unknown): value is { skip: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "skip" in value;
}

function hasInput<TPhase extends LlmPhase>(value: unknown): value is { input: PhaseInputMap[TPhase] } {
  return isRecord(value) && "input" in value;
}

function hasOutput<TPhase extends LlmPhase>(value: unknown): value is { output: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "output" in value;
}

function hasRetry<TPhase extends LlmPhase>(value: unknown): value is { retry: PhaseInputMap[TPhase] } {
  return isRecord(value) && "retry" in value;
}

async function runPhase<TPhase extends LlmPhase>(
  context: AgentContext,
  phase: TPhase,
  input: PhaseInputMap[TPhase],
  runner: (phaseInput: PhaseInputMap[TPhase]) => Promise<PhaseOutputMap[TPhase]>,
): Promise<RunPhaseOutput<TPhase>> {
  let currentInput = input;
  let retries = 0;

  while (true) {
    const before = await context.config.runtime?.beforePhase?.(context, phase, currentInput);
    if (hasAbort(before)) {
      return { type: "abort", outcome: before.abort };
    }
    if (hasSkip<TPhase>(before)) {
      return { type: "output", output: before.skip };
    }
    if (hasInput<TPhase>(before) && before.input) {
      currentInput = before.input;
    }

    const output = await runner(currentInput);
    const after = await context.config.runtime?.afterPhase?.(context, phase, output);
    if (hasAbort(after)) {
      return { type: "abort", outcome: after.abort };
    }
    if (hasRetry<TPhase>(after) && after.retry) {
      retries += 1;
      if (retries > 3) {
        throw new Error(`Runtime requested too many ${phase} phase retries.`);
      }
      currentInput = after.retry;
      continue;
    }
    if (hasOutput<TPhase>(after) && after.output) {
      return { type: "output", output: after.output };
    }

    return { type: "output", output };
  }
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
    limits: input.limits,
    threadDepth: input.threadDepth + 1,
    verify: false,
  });
  const threadOutput = createThreadTaskOutput({
    thread,
    prompt,
    task: threadTask,
    goal,
  });
  await appendEventMessage(
    input,
    createMessage("assistant", JSON.stringify(threadOutput), {
      kind: "thread_output",
      threadSessionId: thread.session.id,
      parentSessionId: thread.parentSessionId,
      scope: "execution",
    }),
  );
  await recordPhaseStep({
    loop: input,
    phase: executePhase,
    requestedAtMs: Date.now(),
    entries: [{ kind: "structured_output", content: threadOutput }],
  });

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

  input.status = "verifying";
  const verifyPhaseResult = await runPhase(
    createAgentContext(input),
    verifyPhase,
    {
      session: input.session,
      task,
      taskOutput: threadOutput,
      criteria: task.acceptanceCriteria,
      runtime: runtimeDepth(input),
    },
    (phaseInput) => verifyTask(createAgentContext(input), phaseInput),
  );
  if (verifyPhaseResult.type === "abort") {
    return verifyPhaseResult.outcome;
  }
  const verification = verifyPhaseResult.output;
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
    messageLog: snapshotMessages(input.session.messages),
    limitUsage: { modelCalls: 0, toolCalls: 0 },
    threadDepth: input.threadDepth ?? 0,
    maxThreadDepth: resolveMaxThreadDepth(input.limits),
    verifyTasks: input.verifyTasks ?? true,
    status: "routing",
    attempt: 0,
    toolResults: [],
  };
  const maxAttempts = input.maxAttempts ?? 2;
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

    runtime.status = "routing";
    const canStartThreadRoute = Boolean(runtime.runThread) && runtime.threadDepth < runtime.maxThreadDepth;
    const routePhaseResult = await runPhase(
      createAgentContext(runtime),
      routePhase,
      {
        session: runtime.session,
        runtime: runtimeDepth(runtime),
        tools: runtime.tools,
        canStartThreadRoute,
        shouldDefaultToThreadRoute:
          canStartThreadRoute &&
          !runtime.session.parentSessionId &&
          !runtime.session.task &&
          !runtime.session.goal,
        workerTask: runtime.threadDepth > 0 ? runtime.session.task : undefined,
        workerGoal: runtime.threadDepth > 0 ? runtime.session.goal : undefined,
      },
      (phaseInput) => routeRequest(createAgentContext(runtime), phaseInput),
    );
    if (routePhaseResult.type === "abort") {
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome: routePhaseResult.outcome, ts: nowIso() });
      return routePhaseResult.outcome;
    }
    const routed = routePhaseResult.output;
    if (routed.route === "direct") {
      const outcome = createDirectOutcome(routed.message);
      await publishConversationAssistantMessage(runtime, outcome.message, { kind: "direct_answer" });
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    if (routed.route === "thread") {
      const outcome = await executeThreadRoute(runtime, routed);
      if (outcome.passed) {
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
        });
      }
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      return outcome;
    }

    runtime.status = "planning";
    const planPhaseResult = await runPhase(
      createAgentContext(runtime),
      planPhase,
      {
        session: runtime.session,
        runtime: runtimeDepth(runtime),
      },
      (phaseInput) => planTask(createAgentContext(runtime), phaseInput),
    );
    if (planPhaseResult.type === "abort") {
      await endChatLog();
      await emit(runtime, { type: "outcome", outcome: planPhaseResult.outcome, ts: nowIso() });
      return planPhaseResult.outcome;
    }
    const planned = planPhaseResult.output;
    const task = planned.task;
    runtime.currentTask = task;

    await emit(runtime, {
      type: "task_created",
      task,
      ts: nowIso(),
    });

    let lastVerification: VerificationResult | undefined;
    let lastTaskOutput: TaskOutput = createToolTaskOutput(runtime.toolResults);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      assertNotAborted(runtime.signal);
      runtime.status = "executing";
      runtime.attempt = attempt;
      task.status = "running";
      task.attempts = attempt;

      await emit(runtime, {
        type: "task_start",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      const executePhaseResult = await runPhase(
        createAgentContext(runtime),
        executePhase,
        {
          session: runtime.session,
          task,
          toolResults: runtime.toolResults,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => executeTask(createAgentContext(runtime), phaseInput),
      );
      if (executePhaseResult.type === "abort") {
        await endChatLog();
        await emit(runtime, { type: "outcome", outcome: executePhaseResult.outcome, ts: nowIso() });
        return executePhaseResult.outcome;
      }
      if (executePhaseResult.output.text.trim().length > 0) {
        runtime.lastExecuteText = executePhaseResult.output.text;
      }
      lastTaskOutput = executePhaseResult.output.taskOutput;

      await emit(runtime, {
        type: "task_end",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      if (!runtime.verifyTasks) {
        const outcome = createUnverifiedTaskOutcome(runtime, task, runtime.toolResults);
        task.status = outcome.passed ? "passed" : "failed";
        if (outcome.passed) {
          await publishConversationAssistantMessage(runtime, outcome.message, {
            kind: "task_outcome",
            taskId: task.id,
          });
        }
        await endChatLog();
        await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
        return outcome;
      }

      runtime.status = "verifying";
      const verifyPhaseResult = await runPhase(
        createAgentContext(runtime),
        verifyPhase,
        {
          session: runtime.session,
          task,
          taskOutput: lastTaskOutput,
          criteria: task.acceptanceCriteria,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => verifyTask(createAgentContext(runtime), phaseInput),
      );
      if (verifyPhaseResult.type === "abort") {
        await endChatLog();
        await emit(runtime, { type: "outcome", outcome: verifyPhaseResult.outcome, ts: nowIso() });
        return verifyPhaseResult.outcome;
      }
      lastVerification = verifyPhaseResult.output;
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          taskId: task.id,
        });
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
    if (error instanceof LimitExceededError) {
      const outcome = createLimitExceededOutcome(error, runtime.currentTask);
      await emit(runtime, {
        type: "limit_exceeded",
        resource: error.resource,
        limit: error.limit,
        usage: error.usage,
        message: error.message,
        ...(runtime.currentTask ? { taskId: runtime.currentTask.id } : {}),
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
