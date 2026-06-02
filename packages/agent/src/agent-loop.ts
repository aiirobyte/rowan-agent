import type {
  AgentContext as AgentRunContext,
  AgentEvent,
  AgentLoopContext,
  AgentLoopInput,
  AgentMessage,
  RunResult,
  AgentState,
  LlmStreamEvent,
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
import { createRouteTool, extractRouteCall } from "./loop/phases/route-tool";
import type { PhaseManifest } from "./loop/phases/registry";
import { compactMessages, needsCompaction } from "./loop/compaction";

/** Execute phase run and handle void return by auto-assembling PhaseOutput. */
function resolvePhaseOutput(
  result: PhaseOutput | void,
  state: AgentRunState,
): PhaseOutput {
  if (result) return result;
  return {
    message: state.transcript.filter(m => m.role === "assistant").pop()?.content ?? "",
    route: "stop",
  };
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
    metrics: {
      iterations: 0,
      phaseTransitions: [],
      compactionCount: 0,
      retryCount: 0,
      startedAt: createTimestamp(),
      startedAtMs: Date.now(),
    },
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
    metrics: state.metrics,
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
  // Finalize metrics
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  return createRunResult(config, state, outcome);
}

// ============================================================================
// Context Factory
// ============================================================================

function createAgentLoopContext(
  config: AgentLoopConfig,
  state: AgentRunState,
  availablePhases: PhaseManifest[],
): AgentLoopContext {
  const routeTool = createRouteTool(availablePhases);

  return {
    systemPrompt: state.agentState.systemPrompt,
    messages: snapshotMessages(state.agentState.messages),
    tools: [...config.tools, routeTool],
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

  const maxIterations = config.limits?.maxIterations ?? 50;
  const maxPhaseRounds = config.limits?.maxPhaseRounds ?? 10;
  let phaseRounds = 0;
  let isContinuing = false;

  while (currentPhaseId) {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(config, state, createOutcome.aborted());
    }

    // Track iteration
    state.metrics.iterations++;

    // Guard against infinite loops
    if (state.metrics.iterations > maxIterations) {
      return completeRun(config, state, {
        id: "max_iterations",
        message: `Loop exceeded maximum iterations (${maxIterations}). Stopping to prevent infinite loop.`,
      });
    }

    // Auto-compact when transcript grows too long
    if (needsCompaction(state.transcript)) {
      const compacted = compactMessages(state.transcript);
      if (compacted.compacted) {
        state.transcript = compacted.messages;
        state.agentState.messages = compacted.messages.filter(
          (m) => m.metadata?.scope === "conversation" && m.metadata?.kind !== "model_message",
        );
        state.metrics.compactionCount++;
        emit(state, config.emit, {
          type: "message_start",
          message: {
            id: "compaction",
            role: "assistant",
            content: `[Compacted ${compacted.summarizedCount} older messages to stay within context limits]`,
            createdAt: createTimestamp(),
            metadata: { scope: "diagnostic", kind: "compaction_notice" },
          },
          ts: createTimestamp(),
        });
      }
    }

    const phase = resolvePhaseEntry(phaseConfig, currentPhaseId);
    state.currentPhase = currentPhaseId;

    const loopContext = createAgentLoopContext(config, state, availablePhases);
    const context = createPhaseContext(config, state, phase, loopContext, availablePhases);

    // Filter tools and skills based on phase configuration
    const phaseTools = phase.tools
      ? loopContext.tools.filter(t => phase.tools!.includes(t.name))
      : loopContext.tools;
    const phaseSkills = phase.skills
      ? state.agentState.skills.filter(s => phase.skills!.includes(s.name))
      : state.agentState.skills;

    // Build unified input — framework handles data preparation
    let phaseInput: PhaseInput = {
      phase: currentPhaseId,
      systemPrompt: loopContext.systemPrompt,
      messages: context.messages.visible(),
      tools: loopContext.tools,      // All tools (for systemPrompt, cache-friendly)
      skills: loopContext.skills,    // All skills (for systemPrompt)
      phaseTools,                    // Phase-filtered tools (for LlmRequest.tools)
      phaseSkills,                   // Phase-filtered skills
      yield: lastYield,
    };

    // Emit phase_start only when entering a new phase (not on continue)
    if (!isContinuing) {
      emit(state, config.emit, { type: "phase_start", phase: currentPhaseId, ts: createTimestamp() });
    }
    isContinuing = false;

    // beforePhase hook — extension hooks first, then runtime hooks
    if (config.beforePhase) {
      const extBefore = await config.beforePhase(currentPhaseId, phaseInput);
      if (extBefore.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, extBefore.abort);
      }
      if (extBefore.skip) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        if (extBefore.skip.route === "stop") {
          return completeRun(config, state, {
            id: "skip",
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

    // Step 4: Run phase — if run is provided, it takes over; otherwise framework calls model.invoke
    let output: PhaseOutput;
    if (phase.run) {
      output = resolvePhaseOutput(await phase.run(context, phaseInput), state);
    } else {
      // Default: call model.invoke
      const collected = await context.turn(() => context.model.invoke({ input: phaseInput }));
      output = {
        message: collected.text,
        route: "stop",
      };
    }

    // afterPhase hook — extension hooks first, then runtime hooks
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, extAfter.abort);
      }
      if (extAfter.retry && phase.run) {
        output = resolvePhaseOutput(await phase.run(context, extAfter.retry), state);
      }
      if (extAfter.output) {
        output = extAfter.output;
      }
    }

    // Handle "continue" — re-execute current phase without phase transition events
    if (output.route === "continue") {
      phaseRounds++;
      if (phaseRounds > maxPhaseRounds) {
        // Force transition to chat to avoid infinite loop
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        phaseRounds = 0;
        currentPhaseId = "chat";
        continue;
      }
      isContinuing = true;
      state.metrics.iterations++;
      continue;
    }

    // Reset phase rounds counter on non-continue routes
    phaseRounds = 0;

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

      const outcome = createOutcome.default(output);
      return completeRun(config, state, outcome);
    }

    // Validate route target exists
    if (!phaseConfig.phases.some((p) => p.id === output.route)) {
      return completeRun(config, state, createOutcome.phase());
    }

    // Track phase transition
    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: output.route,
      ts: createTimestamp(),
    });

    // Pass yield to next phase
    lastYield = output.yield;
    currentPhaseId = output.route;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
}

// ============================================================================
// Retry Logic
// ============================================================================

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  // Check for rate limit / overloaded / server error patterns
  if (message.includes("rate limit") || message.includes("429")) return true;
  if (message.includes("overloaded") || message.includes("529")) return true;
  if (message.includes("server error") || message.includes("500")) return true;
  if (message.includes("bad gateway") || message.includes("502")) return true;
  if (message.includes("service unavailable") || message.includes("503")) return true;
  if (message.includes("gateway timeout") || message.includes("504")) return true;
  if (message.includes("econnreset") || message.includes("econnrefused")) return true;
  // Do NOT retry user-configured timeouts — those are intentional limits
  return false;
}

function getRetryDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(jitter, maxMs);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }
      if (options.signal?.aborted) {
        throw error;
      }
      const delayMs = getRetryDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.(attempt, error, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (options.signal?.aborted) {
        throw lastError;
      }
    }
  }
  throw lastError;
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

    // ---- Start: create assistant message immediately (even for tool-call-only responses) ----
    if (event.type === "start") {
      lastPartial = event.partial;
      if (!activeMessageId) {
        activeMessageId = input.message.start("assistant", "", {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: input.scope ?? "conversation",
        });
      }
    }

    // ---- Text: stream to UI ----
    if (event.type === "text_delta") {
      lastPartial = event.partial;
      if (!activeMessageId) {
        activeMessageId = input.message.start("assistant", event.text, {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: input.scope ?? "conversation",
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

      // Fallback: ensure assistant message exists if there are tool calls
      const toolCallBlocks = lastPartial?.contentBlocks?.filter(b => b.type === "tool_call") ?? [];
      if (!activeMessageId && toolCallBlocks.length > 0) {
        activeMessageId = input.message.start("assistant", "", {
          kind: "model_message",
          phase: input.metadataPhase,
          scope: input.scope ?? "conversation",
          toolCalls: toolCallBlocks.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
        });
      }

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
  loopContext: AgentLoopContext,
  availablePhases: PhaseContext["availablePhases"],
): PhaseContext {
  // Track active messages for streaming lifecycle
  const activeMessages = new Map<string, AgentMessage>();

  // Turn depth tracking: explicit turn() calls and auto-turn for event-emitting APIs
  let turnDepth = 0;
  let autoTurnCount = 0;

  function beginAutoTurn() {
    if (turnDepth === 0) {
      autoTurnCount++;
      if (autoTurnCount === 1) {
        emitTurn(config, state, config.emit, "turn_start");
      }
    }
  }

  function endAutoTurn() {
    if (turnDepth === 0 && autoTurnCount > 0) {
      autoTurnCount--;
      if (autoTurnCount === 0) {
        emitTurn(config, state, config.emit, "turn_end");
      }
    }
  }

  const messageManager: import("./loop/phases/registry").PhaseMessageManager = {
    visible: () => [...state.transcript],
    start(role: "assistant" | "tool", content: string, metadata?: Record<string, unknown>) {
      const msg = createMessage(role, content, metadata);
      activeMessages.set(msg.id, msg);
      beginAutoTurn();
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
      endAutoTurn();
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
        beginAutoTurn();
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
        endAutoTurn();
      },
    },
    model: {
      invoke: async (input) => {
        // Allow extensions to transform PhaseInput before buildPrompt
        if (loopContext.config.beforePrompt) {
          input.input = await loopContext.config.beforePrompt(phase.id, input.input);
        }
        const request = phase.buildPrompt!(input.input);
        request.model = loopContext.config.model;
        // Ensure tools are available when phase has tools configured
        // Use phaseTools (filtered) instead of tools (all)
        if (!request.tools) {
          const modelTools = input.input.phaseTools ?? input.input.tools;
          if (modelTools.length > 0) {
            request.tools = modelTools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            }));
          }
        }
        // Retry with exponential backoff for transient model errors
        return withRetry(
          () => collectStructured({
            context: loopContext,
            message: messageManager,
            events: loopContext.config.stream(request, { signal: loopContext.signal }),
            metadataPhase: phase.id,
            scope: input.scope,
          }),
          {
            signal: loopContext.signal,
            onRetry: (attempt, error, delayMs) => {
              state.metrics.retryCount++;
              const errMsg = error instanceof Error ? error.message : String(error);
              loopContext.emit({
                type: "message_start",
                message: {
                  id: `retry_${attempt}`,
                  role: "assistant",
                  content: `[Retry ${attempt + 1}/${DEFAULT_MAX_RETRIES}] Transient error: ${errMsg}. Retrying in ${Math.round(delayMs)}ms...`,
                  createdAt: createTimestamp(),
                  metadata: { scope: "diagnostic", kind: "retry_notice" },
                },
                ts: createTimestamp(),
              });
            },
          },
        );
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
      turnDepth++;
      emitTurn(config, state, config.emit, "turn_start");
      try {
        return await fn();
      } finally {
        turnDepth--;
        emitTurn(config, state, config.emit, "turn_end");
      }
    },
    maxAttempts: config.maxAttempts,
    incrementAttempt() {
      state.attempt += 1;
      loopContext.state.attempt = state.attempt;
    },
    availablePhases,
    routeDecision(toolCalls) {
      return extractRouteCall(toolCalls);
    },
  };
}
