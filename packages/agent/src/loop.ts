import { executeRuntimeToolCall } from "@rowan-agent/runtime/tools";
import {
  createSession,
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
import { scheduleTaskRouting } from "./phases/routing";
import type {
  AgentEvent,
  AgentContext as AgentRunContext,
  AgentLoopInput,
  AgentRunResult,
  AgentLoopContext,
  ErrorInfo,
  LlmPhaseOutputMap,
  LlmPhase,
  ModelCallUsage,
  ModelStreamEvent,
  Outcome,
  AgentLimitUsage,
  Task,
  TaskOutput,
  TaskRoutingDecision,
  RunThread,
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
type ThreadRunResult = Extract<AgentRunResult, { kind: "thread" }>;

type NormalizedAgentLoopInput = {
  kind: AgentRunResult["kind"];
  session: AgentSession;
  sessionLifecycle?: Extract<AgentLoopInput, { kind: "session" }>["sessionLifecycle"];
  parentSessionId?: string;
  prompt?: string;
  task?: string;
  goal?: string;
  model: AgentLoopInput["model"];
  stream: AgentLoopInput["stream"];
  tools: Tool[];
  maxAttempts?: AgentLoopInput["maxAttempts"];
  limits?: AgentLoopInput["limits"];
  threadDepth?: AgentLoopInput["threadDepth"];
  verifyTasks?: boolean;
  signal?: AgentLoopInput["signal"];
  runtime?: AgentLoopInput["runtime"];
  beforeToolCall?: AgentLoopInput["beforeToolCall"];
  afterToolCall?: AgentLoopInput["afterToolCall"];
  runThread?: RunThread;
  recordStep?: Extract<AgentLoopInput, { kind: "session" }>["recordStep"];
  emit?: AgentLoopInput["emit"];
};

const routePhase = "route";
const planPhase = "plan";
const executePhase = "execute";
const verifyPhase = "verify";

type AgentLoopRuntime = NormalizedAgentLoopInput & {
  messageLog: AgentMessage[];
  limitUsage: AgentLimitUsage;
  threadDepth: number;
  maxThreadDepth: number;
  status: AgentLoopContext["state"]["status"];
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

function createAgentRunResult(input: AgentLoopRuntime, outcome: Outcome): AgentRunResult {
  const base = {
    session: input.session,
    outcome,
    limitUsage: cloneLimitUsage(input.limitUsage),
    depth: runtimeDepth(input),
  };

  if (input.kind === "thread") {
    if (!input.parentSessionId || !input.prompt) {
      throw new Error("Thread run is missing parent session or prompt metadata.");
    }

    return {
      kind: "thread",
      parentSessionId: input.parentSessionId,
      prompt: input.prompt,
      ...(input.task ? { task: input.task } : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      ...base,
    };
  }

  return {
    kind: "session",
    ...base,
  };
}

function createAgentLoopContext(input: AgentLoopRuntime): AgentLoopContext {
  return {
    systemPrompt: input.session.systemPrompt,
    messages: snapshotMessages(input.session.messages),
    tools: input.tools,
    skills: input.session.skills.slice(),
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

function normalizeAgentLoopInput(input: AgentLoopInput): NormalizedAgentLoopInput {
  if (input.kind === "session") {
    const context = input.context
      ? cloneAgentRunContext(input.context)
      : input.session
        ? contextFromSession(input.session, input.tools)
        : undefined;
    if (!context) {
      throw new Error("Session agent loop runs require either context or session.");
    }
    const session = input.session
      ? syncSessionFromContext(input.session, context)
      : createSessionFromContext(context);

    return {
      kind: "session",
      session,
      sessionLifecycle: input.sessionLifecycle,
      model: input.model,
      stream: input.stream,
      tools: input.tools ?? context.tools ?? [],
      maxAttempts: input.maxAttempts,
      limits: input.limits,
      threadDepth: input.threadDepth,
      verifyTasks: input.verifyTasks,
      signal: input.signal,
      runtime: input.runtime,
      beforeToolCall: input.beforeToolCall,
      afterToolCall: input.afterToolCall,
      runThread: input.runThread,
      recordStep: input.recordStep,
      emit: input.emit,
    };
  }

  const context = contextFromThreadInput(input);
  const session = createSessionFromContext(context, {
    input: input.prompt,
    parentSessionId: input.parentSessionId,
    task: input.task,
    goal: input.goal,
  });

  return {
    kind: "thread",
    session,
    sessionLifecycle: "created",
    parentSessionId: input.parentSessionId,
    prompt: input.prompt,
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
    model: input.model,
    stream: input.stream,
    tools: input.tools ?? context.tools ?? [],
    maxAttempts: input.maxAttempts,
    limits: input.limits,
    threadDepth: input.threadDepth ?? 1,
    verifyTasks: input.verify ?? true,
    signal: input.signal,
    runtime: input.runtime,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    emit: input.emit,
  };
}

function createNestedRunThread(input: AgentLoopRuntime): RunThread {
  return async (threadInput) => {
    const result = await runAgentLoop({
      kind: "thread",
      ...threadInput,
      parentSessionId: threadInput.parentSessionId ?? input.session.id,
      systemPrompt: input.session.systemPrompt,
      model: input.model,
      stream: input.stream,
      signal: input.signal,
      limits: threadInput.limits ?? input.limits,
      threadDepth: threadInput.threadDepth ?? input.threadDepth + 1,
      verify: threadInput.verify ?? false,
      runtime: input.runtime,
      beforeToolCall: input.beforeToolCall,
      afterToolCall: input.afterToolCall,
      emit: input.emit,
    });
    if (result.kind !== "thread") {
      throw new Error("Nested thread runner returned a non-thread result.");
    }
    return result;
  };
}

async function emitThreadCreated(input: AgentLoopRuntime): Promise<void> {
  if (input.kind !== "thread" || !input.parentSessionId || !input.prompt) {
    return;
  }

  await emit(input, {
    type: "thread_created",
    parentSessionId: input.parentSessionId,
    sessionId: input.session.id,
    prompt: input.prompt,
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
    threadDepth: input.threadDepth,
    maxThreadDepth: input.maxThreadDepth,
    ts: nowIso(),
  });
}

async function emitThreadEnd(input: AgentLoopRuntime, result: AgentRunResult): Promise<void> {
  if (result.kind !== "thread") {
    return;
  }

  await emit(input, {
    type: "thread_end",
    parentSessionId: result.parentSessionId,
    sessionId: result.session.id,
    outcome: result.outcome,
    limitUsage: result.limitUsage,
    threadDepth: result.depth.threadDepth,
    maxThreadDepth: result.depth.maxThreadDepth,
    ts: nowIso(),
  });
}

async function completeRun(
  input: AgentLoopRuntime,
  outcome: Outcome,
  endChatLog: () => Promise<void>,
): Promise<AgentRunResult> {
  await endChatLog();
  await emit(input, { type: "outcome", outcome, ts: nowIso() });
  const result = createAgentRunResult(input, outcome);
  await emitThreadEnd(input, result);
  return result;
}

async function completeThreadDepthExceeded(input: AgentLoopRuntime): Promise<AgentRunResult> {
  const outcome = Validators.outcome.Parse({
    id: createId("out"),
    passed: false,
    message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).`,
  });
  await emit(input, { type: "outcome", outcome, ts: nowIso() });
  const result = createAgentRunResult(input, outcome);
  await emitThreadEnd(input, result);
  return result;
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
    threadDepth: input.thread.depth.threadDepth,
    maxThreadDepth: input.thread.depth.maxThreadDepth,
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

function cloneAgentRunContext(context: AgentRunContext): AgentRunContext {
  return {
    systemPrompt: context.systemPrompt,
    messages: snapshotMessages(context.messages),
    ...(context.tools ? { tools: context.tools.slice() } : {}),
    ...(context.skills ? { skills: context.skills.slice() } : {}),
  };
}

function firstUserInput(messages: AgentMessage[]): string {
  const message = messages.find((entry) => entry.role === "user");
  if (!message) {
    throw new Error("Agent context must include at least one user message.");
  }
  return message.content;
}

function contextFromSession(session: AgentSession, tools?: Tool[]): AgentRunContext {
  return {
    systemPrompt: session.systemPrompt,
    messages: snapshotMessages(session.messages),
    tools: tools?.slice() ?? [],
    skills: session.skills.slice(),
  };
}

function contextFromThreadInput(input: Extract<AgentLoopInput, { kind: "thread" }>): AgentRunContext {
  if (input.context) {
    return cloneAgentRunContext(input.context);
  }

  return {
    systemPrompt: input.systemPrompt,
    messages: [
      createMessage("user", input.prompt, { scope: "conversation" }),
    ],
    tools: input.tools?.slice() ?? [],
    skills: input.skills?.slice() ?? [],
  };
}

function createSessionFromContext(
  context: AgentRunContext,
  input: {
    input?: string;
    parentSessionId?: string;
    task?: string;
    goal?: string;
  } = {},
): AgentSession {
  const session = createSession<AgentEvent>({
    systemPrompt: context.systemPrompt,
    input: input.input ?? firstUserInput(context.messages),
    skills: context.skills ?? [],
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
  });

  if (context.messages.length > 0) {
    session.messages = snapshotMessages(context.messages);
  }
  session.skills = context.skills?.slice() ?? [];
  session.updatedAt = nowIso();
  return session;
}

function syncSessionFromContext(session: AgentSession, context: AgentRunContext): AgentSession {
  session.systemPrompt = context.systemPrompt;
  if (context.messages.length > 0) {
    session.messages = snapshotMessages(context.messages);
  }
  session.skills = context.skills?.slice() ?? session.skills;
  session.updatedAt = nowIso();
  return session;
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

async function collectTextAndStructured<TPhase extends LlmPhase>(input: {
  context: AgentLoopContext;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: TPhase;
  recordText?: boolean;
}): Promise<{
  text: string;
  phaseOutput?: LlmPhaseOutputMap[TPhase];
  structured?: unknown;
  toolCalls: ToolCall[];
  stepEntries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
}> {
  const toolCalls: ToolCall[] = [];
  const stepEntries: ExecutionTurnEntry[] = [];
  let text = "";
  let flushedText = "";
  let phaseOutput: LlmPhaseOutputMap[TPhase] | undefined;
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

    if (event.type === "phase_output") {
      if (event.phase !== input.metadataPhase) {
        throw new Error(`Expected ${input.metadataPhase} phase output, received ${event.phase}.`);
      }

      await flushText();
      phaseOutput = event.output as LlmPhaseOutputMap[TPhase];
      stepEntries.push({ kind: "structured_output", content: event.output });

      if (event.phase === executePhase) {
        for (const outputToolCall of (event.output as LlmPhaseOutputMap["execute"]).toolCalls) {
          const toolCall = Validators.toolCall.Parse(outputToolCall);
          toolCalls.push(toolCall);
          stepEntries.push({ kind: "tool_call", toolCall });
          await input.context.emit({
            type: "tool_requested",
            toolCall,
            ts: nowIso(),
          });
        }
      }
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

  return { text: flushedText, phaseOutput, structured, toolCalls, stepEntries, usage };
}

async function recordContextPhaseStep(input: {
  context: AgentLoopContext;
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

async function planTask(context: AgentLoopContext, input: PlanInput): Promise<{ task: Task; text: string }> {
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

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["plan"] | undefined;
  const rawTask = phaseOutput?.task ?? collected.structured;
  if (!rawTask) {
    throw new Error("Planner did not produce a structured task.");
  }

  const task = parseTask(rawTask);
  await recordContextPhaseStep({
    context,
    phase: planPhase,
    requestedAtMs,
    entries: collected.stepEntries,
    usage: collected.usage,
  });

  return { task, text: phaseOutput?.text ?? collected.text };
}

async function routeRequest(
  context: AgentLoopContext,
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

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["route"] | undefined;
  const rawDecision = phaseOutput ?? collected.structured;
  if (!rawDecision) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const decision = scheduleTaskRouting({
    input: latestUserInput(input.session),
    tools: input.tools,
    decision: parseTaskRoutingDecision(rawDecision),
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
  return { ...decision, text: phaseOutput?.text ?? decision.message };
}

async function executeToolCall(input: {
  context: AgentLoopContext;
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

  const toolContext = {
    session: input.context.state.session,
    task: input.task,
    toolCallId: input.toolCall.id,
    ...(input.context.runThread ? { runThread: input.context.runThread } : {}),
  };
  const output = await executeRuntimeToolCall({
    tools: input.context.config.tools,
    task: input.task,
    toolCall: input.toolCall,
    toolContext,
    beforeToolCall: input.context.config.beforeToolCall,
    afterToolCall: input.context.config.afterToolCall,
    signal: input.context.signal,
    observe: async (event) => {
      if (event.type === "approval_requested") {
        await input.context.emit({
          type: "tool_approval_requested",
          taskId: input.task.id,
          toolName: event.tool.name,
          args: event.args,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "approval_result") {
        await input.context.emit({
          type: "tool_approval_result",
          taskId: input.task.id,
          toolName: event.tool.name,
          args: event.args,
          decision: event.decision,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "tool_blocked") {
        await input.context.emit({
          type: "tool_blocked",
          toolName: event.tool.name,
          reason: event.reason,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "tool_start") {
        input.context.consumeLimit("toolCalls");
        await input.context.emit({
          type: "tool_start",
          toolName: event.tool.name,
          args: event.args,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "result_review_requested") {
        await input.context.emit({
          type: "tool_result_review_requested",
          taskId: input.task.id,
          toolName: event.tool.name,
          result: event.result,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "result_review_result") {
        await input.context.emit({
          type: "tool_result_review_result",
          taskId: input.task.id,
          toolName: event.tool.name,
          result: event.result,
          ts: nowIso(),
        });
        return;
      }

      await input.context.emit({
        type: "tool_end",
        toolName: event.toolName,
        result: event.result,
        ts: nowIso(),
      });
    },
  });

  return output;
}

async function executeTask(
  context: AgentLoopContext,
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

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["execute"] | undefined;
  return {
    text: phaseOutput?.text ?? collected.text,
    toolCalls: collected.toolCalls,
    taskOutput: createToolTaskOutput(input.toolResults),
  };
}

async function verifyTask(
  context: AgentLoopContext,
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

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["verify"] | undefined;
  const rawVerification = phaseOutput ?? collected.structured;
  const result = rawVerification
    ? parseVerificationResult(rawVerification)
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
  context: AgentLoopContext,
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
  await recordContextPhaseStep({
    context: createAgentLoopContext(input),
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
    createAgentLoopContext(input),
    verifyPhase,
    {
      session: input.session,
      task,
      taskOutput: threadOutput,
      criteria: task.acceptanceCriteria,
      runtime: runtimeDepth(input),
    },
    (phaseInput) => verifyTask(createAgentLoopContext(input), phaseInput),
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

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const normalized = normalizeAgentLoopInput(input);
  const runtime: AgentLoopRuntime = {
    ...normalized,
    messageLog: snapshotMessages(normalized.session.messages),
    limitUsage: { modelCalls: 0, toolCalls: 0 },
    threadDepth: normalized.threadDepth ?? 0,
    maxThreadDepth: resolveMaxThreadDepth(normalized.limits),
    verifyTasks: normalized.verifyTasks ?? true,
    status: "routing",
    attempt: 0,
    toolResults: [],
  };
  runtime.runThread = normalized.runThread ?? createNestedRunThread(runtime);
  const maxAttempts = normalized.maxAttempts ?? 2;
  let chatLogEnded = false;
  const endChatLog = async () => {
    if (!chatLogEnded) {
      await emitChatEnd(runtime);
      chatLogEnded = true;
    }
  };

  try {
    await emitThreadCreated(runtime);
    if (runtime.kind === "thread" && runtime.threadDepth > runtime.maxThreadDepth) {
      return completeThreadDepthExceeded(runtime);
    }

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
    const canStartThreadRoute = runtime.threadDepth < runtime.maxThreadDepth;
    const routePhaseResult = await runPhase(
      createAgentLoopContext(runtime),
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
      (phaseInput) => routeRequest(createAgentLoopContext(runtime), phaseInput),
    );
    if (routePhaseResult.type === "abort") {
      return completeRun(runtime, routePhaseResult.outcome, endChatLog);
    }
    const routed = routePhaseResult.output;
    if (routed.route === "direct") {
      const outcome = createDirectOutcome(routed.message);
      await publishConversationAssistantMessage(runtime, outcome.message, { kind: "direct_answer" });
      return completeRun(runtime, outcome, endChatLog);
    }

    if (routed.route === "thread") {
      const outcome = await executeThreadRoute(runtime, routed);
      if (outcome.passed) {
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
        });
      }
      return completeRun(runtime, outcome, endChatLog);
    }

    runtime.status = "planning";
    const planPhaseResult = await runPhase(
      createAgentLoopContext(runtime),
      planPhase,
      {
        session: runtime.session,
        runtime: runtimeDepth(runtime),
      },
      (phaseInput) => planTask(createAgentLoopContext(runtime), phaseInput),
    );
    if (planPhaseResult.type === "abort") {
      return completeRun(runtime, planPhaseResult.outcome, endChatLog);
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
        createAgentLoopContext(runtime),
        executePhase,
        {
          session: runtime.session,
          task,
          toolResults: runtime.toolResults,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => executeTask(createAgentLoopContext(runtime), phaseInput),
      );
      if (executePhaseResult.type === "abort") {
        return completeRun(runtime, executePhaseResult.outcome, endChatLog);
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
        return completeRun(runtime, outcome, endChatLog);
      }

      runtime.status = "verifying";
      const verifyPhaseResult = await runPhase(
        createAgentLoopContext(runtime),
        verifyPhase,
        {
          session: runtime.session,
          task,
          taskOutput: lastTaskOutput,
          criteria: task.acceptanceCriteria,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => verifyTask(createAgentLoopContext(runtime), phaseInput),
      );
      if (verifyPhaseResult.type === "abort") {
        return completeRun(runtime, verifyPhaseResult.outcome, endChatLog);
      }
      lastVerification = verifyPhaseResult.output;
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          taskId: task.id,
        });
        return completeRun(runtime, outcome, endChatLog);
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    return completeRun(runtime, outcome, endChatLog);
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
      return completeRun(runtime, outcome, endChatLog);
    }

    const errorInfo = makeError(error);
    await endChatLog();
    await emit(runtime, { type: "error", error: errorInfo, ts: nowIso() });
    throw error;
  }
}
