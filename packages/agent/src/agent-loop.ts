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
import type { AgentLoopConfig, AgentRunState } from "./loop/types";

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
// Lifecycle Factory
// ============================================================================

export function createLoopLifecycle(
  input: AgentLoopInput,
): { config: AgentLoopConfig; state: AgentRunState } {
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

  const config: AgentLoopConfig = {
    kind: input.kind,
    model: input.model,
    stream: input.stream,
    tools: input.tools ?? context.tools ?? [],
    maxAttempts: input.maxAttempts ?? 2,
    limits: input.limits,
    signal: input.signal,
    runtime: input.runtime,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    runThread: "runThread" in input ? input.runThread : undefined,
    emit: input.emit,
    phaseConfig: "phaseConfig" in input ? input.phaseConfig : undefined,
  };

  const state: AgentRunState = {
    agentState,
    currentPhase: "",
    attempt: 0,
    limitUsage: { modelCalls: 0, toolCalls: 0 },
    depth: {
      threadDepth: input.threadDepth ?? (input.kind === "thread" ? 1 : 0),
      maxThreadDepth: resolveMaxThreadDepth(input.limits),
    },
    transcript: snapshotMessages(agentState.messages),
  };

  return { config, state };
}

// ============================================================================
// Event Emission
// ============================================================================

function emit(
  state: AgentRunState,
  emitFn: ((event: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  state.agentState.updatedAt = event.ts;
  emitFn?.(event);
}

function emitTurn(
  config: Pick<AgentLoopConfig, "kind">,
  state: AgentRunState,
  emitFn: ((event: AgentEvent) => void) | undefined,
  type: "turn_start" | "turn_end",
  extra?: { outcome?: Outcome; limitUsage?: AgentLimitUsage },
): void {
  const threadMeta = config.kind === "thread" ? {
    parentSessionId: state.agentState.parentSessionId,
    prompt: state.agentState.input,
    threadDepth: state.depth.threadDepth,
    maxThreadDepth: state.depth.maxThreadDepth,
  } : {};

  emit(state, emitFn, {
    type,
    sessionId: state.agentState.id,
    content: snapshotMessages(state.transcript),
    ...threadMeta,
    ...extra,
    ts: nowIso(),
  });
}

// ============================================================================
// Message Management
// ============================================================================

function appendMessage(
  state: AgentRunState,
  message: AgentMessage,
  toState = false,
): void {
  if (toState) {
    state.agentState.messages.push(message);
  }
  state.transcript.push(message);
}

// ============================================================================
// Limit Management
// ============================================================================

function consumeLimit(
  state: AgentRunState,
  limits: AgentLoopConfig["limits"],
  resource: keyof AgentLimitUsage,
): LimitExceededError | undefined {
  state.limitUsage[resource] += 1;
  const limit = resource === "modelCalls" ? limits?.maxModelCalls : limits?.maxToolCalls;
  if (limit !== undefined && state.limitUsage[resource] > limit) {
    return new LimitExceededError({ resource, limit, usage: cloneLimitUsage(state.limitUsage) });
  }
  return undefined;
}

// ============================================================================
// Result Creation
// ============================================================================

function createRunResult(
  config: Pick<AgentLoopConfig, "kind">,
  state: AgentRunState,
  outcome: Outcome,
): AgentRunResult {
  const base = {
    sessionId: state.agentState.id,
    messages: snapshotMessages(state.agentState.messages),
    outcome,
    limitUsage: cloneLimitUsage(state.limitUsage),
    depth: runtimeDepth(state.depth),
  };

  if (config.kind === "thread") {
    if (!state.agentState.parentSessionId || !state.agentState.input) {
      throw new Error("Thread run is missing parent state or prompt metadata.");
    }
    return {
      kind: "thread",
      parentSessionId: state.agentState.parentSessionId,
      prompt: state.agentState.input,
      ...base,
    };
  }

  return { kind: "run", ...base };
}

// ============================================================================
// Run Completion
// ============================================================================

function completeRun(
  config: AgentLoopConfig,
  state: AgentRunState,
  outcome: Outcome,
): AgentRunResult {
  return createRunResult(config, state, outcome);
}

// ============================================================================
// Context Factory
// ============================================================================

function createAgentLoopContext(
  config: AgentLoopConfig,
  state: AgentRunState,
): AgentLoopContext {
  return {
    systemPrompt: state.agentState.systemPrompt,
    messages: snapshotMessages(state.agentState.messages),
    tools: config.tools,
    skills: state.agentState.skills.slice(),
    config,
    state,
    ...(config.signal ? { signal: config.signal } : {}),
    emit: (event) => emit(state, config.emit, event),
    appendMessage: (message) => appendMessage(state, message),
    appendStateMessage: (message) => appendMessage(state, message, true),
    consumeLimit: (resource) => {
      const error = consumeLimit(state, config.limits, resource);
      if (error) throw error;
    },
    ...(config.runThread ? { runThread: config.runThread } : {}),
  };
}

// ============================================================================
// Thread Creation
// ============================================================================

function createLoopThread(
  parentConfig: AgentLoopConfig,
  parentState: AgentRunState,
): RunThread {
  return async (input) => {
    const result = await runAgentLoop({
      kind: "thread",
      ...input,
      parentSessionId: input.parentSessionId ?? parentState.agentState.id,
      systemPrompt: parentState.agentState.systemPrompt,
      model: parentConfig.model,
      stream: parentConfig.stream,
      signal: parentConfig.signal,
      limits: input.limits ?? parentConfig.limits,
      threadDepth: input.threadDepth ?? parentState.depth.threadDepth + 1,
      runtime: parentConfig.runtime,
      beforeToolCall: parentConfig.beforeToolCall,
      afterToolCall: parentConfig.afterToolCall,
      emit: parentConfig.emit,
    });
    if (result.kind !== "thread") {
      throw new Error("Nested thread runner returned a non-thread result.");
    }
    return result;
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
// Main Loop
// ============================================================================

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const { config: initialConfig, state } = createLoopLifecycle(input);
  const config = { ...initialConfig };
  config.runThread ??= createLoopThread(config, state);
  const emitFn = config.emit;

  emit(state, emitFn, { type: "agent_start", ts: nowIso() });

  try {
    if (config.kind === "thread" && state.depth.threadDepth > state.depth.maxThreadDepth) {
      const outcome = createThreadDepthLimitOutcome({
        threadDepth: state.depth.threadDepth,
        maxThreadDepth: state.depth.maxThreadDepth,
      });
      return completeRun(config, state, outcome);
    }

    assertNotAborted(config.signal);

    const result = await runLoop(config, state);
    return result;
  } catch (error) {
    if (error instanceof LimitExceededError) {
      const outcome = createLimitExceededOutcome(error);
      return completeRun(config, state, outcome);
    }
    throw error;
  } finally {
    emit(state, emitFn, {
      type: "agent_end",
      messages: snapshotMessages(state.agentState.messages),
      ts: nowIso(),
    });
  }
}

async function runLoop(
  config: AgentLoopConfig,
  state: AgentRunState,
): Promise<AgentRunResult> {
  const phaseConfig = config.phaseConfig ?? createBuiltinPhaseConfig();
  if (config.phaseConfig) validatePhaseConfig(phaseConfig);
  config.phaseConfig = phaseConfig;

  const availablePhases = phaseConfig.phases.map((p) => ({ id: p.id, name: p.name, description: p.description }));

  let currentPhaseId = phaseConfig.entryPhaseId;
  let lastYield: unknown;
  const phaseVisits = new Map<string, number>();

  while (currentPhaseId) {
    assertNotAborted(config.signal);

    const phase = resolvePhase(phaseConfig, currentPhaseId);
    if (!phase) {
      throw new Error(`Phase "${currentPhaseId}" is not defined in the phase config.`);
    }

    const handler = getPhaseHandler(currentPhaseId);
    state.currentPhase = currentPhaseId;

    // Generic visit limit
    const visits = (phaseVisits.get(currentPhaseId) ?? 0) + 1;
    phaseVisits.set(currentPhaseId, visits);
    if (visits > (handler?.conversationLimit ?? 20)) {
      return completeRun(config, state, createMaxVisitsOutcome(currentPhaseId));
    }

    const loopContext = createAgentLoopContext(config, state);
    const context = createPhaseContext(config, state, phase, loopContext, availablePhases);

    if (handler?.prepare) handler.prepare(context);

    // Build unified input with yield from previous phase
    let phaseInput = handler
      ? await handler.buildInput(context, lastYield)
      : undefined;

    // Emit phase_start
    emit(state, config.emit, { type: "phase_start", phase: currentPhaseId, ts: nowIso() });

    // beforePhase hook
    if (config.runtime?.beforePhase) {
      const before = await config.runtime.beforePhase(
        loopContext,
        phase.id as LoopPhase,
        phaseInput as never,
      );
      if (hasAbort(before)) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
        return completeRun(config, state, before.abort);
      }
      if (hasSkip(before)) {
        // Skip: use the skip output's route
        const skipOutput = before.skip as { route: string; message: string };
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
        if (skipOutput.route === "stop") {
          return completeRun(config, state, {
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
    let output = await phase.run(context, phaseInput!);

    // afterPhase hook
    if (config.runtime?.afterPhase) {
      let retries = 0;

      while (true) {
        const after = await config.runtime.afterPhase(
          loopContext,
          phase.id as LoopPhase,
          output as never,
        );
        if (hasAbort(after)) {
          emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
          return completeRun(config, state, after.abort);
        }
        if (hasRetry(after) && after.retry) {
          retries += 1;
          if (retries > 3) {
            throw new Error(`Runtime requested too many ${currentPhaseId} phase retries.`);
          }
          output = await phase.run(context, after.retry as PhaseInput);
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
    emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });

    // Read route — main loop contains no phase-specific routing logic
    if (output.route === "stop") {
      // Persist outcome message to session without emitting message events
      if (output.message?.trim()) {
        const outcomeMsg = createMessage("assistant", output.message, {
          kind: "outcome",
          phase: currentPhaseId,
          scope: "conversation",
        });
        state.agentState.messages.push(outcomeMsg);
        state.transcript.push(outcomeMsg);
      }

      const outcome = handler?.createOutcome?.(output)
        ?? createDefaultOutcome(output);
      const yieldTask = (output.yield as Record<string, unknown> | undefined)?.task;
      if (yieldTask && typeof yieldTask === "object" && "status" in yieldTask) {
        (yieldTask as { status: string }).status = outcome.passed ? "passed" : "failed";
      }
      return completeRun(config, state, outcome);
    }

    // Validate route target exists
    if (!phaseConfig.phases.some((p) => p.id === output.route)) {
      return completeRun(config, state, createDefaultPhaseOutcome());
    }

    // Pass yield to next phase
    lastYield = output.yield;
    currentPhaseId = output.route;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
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
  config: AgentLoopConfig,
  state: AgentRunState,
  phase: PhaseDefinition,
  loopContext: AgentLoopContext,
  availablePhases: PhaseContext["availablePhases"],
): PhaseContext {
  // Track active messages for streaming lifecycle
  const activeMessages = new Map<string, AgentMessage>();

  const messageManager = {
    start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>) {
      const msg = createMessage(role, content, metadata);
      activeMessages.set(msg.id, msg);
      emit(state, config.emit, { type: "message_start", message: snapshotMessage(msg), ts: nowIso() });
      return msg.id;
    },
    async update(messageId: string, delta: string) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      msg.content += delta;
      emit(state, config.emit, {
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
      state.transcript.push(msg);
      // Only persist conversation-scoped messages to agent state
      if (msg.metadata?.scope === "conversation") {
        state.agentState.messages.push(msg);
      }
      emit(state, config.emit, { type: "message_end", message: snapshotMessage(msg), ts: nowIso() });
    },
  };

  return {
    phaseId: phase.id,
    state: loopContext.state,
    messages: {
      visible: () => [...state.transcript],
      append: (message) => appendMessage(state, message),
      appendState: (message) => appendMessage(state, message, true),
    },
    message: messageManager,
    toolExecution: {
      async start(toolCallId, toolName, args) {
        emit(state, config.emit, {
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
        emit(state, config.emit, {
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
          toolResults: input.toolResults,
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
      create: async (input) => config.runThread!(input),
    },
    skills: state.agentState.skills.slice(),
    emit: (event) => emit(state, config.emit, event),
    consumeLimit: (resource) => {
      const error = consumeLimit(state, config.limits, resource);
      if (error) throw error;
    },
    turn: async (fn) => {
      emitTurn(config, state, config.emit, "turn_start");
      try {
        return await fn();
      } finally {
        emitTurn(config, state, config.emit, "turn_end");
      }
    },
    maxAttempts: config.maxAttempts,
    incrementAttempt() {
      state.attempt += 1;
      loopContext.state.attempt = state.attempt;
    },
    setLastExecuteText(text) {
      state.lastExecuteText = text;
    },
    availablePhases,
    ...(config.signal ? { signal: config.signal } : {}),
  };
}
