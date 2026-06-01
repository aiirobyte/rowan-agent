import type {
  AgentContext as AgentRunContext,
  AgentEvent,
  AgentLoopContext,
  AgentLoopInput,
  AgentMessage,
  RunResult,
  AgentState,
  LlmStreamEvent,
  LoopPhase,
  Outcome,
  RunThread,
  Tool,
  ToolCall,
  ToolResult,
} from "./types";
import type { ContentBlock, AssistantMessagePartial, TextBlock, ToolCallBlock } from "@rowan-agent/models";
import {
  createAgentState,
  createMessage,
  resolveMaxThreadDepth,
} from "./types";
import { createTimestamp } from "./utils";
import {
  resolvePhaseEntry,
  ensurePhaseRegistry,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseHandler,
  type PhaseInput,
  type PhaseOutput,
} from "./loop/phases";
import { createBuiltinPhaseRegistry } from "./extensions";
import { executeRuntimeToolCall } from "./harness/tools";
import { LoopGuard } from "./loop/errors";
import { createOutcome } from "./loop/outcomes";
import {
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
    beforePhase: input.beforePhase,
    afterPhase: input.afterPhase,
    runThread: "runThread" in input ? input.runThread : undefined,
    emit: input.emit,
    phaseConfig: "phaseConfig" in input ? input.phaseConfig : undefined,
  };

  const state: AgentRunState = {
    agentState,
    currentPhase: "",
    attempt: 0,
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
  extra?: { outcome?: Outcome },
): void {
  const threadMeta = config.kind === "thread" ? {
    parentSessionId: state.agentState.parentSessionId,
    prompt: state.agentState.input,
    threadDepth: state.depth.threadDepth,
    maxThreadDepth: state.depth.maxThreadDepth,
  } : {};

  emit(state, emitFn, {
    type,
    content: snapshotMessages(state.transcript),
    ...threadMeta,
    ...extra,
    ts: createTimestamp(),
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
// Result Creation
// ============================================================================

function createRunResult(
  config: Pick<AgentLoopConfig, "kind">,
  state: AgentRunState,
  outcome: Outcome,
): RunResult {
  const base = {
    sessionId: state.agentState.id,
    messages: snapshotMessages(state.agentState.messages),
    outcome,
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
): RunResult {
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
  state.updatedAt = createTimestamp();
  return state;
}

function syncStateFromContext(state: AgentState, context: AgentRunContext): AgentState {
  state.systemPrompt = context.systemPrompt;
  if (context.messages.length > 0) {
    state.messages = snapshotMessages(context.messages);
  }
  state.skills = context.skills?.slice() ?? state.skills;
  state.updatedAt = createTimestamp();
  return state;
}

// ============================================================================
// Main Loop
// ============================================================================

export async function runAgentLoop(input: AgentLoopInput): Promise<RunResult> {
  const { config: initialConfig, state } = createLoopLifecycle(input);
  const config = { ...initialConfig };
  config.runThread ??= createLoopThread(config, state);
  const emitFn = config.emit;

  emit(state, emitFn, { type: "agent_start", sessionId: state.agentState.id, ts: createTimestamp() });

  try {
    if (config.kind === "thread" && state.depth.threadDepth > state.depth.maxThreadDepth) {
      const outcome = createOutcome.threadDepthLimit({
        threadDepth: state.depth.threadDepth,
        maxThreadDepth: state.depth.maxThreadDepth,
      });
      return completeRun(config, state, outcome);
    }

    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(config, state, createOutcome.aborted());
    }

    const result = await runLoop(config, state);
    return result;
  } finally {
    emit(state, emitFn, {
      type: "agent_end",
      sessionId: state.agentState.id,
      messages: snapshotMessages(state.agentState.messages),
      ts: createTimestamp(),
    });
  }
}

async function runLoop(
  config: AgentLoopConfig,
  state: AgentRunState,
): Promise<RunResult> {
  const phaseConfig = config.phaseConfig ?? createBuiltinPhaseRegistry();
  if (config.phaseConfig) ensurePhaseRegistry(phaseConfig);
  config.phaseConfig = phaseConfig;

  const availablePhases = phaseConfig.phases.map((p) => ({ id: p.id, name: p.name, description: p.description }));

  let currentPhaseId = phaseConfig.entryPhaseId;
  let lastYield: unknown;

  while (currentPhaseId) {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(config, state, createOutcome.aborted());
    }

    const { phase, handler } = resolvePhaseEntry(phaseConfig, currentPhaseId);
    state.currentPhase = currentPhaseId;

    const loopContext = createAgentLoopContext(config, state);
    const context = createPhaseContext(config, state, phase, handler, loopContext, availablePhases);

    if (handler?.prepare) handler.prepare(context);

    // Build unified input with yield from previous phase
    let phaseInput = handler
      ? await handler.buildInput(context, lastYield)
      : undefined;

    // Emit phase_start
    emit(state, config.emit, { type: "phase_start", phase: currentPhaseId, ts: createTimestamp() });

    // beforePhase hook — extension hooks first, then runtime hooks
    if (config.beforePhase) {
      const extBefore = await config.beforePhase(currentPhaseId, phaseInput!);
      if (extBefore.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, extBefore.abort);
      }
      if (extBefore.skip) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        if (extBefore.skip.route === "stop") {
          return completeRun(config, state, {
            id: "skip",
            passed: true,
            message: extBefore.skip.message || "Skipped.",
          });
        }
        currentPhaseId = extBefore.skip.route;
        continue;
      }
      if (extBefore.input) {
        phaseInput = extBefore.input;
      }
    }

    if (config.runtime?.beforePhase) {
      const before = await config.runtime.beforePhase(
        loopContext,
        phase.id as LoopPhase,
        phaseInput as never,
      );
      if (hasAbort(before)) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, before.abort);
      }
      if (hasSkip(before)) {
        // Skip: use the skip output's route
        const skipOutput = before.skip as { route: string; message: string };
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
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

    // afterPhase hook — extension hooks first, then runtime hooks
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, extAfter.abort);
      }
      if (extAfter.retry) {
        output = await phase.run(context, extAfter.retry);
      }
      if (extAfter.output) {
        output = extAfter.output;
      }
    }

    if (config.runtime?.afterPhase) {
      let retries = 0;

      while (true) {
        const after = await config.runtime.afterPhase(
          loopContext,
          phase.id as LoopPhase,
          output as never,
        );
        if (hasAbort(after)) {
          emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
          return completeRun(config, state, after.abort);
        }
        if (hasRetry(after) && after.retry) {
          retries += 1;
          if (retries > 3) {
            emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
            return completeRun(config, state, createOutcome.error(`Runtime requested too many ${currentPhaseId} phase retries.`));
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
    emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });

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
        ?? createOutcome.default(output);
      const yieldTask = (output.yield as Record<string, unknown> | undefined)?.task;
      if (yieldTask && typeof yieldTask === "object" && "status" in yieldTask) {
        (yieldTask as { status: string }).status = outcome.passed ? "passed" : "failed";
      }
      return completeRun(config, state, outcome);
    }

    // Validate route target exists
    if (!phaseConfig.phases.some((p) => p.id === output.route)) {
      return completeRun(config, state, createOutcome.phase());
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

async function collectStructured(input: {
  context: AgentLoopContext;
  message: import("./loop/phases/registry").PhaseMessageManager;
  events: AsyncIterable<LlmStreamEvent>;
  metadataPhase: string;
  scope?: "conversation" | "execution";
}): Promise<{
  text: string;
  contentBlocks: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason?: string;
}> {
  let activeMessageId: string | undefined;
  let lastPartial: AssistantMessagePartial | undefined;
  let stopReason: string | undefined;

  for await (const event of input.events) {
    const abortResult = LoopGuard.checkAbort(input.context.signal);
    if (abortResult.stopReason !== "none") {
      return { text: abortResult.message, contentBlocks: [], toolCalls: [], stopReason: "aborted" };
    }

    if (event.type === "model_requested") {
      input.context.emit({
        type: "model_requested",
        model: event.model,
        usage: event.usage,
        ts: createTimestamp(),
      });
    }

    if (event.type === "error") {
      throw event.error;
    }

    // ---- Text: stream to UI ----
    if (event.type === "text_delta") {
      lastPartial = event.partial;
      if (!activeMessageId) {
        activeMessageId = input.message.start("assistant", event.text, {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: input.scope ?? "execution",
        });
      } else {
        await input.message.update(activeMessageId, event.text);
      }
    }

    // ---- Tool call events: just update partial ----
    if (event.type === "tool_call_start" || event.type === "tool_call_delta" || event.type === "tool_call_end") {
      lastPartial = event.partial;
    }

    // ---- Thinking: update partial ----
    if (event.type === "thinking_delta") {
      lastPartial = event.partial;
    }

    // ---- Done: finalize ----
    if (event.type === "done") {
      stopReason = event.response?.stopReason;
      if (activeMessageId) {
        await input.message.end(activeMessageId);
        activeMessageId = undefined;
      }
    }
  }

  if (activeMessageId) {
    await input.message.end(activeMessageId);
  }

  // Extract from lastPartial
  const contentBlocks = lastPartial?.contentBlocks ?? [];
  const text = contentBlocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const toolCalls: ToolCall[] = contentBlocks
    .filter((b): b is ToolCallBlock => b.type === "tool_call")
    .map((b) => {
      let parsedArgs: unknown = b.args;
      try { parsedArgs = JSON.parse(b.args); } catch { /* keep raw */ }
      return { id: b.id, name: b.name, args: parsedArgs };
    });

  return { text, contentBlocks, toolCalls, stopReason };
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
  handler: PhaseHandler | undefined,
  loopContext: AgentLoopContext,
  availablePhases: PhaseContext["availablePhases"],
): PhaseContext {
  // Track active messages for streaming lifecycle
  const activeMessages = new Map<string, AgentMessage>();

  const messageManager: import("./loop/phases/registry").PhaseMessageManager = {
    visible: () => [...state.transcript],
    start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>) {
      const msg = createMessage(role, content, metadata);
      activeMessages.set(msg.id, msg);
      emit(state, config.emit, { type: "message_start", message: snapshotMessage(msg), ts: createTimestamp() });
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
        ts: createTimestamp(),
      });
    },
    async end(messageId: string) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      activeMessages.delete(messageId);
      state.transcript.push(msg);
      // Only persist conversation-scoped messages to agent state,
      // but skip model_message kind (raw model output) — phases create their own outcome messages
      if (msg.metadata?.scope === "conversation" && msg.metadata?.kind !== "model_message") {
        state.agentState.messages.push(msg);
      }
      emit(state, config.emit, { type: "message_end", message: snapshotMessage(msg), ts: createTimestamp() });
    },
    snapshot() {
      return {
        transcriptLength: state.transcript.length,
        stateMessagesLength: state.agentState.messages.length,
      };
    },
    restore(snap) {
      state.transcript.length = snap.transcriptLength;
      state.agentState.messages.length = snap.stateMessagesLength;
      // Discard any in-flight messages that started after the snapshot
      for (const [id, msg] of activeMessages) {
        if (msg.metadata?.scope !== "conversation") {
          activeMessages.delete(id);
        }
      }
    },
  };

  return {
    phaseId: phase.id,
    state: loopContext.state,
    messages: messageManager,
    toolExecution: {
      async start(toolCallId, toolName, args) {
        emit(state, config.emit, {
          type: "tool_execution_start",
          toolCallId,
          toolName,
          args,
          ts: createTimestamp(),
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
          ts: createTimestamp(),
        });
      },
    },
    model: {
      collect: async (input) => {
        if (!handler?.buildPrompt) {
          throw new Error(`Phase "${phase.id}" does not have a buildPrompt method.`);
        }
        const request = handler.buildPrompt(input.input, { toolResults: input.toolResults });
        request.model = loopContext.config.model;
        // Ensure tools are always available in the request when configured
        if (!request.tools && loopContext.tools.length > 0) {
          request.tools = loopContext.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          }));
        }
        return collectStructured({
          context: loopContext,
          message: messageManager,
          events: loopContext.config.stream(request, { signal: loopContext.signal }),
          metadataPhase: input.phase,
          scope: input.scope,
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
    threads: {
      create: async (input) => config.runThread!(input),
    },
    skills: state.agentState.skills.slice(),
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
    availablePhases,
  };
}
