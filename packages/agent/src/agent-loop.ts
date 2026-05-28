import { extractJsonObject } from "./loop/response-parser";
import type {
  AgentContext as AgentRunContext,
  AgentEvent,
  AgentLimitUsage,
  AgentLoopContext,
  AgentLoopInput,
  AgentMessage,
  AgentRunResult,
  AgentState,
  LlmStreamEvent,
  LoopPhase,
  Outcome,
  RunThread,
  Tool,
  ToolCall,
  ToolResult,
} from "./types";
import {
  createAgentState,
  createMessage,
  nowIso,
  resolveMaxThreadDepth,
} from "./types";
import {
  createBuiltinPhaseConfig,
  getPhaseHandler,
  resolvePhase,
  validatePhaseConfig,
  type AgentPhaseConfig,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseInput,
  type PhaseOutput,
} from "./loop/phases";
import { buildPrompt } from "./loop/phases";
import { executeRuntimeToolCall } from "./harness/tools";
import { assertNotAborted, LimitExceededError } from "./loop/errors";
import {
  createDefaultOutcome,
  createDefaultPhaseOutcome,
  createLimitExceededOutcome,
  createMaxVisitsOutcome,
  createThreadDepthLimitOutcome,
} from "./loop/outcomes";
import {
  cloneLimitUsage,
  runtimeDepth,
  snapshotMessage,
  snapshotMessages,
} from "./loop/state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAbort(value: unknown): value is { abort: Outcome } {
  return isRecord(value) && isRecord(value.abort);
}

function hasSkip(value: unknown): value is { skip: unknown } {
  return isRecord(value) && "skip" in value;
}

function hasInput(value: unknown): value is { input: unknown } {
  return isRecord(value) && "input" in value;
}

function hasOutput(value: unknown): value is { output: unknown } {
  return isRecord(value) && "output" in value;
}

function hasRetry(value: unknown): value is { retry: unknown } {
  return isRecord(value) && "retry" in value;
}

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
  currentPhase: string;
  attempt: number;
  lastExecuteText?: string;
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
    currentPhase: "",
    attempt: 0,
  };
}

// ============================================================================
// Event Emission
// ============================================================================

export async function emit(runtime: AgentLoopRuntime, event: AgentEvent): Promise<void> {
  runtime.agentState.updatedAt = event.ts;
  await runtime.emit?.(event);
}

export async function emitTurn(
  runtime: AgentLoopRuntime,
  type: "turn_start" | "turn_end",
  extra?: { outcome?: Outcome; limitUsage?: AgentLimitUsage },
): Promise<void> {
  const threadMeta = runtime.kind === "thread" ? {
    parentSessionId: runtime.agentState.parentSessionId,
    prompt: runtime.agentState.input,
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
  // No auto event emission — use PhaseContext.message for lifecycle events
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
      currentPhase: runtime.currentPhase,
      attempt: runtime.attempt,
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
  await emitTurn(runtime, "turn_end", {
    outcome: result.outcome,
    limitUsage: result.limitUsage,
  });
  return result;
}

// ============================================================================
// Phase Capabilities
// ============================================================================

async function collectTextAndStructured(input: {
  context: AgentLoopContext;
  message: import("./loop/phases/config").PhaseMessageManager;
  events: AsyncIterable<LlmStreamEvent>;
  metadataPhase: string;
  recordText?: boolean;
}): Promise<{
  text: string;
  structured?: unknown;
}> {
  let text = "";
  let flushedText = "";
  let activeMessageId: string | undefined;

  for await (const event of input.events) {
    assertNotAborted(input.context.signal);

    if (event.type === "model_requested") {
      input.context.consumeLimit("modelCalls");
    }

    if (event.type === "text_delta") {
      text += event.text;
      if (!activeMessageId) {
        activeMessageId = input.message.start("assistant", event.text, {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: "execution",
        });
      } else {
        await input.message.update(activeMessageId, event.text);
      }
    }

    if (event.type === "done") {
      if (activeMessageId) {
        await input.message.end(activeMessageId);
        flushedText += text;
        activeMessageId = undefined;
        text = "";
      }
    }
  }

  if (activeMessageId) {
    await input.message.end(activeMessageId);
    flushedText += text;
  }

  let structured: unknown;
  try {
    structured = extractJsonObject(flushedText);
  } catch {
    // Response is not JSON — structured remains undefined
  }

  return { text: flushedText, structured };
}

async function executeToolCall(input: {
  context: AgentLoopContext;
  toolCall: ToolCall;
}): Promise<ToolResult> {
  if (input.context.config.runtime?.tools) {
    return input.context.config.runtime.tools({
      context: input.context,
      toolCall: input.toolCall,
    });
  }

  const toolContext = {
    state: input.context.state.agentState,
    toolCallId: input.toolCall.id,
    ...(input.context.runThread ? { runThread: input.context.runThread } : {}),
  };
  return executeRuntimeToolCall({
    tools: input.context.config.tools,
    toolCall: input.toolCall,
    toolContext,
    beforeToolCall: input.context.config.beforeToolCall,
    afterToolCall: input.context.config.afterToolCall,
    signal: input.context.signal,
  });
}

function createPhaseContext(
  runtime: AgentLoopRuntime,
  definition: PhaseDefinition,
  loopContext: AgentLoopContext,
  availablePhases: PhaseContext["availablePhases"],
): PhaseContext {
  // Track active messages for streaming lifecycle
  const activeMessages = new Map<string, AgentMessage>();

  const messageManager = {
    start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>) {
      const msg = createMessage(role, content, metadata);
      activeMessages.set(msg.id, msg);
      emit(runtime, { type: "message_start", message: snapshotMessage(msg), ts: nowIso() });
      return msg.id;
    },
    async update(messageId: string, delta: string) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      msg.content += delta;
      await emit(runtime, {
        type: "message_update",
        message: snapshotMessage(msg),
        delta,
        ts: nowIso(),
      });
    },
    async end(messageId: string) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      activeMessages.delete(messageId);
      runtime.transcript.push(msg);
      // Only persist conversation-scoped messages to agent state
      if (msg.metadata?.scope === "conversation") {
        runtime.agentState.messages.push(msg);
      }
      await emit(runtime, { type: "message_end", message: snapshotMessage(msg), ts: nowIso() });
    },
  };

  return {
    phaseId: definition.id,
    state: loopContext.state,
    messages: {
      visible: () => [...runtime.transcript],
      append: (message) => appendMessage(runtime, message),
      appendState: (message) => appendMessage(runtime, message, true),
    },
    message: messageManager,
    toolExecution: {
      async start(toolCallId, toolName, args) {
        await emit(runtime, {
          type: "tool_execution_start",
          toolCallId,
          toolName,
          args,
          ts: nowIso(),
        });
      },
      async update(_toolCallId, _partialResult) {
        // tool_execution_update — reserved for future use
      },
      async end(toolCallId, toolName, result, isError) {
        await emit(runtime, {
          type: "tool_execution_end",
          toolCallId,
          toolName,
          result,
          isError,
          ts: nowIso(),
        });
      },
    },
    model: {
      collect: async (input) => {
        const prompt = buildPrompt({
          context: input.input,
          tools: loopContext.tools,
        });
        const [systemMsg, ...rest] = prompt.messages;
        return collectTextAndStructured({
          context: loopContext,
          message: messageManager,
          events: loopContext.config.stream({
            model: loopContext.config.model,
            system: systemMsg?.role === "system" ? systemMsg.content : undefined,
            messages: rest.filter((m) => m.role !== "system") as Array<{ role: "user" | "assistant"; content: string }>,
            tools: loopContext.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          }, { signal: loopContext.signal }),
          metadataPhase: input.phase,
          recordText: input.recordText,
        });
      },
    },
    tools: {
      execute: async (input) => {
        return executeToolCall({
          context: loopContext,
          toolCall: input.toolCall,
        });
      },
    },
    runs: {
      create: async (input) => runtime.runThread!(input),
    },
    skills: runtime.agentState.skills.slice(),
    emit: (event) => emit(runtime, event),
    consumeLimit: (resource) => {
      const error = consumeLimit(runtime, resource);
      if (error) throw error;
    },
    maxAttempts: runtime.maxAttempts,
    incrementAttempt() {
      runtime.attempt += 1;
      loopContext.state.attempt = runtime.attempt;
    },
    setLastExecuteText(text) {
      runtime.lastExecuteText = text;
    },
    availablePhases,
    ...(runtime.signal ? { signal: runtime.signal } : {}),
  };
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
  meta: { id?: string; input?: string; parentSessionId?: string } = {},
): AgentState {
  const firstUser = context.messages.find((m) => m.role === "user");
  if (!firstUser) throw new Error("Agent context must include at least one user message.");

  const state = createAgentState({
    ...(meta.id ? { id: meta.id } : {}),
    systemPrompt: context.systemPrompt,
    input: meta.input ?? firstUser.content,
    skills: context.skills ?? [],
    ...(meta.parentSessionId ? { parentSessionId: meta.parentSessionId } : {}),
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
  return runWithLifecycle(runtime, runLoop);
}

async function runWithLifecycle(
  runtime: AgentLoopRuntime,
  loop: (runtime: AgentLoopRuntime) => Promise<AgentRunResult>,
): Promise<AgentRunResult> {
  try {
    if (runtime.kind === "thread" && runtime.threadDepth > runtime.maxThreadDepth) {
      const outcome = createThreadDepthLimitOutcome({
        threadDepth: runtime.threadDepth,
        maxThreadDepth: runtime.maxThreadDepth,
      });
      return completeRun(runtime, outcome);
    }

    assertNotAborted(runtime.signal);
    await emitTurn(runtime, "turn_start");

    return await loop(runtime);
  } catch (error) {
    return handleLoopError(runtime, error);
  }
}

async function runLoop(runtime: AgentLoopRuntime): Promise<AgentRunResult> {
  const config = runtime.phaseConfig ?? createBuiltinPhaseConfig();
  if (runtime.phaseConfig) validatePhaseConfig(config);
  runtime.phaseConfig = config;

  const availablePhases = config.phases.map((p) => ({ id: p.id, name: p.name, description: p.description }));

  let currentPhaseId = config.entryPhaseId;
  let lastYield: unknown;
  const phaseVisits = new Map<string, number>();

  while (currentPhaseId) {
    assertNotAborted(runtime.signal);

    const definition = resolvePhase(config, currentPhaseId);
    if (!definition) {
      throw new Error(`Phase "${currentPhaseId}" is not defined in the phase config.`);
    }

    const handler = getPhaseHandler(currentPhaseId);
    runtime.currentPhase = currentPhaseId;

    // Generic visit limit
    const visits = (phaseVisits.get(currentPhaseId) ?? 0) + 1;
    phaseVisits.set(currentPhaseId, visits);
    if (visits > (handler?.conversationLimit ?? 20)) {
      return completeRun(runtime, createMaxVisitsOutcome(currentPhaseId));
    }

    const loopContext = createAgentLoopContext(runtime);
    const context = createPhaseContext(runtime, definition, loopContext, availablePhases);

    if (handler?.prepare) handler.prepare(context);

    // Build unified input with yield from previous phase
    let phaseInput = handler
      ? await handler.buildInput(context, lastYield)
      : undefined;

    // Emit phase_start
    await emit(runtime, { type: "phase_start", phase: currentPhaseId, ts: nowIso() });

    // beforePhase hook
    if (runtime.runtime?.beforePhase) {
      const before = await runtime.runtime.beforePhase(
        loopContext,
        definition.id as LoopPhase,
        phaseInput as never,
      );
      if (hasAbort(before)) {
        await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
        return completeRun(runtime, before.abort);
      }
      if (hasSkip(before)) {
        // Skip: use the skip output's route
        const skipOutput = before.skip as { route: string; message: string };
        await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
        if (skipOutput.route === "stop") {
          return completeRun(runtime, {
            id: "skip",
            passed: true,
            message: skipOutput.message || "Skipped.",
          });
        }
        currentPhaseId = skipOutput.route;
        continue;
      }
      if (hasInput(before) && before.input) {
        phaseInput = before.input as PhaseInput;
      }
    }

    // Run phase
    let output = await definition.run(context, phaseInput!);

    // afterPhase hook
    if (runtime.runtime?.afterPhase) {
      let retries = 0;

      while (true) {
        const after = await runtime.runtime.afterPhase(
          loopContext,
          definition.id as LoopPhase,
          output as never,
        );
        if (hasAbort(after)) {
          await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
          return completeRun(runtime, after.abort);
        }
        if (hasRetry(after) && after.retry) {
          retries += 1;
          if (retries > 3) {
            throw new Error(`Runtime requested too many ${currentPhaseId} phase retries.`);
          }
          output = await definition.run(context, after.retry as PhaseInput);
          continue;
        }
        if (hasOutput(after) && after.output) {
          output = after.output as PhaseOutput;
        }
        break;
      }
    }

    // Finalize (side effects)
    await handler?.finalize?.(context, output);

    // Emit phase_end
    await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });

    // ★ Read route — main loop contains no phase-specific routing logic
    if (output.route === "stop") {
      // Create AgentRunState from runtime for createOutcome
      const outcome = handler?.createOutcome?.(output)
        ?? createDefaultOutcome(output);
      const yieldTask = (output.yield as Record<string, unknown> | undefined)?.task;
      if (yieldTask && typeof yieldTask === "object" && "status" in yieldTask) {
        (yieldTask as { status: string }).status = outcome.passed ? "passed" : "failed";
      }
      return completeRun(runtime, outcome);
    }

    // Validate route target exists
    if (!config.phases.some((p) => p.id === output.route)) {
      return completeRun(runtime, createDefaultPhaseOutcome());
    }

    // Pass yield to next phase
    lastYield = output.yield;
    currentPhaseId = output.route;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
}

async function handleLoopError(runtime: AgentLoopRuntime, error: unknown): Promise<AgentRunResult> {
  if (error instanceof LimitExceededError) {
    const outcome = createLimitExceededOutcome(error);
    return completeRun(runtime, outcome);
  }

  throw error;
}
