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
  RoutingDecision,
  Tool,
} from "./types";
import {
  createAgentState,
  createId,
  createMessage,
  nowIso,
  resolveMaxThreadDepth,
  Validators,
} from "./types";
import { runConfiguredPhase } from "./loop/phases";
import {
  assertNotAborted,
  cloneLimitUsage,
  createLimitExceededOutcome,
  LimitExceededError,
  makeError,
  runtimeDepth,
  snapshotMessage,
  snapshotMessages,
} from "./loop/shared";
import { createBuiltinPhaseConfig } from "./loop/built-in-phases";
import type { AgentPhaseConfig } from "./loop/phase-config";
import { validatePhaseConfig, resolvePhase } from "./loop/phase-config";

// ============================================================================
// Types
// ============================================================================

export type LoopRunInput = {
  kind: AgentRunResult["kind"];
  agentState: AgentState;
  model: AgentLoopInput["model"];
  stream: AgentLoopInput["stream"];
  tools: Tool[];
  maxAttempts?: AgentLoopInput["maxAttempts"];
  limits?: AgentLoopInput["limits"];
  threadDepth?: AgentLoopInput["threadDepth"];
  signal?: AgentLoopInput["signal"];
  runtime?: AgentLoopInput["runtime"];
  beforeToolCall?: AgentLoopInput["beforeToolCall"];
  afterToolCall?: AgentLoopInput["afterToolCall"];
  runThread?: RunThread;
  emit?: AgentLoopInput["emit"];
  phaseConfig?: AgentPhaseConfig;
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
  lastRouteDecision?: RoutingDecision;
};

// ============================================================================
// Runtime Factory
// ============================================================================

export function createLoopRuntime(input: AgentLoopInput): AgentLoopRuntime {
  const context = input.kind === "run"
    ? contextFromLoopInput(input)
    : contextFromLoopThreadInput(input);

  if (!context) {
    throw new Error("Agent loop runs require either context or state.");
  }

  const agentState = input.kind === "run" && input.state
    ? syncStateFromContext(input.state, context)
    : createStateFromContext(context, input.kind === "thread" ? {
        input: input.prompt,
        parentSessionId: input.parentSessionId,
        task: input.task,
        goal: input.goal,
      } : { id: "sessionId" in input ? input.sessionId : undefined });

  return {
    kind: input.kind,
    agentState,
    model: input.model,
    stream: input.stream,
    tools: input.tools ?? context.tools ?? [],
    maxAttempts: input.maxAttempts,
    limits: input.limits,
    threadDepth: input.threadDepth ?? (input.kind === "thread" ? 1 : 0),
    signal: input.signal,
    runtime: input.runtime,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    runThread: "runThread" in input ? input.runThread : undefined,
    emit: input.emit,
    phaseConfig: "phaseConfig" in input ? input.phaseConfig : undefined,
    transcript: snapshotMessages(agentState.messages),
    limitUsage: { modelCalls: 0, toolCalls: 0 },
    maxThreadDepth: resolveMaxThreadDepth(input.limits),
    status: "routing",
    attempt: 0,
    toolResults: [],
  };
}

// ============================================================================
// Event Emission
// ============================================================================

export async function emit(runtime: AgentLoopRuntime, event: AgentEvent): Promise<void> {
  runtime.agentState.updatedAt = event.ts;
  await runtime.emit?.(event);
}

export async function emitChat(
  runtime: AgentLoopRuntime,
  type: "chat_start" | "chat_end",
  extra?: { outcome?: Outcome; limitUsage?: AgentLimitUsage },
): Promise<void> {
  const threadMeta = runtime.kind === "thread" ? {
    parentSessionId: runtime.agentState.parentSessionId,
    prompt: runtime.agentState.input,
    ...(runtime.agentState.task ? { task: runtime.agentState.task } : {}),
    ...(runtime.agentState.goal ? { goal: runtime.agentState.goal } : {}),
    threadDepth: runtime.threadDepth,
    maxThreadDepth: runtime.maxThreadDepth,
  } : {};

  await emit(runtime, { type, sessionId: runtime.agentState.id, content: snapshotMessages(runtime.transcript), ...threadMeta, ...extra, ts: nowIso() });
}

// ============================================================================
// Message Management
// ============================================================================

export async function appendMessage(
  runtime: AgentLoopRuntime,
  message: AgentMessage,
  toState = false,
): Promise<void> {
  if (toState) {
    runtime.agentState.messages.push(message);
  }
  runtime.transcript.push(message);
  await emit(runtime, { type: "message_delta", delta: snapshotMessage(message), ts: nowIso() });
}

export async function appendAssistantMessage(
  runtime: AgentLoopRuntime,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await appendMessage(runtime, createMessage("assistant", content, metadata), true);
}

// ============================================================================
// Result Creation
// ============================================================================

export function createRunResult(runtime: AgentLoopRuntime, outcome: Outcome): AgentRunResult {
  const base = {
    sessionId: runtime.agentState.id,
    messages: snapshotMessages(runtime.agentState.messages),
    outcome,
    limitUsage: cloneLimitUsage(runtime.limitUsage),
    depth: runtimeDepth(runtime),
  };

  if (runtime.kind === "thread") {
    if (!runtime.agentState.parentSessionId || !runtime.agentState.input) {
      throw new Error("Thread run is missing parent state or prompt metadata.");
    }
    return {
      kind: "thread",
      parentSessionId: runtime.agentState.parentSessionId,
      prompt: runtime.agentState.input,
      ...(runtime.agentState.task ? { task: runtime.agentState.task } : {}),
      ...(runtime.agentState.goal ? { goal: runtime.agentState.goal } : {}),
      ...base,
    };
  }

  return { kind: "run", ...base };
}

export function createAgentLoopContext(runtime: AgentLoopRuntime): AgentLoopContext {
  return {
    systemPrompt: runtime.agentState.systemPrompt,
    messages: snapshotMessages(runtime.agentState.messages),
    tools: runtime.tools,
    skills: runtime.agentState.skills.slice(),
    config: {
      model: runtime.model,
      stream: runtime.stream,
      tools: runtime.tools,
      maxAttempts: runtime.maxAttempts ?? 2,
      ...(runtime.limits ? { limits: runtime.limits } : {}),
      ...(runtime.signal ? { signal: runtime.signal } : {}),
      ...(runtime.runtime ? { runtime: runtime.runtime } : {}),
      ...(runtime.beforeToolCall ? { beforeToolCall: runtime.beforeToolCall } : {}),
      ...(runtime.afterToolCall ? { afterToolCall: runtime.afterToolCall } : {}),
      ...(runtime.runThread ? { runThread: runtime.runThread } : {}),
    },
    state: {
      agentState: runtime.agentState,
      status: runtime.status,
      attempt: runtime.attempt,
      ...(runtime.currentTask ? { task: runtime.currentTask } : {}),
      toolResults: runtime.toolResults,
      limitUsage: runtime.limitUsage,
      depth: runtimeDepth(runtime),
      ...(runtime.lastExecuteText ? { lastExecuteText: runtime.lastExecuteText } : {}),
    },
    ...(runtime.signal ? { signal: runtime.signal } : {}),
    emit: (event) => emit(runtime, event),
    appendMessage: (message) => appendMessage(runtime, message),
    appendStateMessage: (message) => appendMessage(runtime, message, true),
    consumeLimit: (resource) => {
      const error = consumeLimit(runtime, resource);
      if (error) throw error;
    },
    ...(runtime.runThread ? { runThread: runtime.runThread } : {}),
  };
}

// ============================================================================
// Limit Management
// ============================================================================

export function consumeLimit(
  runtime: AgentLoopRuntime,
  resource: keyof AgentLimitUsage,
): LimitExceededError | undefined {
  runtime.limitUsage[resource] += 1;
  const limit = resource === "modelCalls" ? runtime.limits?.maxModelCalls : runtime.limits?.maxToolCalls;
  if (limit !== undefined && runtime.limitUsage[resource] > limit) {
    return new LimitExceededError({ resource, limit, usage: cloneLimitUsage(runtime.limitUsage) });
  }
  return undefined;
}

// ============================================================================
// Run Completion
// ============================================================================

export async function completeRun(runtime: AgentLoopRuntime, outcome: Outcome): Promise<AgentRunResult> {
  const result = createRunResult(runtime, outcome);
  await emitChat(runtime, "chat_end", {
    outcome: result.outcome,
    limitUsage: result.limitUsage,
  });
  await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
  return result;
}

// ============================================================================
// Context Helpers
// ============================================================================

function cloneContext(context: AgentRunContext): AgentRunContext {
  return {
    systemPrompt: context.systemPrompt,
    messages: snapshotMessages(context.messages),
    ...(context.tools ? { tools: context.tools.slice() } : {}),
    ...(context.skills ? { skills: context.skills.slice() } : {}),
  };
}

function contextFromState(state: AgentState, tools?: Tool[]): AgentRunContext {
  return {
    systemPrompt: state.systemPrompt,
    messages: snapshotMessages(state.messages),
    tools: tools?.slice() ?? [],
    skills: state.skills.slice(),
  };
}

function contextFromLoopInput(input: Extract<AgentLoopInput, { kind: "run" }>): AgentRunContext | undefined {
  if (input.context) return cloneContext(input.context);
  if (input.state) return contextFromState(input.state, input.tools);
  return undefined;
}

function contextFromLoopThreadInput(input: Extract<AgentLoopInput, { kind: "thread" }>): AgentRunContext {
  if (input.context) return cloneContext(input.context);
  return {
    systemPrompt: input.systemPrompt,
    messages: [createMessage("user", input.prompt, { scope: "conversation" })],
    tools: input.tools?.slice() ?? [],
    skills: input.skills?.slice() ?? [],
  };
}

function createStateFromContext(
  context: AgentRunContext,
  meta: { id?: string; input?: string; parentSessionId?: string; task?: string; goal?: string } = {},
): AgentState {
  const firstUser = context.messages.find((m) => m.role === "user");
  if (!firstUser) throw new Error("Agent context must include at least one user message.");

  const state = createAgentState({
    ...(meta.id ? { id: meta.id } : {}),
    systemPrompt: context.systemPrompt,
    input: meta.input ?? firstUser.content,
    skills: context.skills ?? [],
    ...(meta.parentSessionId ? { parentSessionId: meta.parentSessionId } : {}),
    ...(meta.task ? { task: meta.task } : {}),
    ...(meta.goal ? { goal: meta.goal } : {}),
  });

  if (context.messages.length > 0) {
    state.messages = snapshotMessages(context.messages);
  }
  state.skills = context.skills?.slice() ?? [];
  state.updatedAt = nowIso();
  return state;
}

function syncStateFromContext(state: AgentState, context: AgentRunContext): AgentState {
  state.systemPrompt = context.systemPrompt;
  if (context.messages.length > 0) {
    state.messages = snapshotMessages(context.messages);
  }
  state.skills = context.skills?.slice() ?? state.skills;
  state.updatedAt = nowIso();
  return state;
}

// ============================================================================
// Thread Creation
// ============================================================================

function createLoopThread(parent: AgentLoopRuntime): RunThread {
  return async (input) => {
    const result = await runAgentLoop({
      kind: "thread",
      ...input,
      parentSessionId: input.parentSessionId ?? parent.agentState.id,
      systemPrompt: parent.agentState.systemPrompt,
      model: parent.model,
      stream: parent.stream,
      signal: parent.signal,
      limits: input.limits ?? parent.limits,
      threadDepth: input.threadDepth ?? parent.threadDepth + 1,
      runtime: parent.runtime,
      beforeToolCall: parent.beforeToolCall,
      afterToolCall: parent.afterToolCall,
      emit: parent.emit,
    });
    if (result.kind !== "thread") {
      throw new Error("Nested thread runner returned a non-thread result.");
    }
    return result;
  };
}

// ============================================================================
// Main Loop
// ============================================================================

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const runtime = createLoopRuntime(input);
  runtime.runThread ??= createLoopThread(runtime);

  try {
    if (runtime.kind === "thread" && runtime.threadDepth > runtime.maxThreadDepth) {
      const outcome = Validators.outcome.Parse({
        id: createId("out"),
        passed: false,
        message: `Thread depth limit exceeded (${runtime.threadDepth}/${runtime.maxThreadDepth}).`,
      });
      return completeRun(runtime, outcome);
    }

    assertNotAborted(runtime.signal);
    await emitChat(runtime, "chat_start");

    return await runPhaseLoop(runtime);
  } catch (error) {
    return handleLoopError(runtime, error);
  }
}

async function runPhaseLoop(runtime: AgentLoopRuntime): Promise<AgentRunResult> {
  const config = runtime.phaseConfig ?? createBuiltinPhaseConfig();
  if (runtime.phaseConfig) validatePhaseConfig(config);

  let phaseId = config.entryPhaseId;

  while (phaseId) {
    assertNotAborted(runtime.signal);

    const definition = resolvePhase(config, phaseId);
    if (!definition) {
      throw new Error(`Phase "${phaseId}" is not defined in the phase config.`);
    }

    runtime.status = phaseId as AgentLoopRuntime["status"];
    const transition = await runConfiguredPhase(runtime, definition, async (input) => runtime.runThread!(input));

    if (transition.type === "stop" || transition.type === "abort") {
      return completeRun(runtime, transition.outcome);
    }

    phaseId = transition.phaseId;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
}

async function handleLoopError(runtime: AgentLoopRuntime, error: unknown): Promise<AgentRunResult> {
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
    return completeRun(runtime, outcome);
  }

  await emit(runtime, { type: "error", error: makeError(error), ts: nowIso() });
  throw error;
}
