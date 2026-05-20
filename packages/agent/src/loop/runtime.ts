import type {
  AgentContext as AgentRunContext,
  AgentEvent,
  AgentLimitUsage,
  AgentLoopContext,
  AgentLoopInput,
  AgentMessage,
  AgentRunResult,
  AgentState,
  Outcome,
  RunThread,
  Tool,
} from "../types";
import {
  createAgentState,
  createId,
  createMessage,
  nowIso,
  resolveMaxThreadDepth,
  Validators,
} from "../types";
import {
  cloneLimitUsage,
  LimitExceededError,
  runtimeDepth,
  snapshotMessage,
  snapshotMessages,
} from "./shared";

export type LoopRunInput = {
  kind: AgentRunResult["kind"];
  agentState: AgentState;
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
  emit?: AgentLoopInput["emit"];
};

export type AgentLoopRuntime = LoopRunInput & {
  transcript: AgentMessage[];
  limitUsage: AgentLimitUsage;
  threadDepth: number;
  maxThreadDepth: number;
  status: AgentLoopContext["state"]["status"];
  attempt: number;
  toolResults: AgentLoopContext["state"]["toolResults"];
  currentTask?: AgentLoopContext["state"]["task"];
  lastExecuteText?: string;
};

export function normalizeLoopInput(input: AgentLoopInput): LoopRunInput {
  if (input.kind === "run") {
    const context = input.context
      ? cloneAgentRunContext(input.context)
      : input.state
        ? contextFromAgentState(input.state, input.tools)
        : undefined;
    if (!context) {
      throw new Error("Agent loop runs require either context or state.");
    }
    const agentState = input.state
      ? syncAgentStateFromContext(input.state, context)
      : createAgentStateFromContext(context, { id: input.sessionId });

    return {
      kind: "run",
      agentState,
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
      emit: input.emit,
    };
  }

  const context = contextFromThreadInput(input);
  const agentState = createAgentStateFromContext(context, {
    input: input.prompt,
    parentSessionId: input.parentSessionId,
    task: input.task,
    goal: input.goal,
  });

  return {
    kind: "thread",
    agentState,
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

export function createLoopRuntime(input: AgentLoopInput): AgentLoopRuntime {
  const normalized = normalizeLoopInput(input);
  return {
    ...normalized,
    transcript: snapshotMessages(normalized.agentState.messages),
    limitUsage: { modelCalls: 0, toolCalls: 0 },
    threadDepth: normalized.threadDepth ?? 0,
    maxThreadDepth: resolveMaxThreadDepth(normalized.limits),
    verifyTasks: normalized.verifyTasks ?? true,
    status: "routing",
    attempt: 0,
    toolResults: [],
  };
}

export async function emit(input: AgentLoopRuntime, event: AgentEvent): Promise<void> {
  input.agentState.updatedAt = event.ts;
  await input.emit?.(event);
}

export function createAgentRunResult(input: AgentLoopRuntime, outcome: Outcome): AgentRunResult {
  const base = {
    sessionId: input.agentState.id,
    messages: snapshotMessages(input.agentState.messages),
    outcome,
    limitUsage: cloneLimitUsage(input.limitUsage),
    depth: runtimeDepth(input),
  };

  if (input.kind === "thread") {
    if (!input.parentSessionId || !input.prompt) {
      throw new Error("Thread run is missing parent state or prompt metadata.");
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
    kind: "run",
    ...base,
  };
}

export function createAgentLoopContext(input: AgentLoopRuntime): AgentLoopContext {
  return {
    systemPrompt: input.agentState.systemPrompt,
    messages: snapshotMessages(input.agentState.messages),
    tools: input.tools,
    skills: input.agentState.skills.slice(),
    config: {
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
      agentState: input.agentState,
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
    appendEventMessage: (message) => appendEventMessage(input, message),
    appendAgentStateMessage: (message) => appendAgentStateMessage(input, message),
    consumeLimit: (resource) => {
      const limitError = consumeLimit(input, resource);
      if (limitError) {
        throw limitError;
      }
    },
    ...(input.runThread ? { runThread: input.runThread } : {}),
  };
}

export function consumeLimit(
  input: AgentLoopRuntime,
  resource: keyof AgentLimitUsage,
): LimitExceededError | undefined {
  input.limitUsage[resource] += 1;
  const limit = resource === "modelCalls" ? input.limits?.maxModelCalls : input.limits?.maxToolCalls;

  if (limit !== undefined && input.limitUsage[resource] > limit) {
    return new LimitExceededError({
      resource,
      limit,
      usage: cloneLimitUsage(input.limitUsage),
    });
  }

  return undefined;
}

export async function emitThreadCreated(input: AgentLoopRuntime): Promise<void> {
  if (input.kind !== "thread" || !input.parentSessionId || !input.prompt) {
    return;
  }

  await emit(input, {
    type: "thread_created",
    parentSessionId: input.parentSessionId,
    sessionId: input.agentState.id,
    prompt: input.prompt,
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
    threadDepth: input.threadDepth,
    maxThreadDepth: input.maxThreadDepth,
    ts: nowIso(),
  });
}

export async function emitThreadEnd(input: AgentLoopRuntime, result: AgentRunResult): Promise<void> {
  if (result.kind !== "thread") {
    return;
  }

  await emit(input, {
    type: "thread_end",
    parentSessionId: result.parentSessionId,
    sessionId: result.sessionId,
    outcome: result.outcome,
    limitUsage: result.limitUsage,
    threadDepth: result.depth.threadDepth,
    maxThreadDepth: result.depth.maxThreadDepth,
    ts: nowIso(),
  });
}

export async function completeRun(
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

export async function completeThreadDepthExceeded(input: AgentLoopRuntime): Promise<AgentRunResult> {
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

export async function emitChatStart(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "chat_start",
    content: snapshotMessages(input.transcript),
    ts: nowIso(),
  });
}

export async function appendEventMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.transcript.push(message);
  await emit(input, {
    type: "message_delta",
    delta: snapshotMessage(message),
    ts: nowIso(),
  });
}

export async function appendAgentStateMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.agentState.messages.push(message);
  await appendEventMessage(input, message);
}

export async function publishConversationAssistantMessage(
  input: AgentLoopRuntime,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendAgentStateMessage(input, createMessage("assistant", content, {
    ...metadata,
    scope: "conversation",
  }));
}

export async function emitChatEnd(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "chat_end",
    content: snapshotMessages(input.transcript),
    ts: nowIso(),
  });
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

function contextFromAgentState(state: AgentState, tools?: Tool[]): AgentRunContext {
  return {
    systemPrompt: state.systemPrompt,
    messages: snapshotMessages(state.messages),
    tools: tools?.slice() ?? [],
    skills: state.skills.slice(),
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

function createAgentStateFromContext(
  context: AgentRunContext,
  input: {
    id?: string;
    input?: string;
    parentSessionId?: string;
    task?: string;
    goal?: string;
  } = {},
): AgentState {
  const state = createAgentState({
    ...(input.id ? { id: input.id } : {}),
    systemPrompt: context.systemPrompt,
    input: input.input ?? firstUserInput(context.messages),
    skills: context.skills ?? [],
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    ...(input.task ? { task: input.task } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
  });

  if (context.messages.length > 0) {
    state.messages = snapshotMessages(context.messages);
  }
  state.skills = context.skills?.slice() ?? [];
  state.updatedAt = nowIso();
  return state;
}

function syncAgentStateFromContext(state: AgentState, context: AgentRunContext): AgentState {
  state.systemPrompt = context.systemPrompt;
  if (context.messages.length > 0) {
    state.messages = snapshotMessages(context.messages);
  }
  state.skills = context.skills?.slice() ?? state.skills;
  state.updatedAt = nowIso();
  return state;
}
