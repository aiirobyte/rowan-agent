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
  Tool,
  ToolCall,
  ToolResult,
} from "./types";
import type {
  ContentBlock,
  AssistantMessagePartial,
  TextBlock,
  ToolCallBlock,
} from "@rowan-agent/models";
import { createAgentState, createMessage } from "./types";
import { createTimestamp } from "./utils";
import {
  resolvePhaseEntry,
  ensurePhaseRegistry,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseInput,
  type PhaseMessageManager,
  type PhaseOutput,
  type PhaseToolExecutionManager,
  type ModelInvokeOutput,
} from "./loop/phases";
import { createBuiltinPhaseRegistry } from "./extensions";
import { executeRuntimeToolCall } from "./harness/tools";
import { LoopGuard } from "./loop/errors";
import { createOutcome } from "./loop/outcomes";
import { snapshotMessage, snapshotMessages } from "./loop/state";
import type { AgentLoopConfig, AgentRunState } from "./loop/types";
import { createRouteTool, extractRouteCall, createThreadTool } from "./harness/tools";
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
  const context = contextFromLoopInput(input);

  if (!context) {
    throw new Error("Agent loop runs require either context or state.");
  }

  const agentState = input.state
    ? syncStateFromContext(input.state, context)
    : createStateFromContext(context, { id: input.sessionId });

  const config: AgentLoopConfig = {
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
    emit: input.emit,
    phaseConfig: input.phaseConfig,
  };

  const state: AgentRunState = {
    agentState,
    currentPhase: "",
    attempt: 0,
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
  state: AgentRunState,
  emitFn: ((event: AgentEvent) => void) | undefined,
  type: "turn_start" | "turn_end",
  extra?: { outcome?: Outcome },
): void {
  emit(state, emitFn, {
    type,
    content: snapshotMessages(state.transcript),
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
  state: AgentRunState,
  outcome: Outcome,
): RunResult {
  return {
    sessionId: state.agentState.id,
    messages: snapshotMessages(state.agentState.messages),
    outcome,
    metrics: state.metrics,
  };
}

// ============================================================================
// Run Completion
// ============================================================================

function completeRun(
  state: AgentRunState,
  outcome: Outcome,
): RunResult {
  // Finalize metrics
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  // Persist outcome message to agent state for multi-turn context
  const outcomeMessage = createMessage("assistant", outcome.message, { kind: "outcome" });
  state.agentState.messages.push(outcomeMessage);

  return createRunResult(state, outcome);
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
  const threadTool = createThreadTool(config.tools, state.agentState.skills, async (input) => {
    const result = await runAgentLoop({
      context: {
        systemPrompt: state.agentState.systemPrompt,
        messages: [createMessage("user", input.prompt)],
        tools: input.tools?.slice() ?? config.tools.slice(),
        skills: input.skills?.slice() ?? state.agentState.skills.slice(),
      },
      model: config.model,
      stream: config.stream,
      maxAttempts: config.maxAttempts,
      limits: input.limits ?? config.limits,
      signal: config.signal,
      runtime: config.runtime,
      beforeToolCall: config.beforeToolCall,
      afterToolCall: config.afterToolCall,
      beforePhase: config.beforePhase,
      afterPhase: config.afterPhase,
      beforePrompt: config.beforePrompt,
      emit: config.emit,
      phaseConfig: config.phaseConfig,
    });
    return result;
  });

  return {
    systemPrompt: state.agentState.systemPrompt,
    messages: snapshotMessages(state.agentState.messages),
    tools: [...config.tools, routeTool, threadTool],
    skills: state.agentState.skills.slice(),
    config,
    state,
    ...(config.signal ? { signal: config.signal } : {}),
    emit: (event) => emit(state, config.emit, event),
    appendMessage: (message) => appendMessage(state, message),
    appendStateMessage: (message) => appendMessage(state, message, true),
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

function contextFromLoopInput(input: AgentLoopInput): AgentRunContext | undefined {
  if (input.context) return cloneContext(input.context);
  if (input.state) return contextFromState(input.state, input.tools);
  return undefined;
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
  const emitFn = config.emit;

  emit(state, emitFn, { type: "agent_start", sessionId: state.agentState.id, ts: createTimestamp() });

  try {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(state, createOutcome.aborted());
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
  const phaseConfig = config.phaseConfig ?? await createBuiltinPhaseRegistry();
  if (config.phaseConfig) ensurePhaseRegistry(phaseConfig);
  config.phaseConfig = phaseConfig;

  const availablePhases = phaseConfig.phases.map((p) => ({ id: p.id, name: p.name, description: p.description }));

  let currentPhaseId = phaseConfig.entryPhaseId;

  const maxIterations = config.limits?.maxIterations ?? 50;
  const maxPhaseRounds = config.limits?.maxPhaseRounds ?? 10;
  let phaseRounds = 0;
  let isContinuing = false;

  while (currentPhaseId) {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(state, createOutcome.aborted());
    }

    // Track iteration
    state.metrics.iterations++;

    // Guard against infinite loops
    if (state.metrics.iterations > maxIterations) {
      return completeRun(state, {
        id: "max_iterations",
        message: `Loop exceeded maximum iterations (${maxIterations}). Stopping to prevent infinite loop.`,
      });
    }

    // Auto-compact when transcript grows too long
    if (needsCompaction(state.transcript)) {
      const compacted = compactMessages(state.transcript);
      if (compacted.compacted) {
        state.transcript = compacted.messages;
        state.agentState.messages = compacted.messages;
        state.metrics.compactionCount++;
        emit(state, config.emit, {
          type: "message_start",
          message: {
            id: "compaction",
            role: "assistant",
            content: `[Compacted ${compacted.summarizedCount} older messages to stay within context limits]`,
            createdAt: createTimestamp(),
            metadata: { type: "compaction_notice" },
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
        return completeRun(state, extBefore.abort);
      }
      if (extBefore.skip) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        if (extBefore.skip.route === "stop") {
          return completeRun(state, {
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
        toolCalls: collected.toolCalls,
      };
    }

    // ToolChoice fallback: if phase input requires a specific tool and model didn't call it
    if (phaseInput.toolChoice && typeof phaseInput.toolChoice === 'object' && phaseInput.toolChoice.type === 'tool') {
      const requiredTool = phaseInput.toolChoice.name;
      const hasRequiredTool = output.toolCalls?.some(tc => tc.name === requiredTool);
      if (!hasRequiredTool) {
        // Fallback: model didn't call the required tool
        // Keep the output as-is but log a warning
        state.metrics.retryCount++;
      }
    }

    // Framework-level route check: if phase returned toolCalls, extract route decision
    // Only update route and routeReason, keep phase.run()'s message as primary output
    if (output.toolCalls && output.toolCalls.length > 0) {
      const routeDecision = context.routeDecision(output.toolCalls);
      if (routeDecision) {
        output.route = routeDecision.route;
        if (routeDecision.reason) {
          output.routeReason = routeDecision.reason;
        }
      }
    }

    // afterPhase hook — extension hooks first, then runtime hooks
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(state, extAfter.abort);
      }
      if (extAfter.retry && phase.run) {
        output = resolvePhaseOutput(await phase.run(context, extAfter.retry), state);
        // Re-run route check for retried output (route and routeReason)
        if (output.toolCalls && output.toolCalls.length > 0) {
          const routeDecision = context.routeDecision(output.toolCalls);
          if (routeDecision) {
            output.route = routeDecision.route;
            if (routeDecision.reason) {
              output.routeReason = routeDecision.reason;
            }
          }
        }
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
      const outcome = createOutcome.default(output);
      return completeRun(state, outcome);
    }

    // Validate route target exists
    if (!phaseConfig.phases.some((p) => p.id === output.route)) {
      return completeRun(state, createOutcome.phase());
    }

    // Track phase transition
    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: output.route,
      ts: createTimestamp(),
    });

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
          phase: input.metadataPhase,
        });
      }
    }

    // ---- Text: stream to UI ----
    if (event.type === "text_delta") {
      lastPartial = event.partial;
      if (!activeMessageId) {
        activeMessageId = input.message.start("assistant", event.text, {
          phase: input.metadataPhase,
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
          phase: input.metadataPhase,
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
  };
  return executeRuntimeToolCall({
    tools: input.context.tools,
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
        emitTurn(state, config.emit, "turn_start");
      }
    }
  }

  function endAutoTurn() {
    if (turnDepth === 0 && autoTurnCount > 0) {
      autoTurnCount--;
      if (autoTurnCount === 0) {
        emitTurn(state, config.emit, "turn_end");
      }
    }
  }

  const messageManager: PhaseMessageManager = {
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
      // Only persist non-tool messages to agent state (tool messages are execution-scoped)
      if (msg.role !== "tool") {
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
      // Discard all in-flight messages that started after the snapshot
      activeMessages.clear();
    },
    delete(target: string | number) {
      const transcriptIdx = typeof target === "number"
        ? target
        : state.transcript.findIndex(m => m.id === target);
      if (transcriptIdx >= 0 && transcriptIdx < state.transcript.length) {
        const msg = state.transcript[transcriptIdx];
        state.transcript.splice(transcriptIdx, 1);
        const stateIdx = state.agentState.messages.findIndex(m => m.id === msg.id);
        if (stateIdx !== -1) {
          state.agentState.messages.splice(stateIdx, 1);
        }
        activeMessages.delete(msg.id);
      }
    },
    insert(target: string | number, message: AgentMessage) {
      const idx = typeof target === "number"
        ? target
        : state.transcript.findIndex(m => m.id === target);
      const insertIdx = idx >= 0 ? idx : state.transcript.length;
      state.transcript.splice(insertIdx, 0, message);
      state.agentState.messages.push(message);
    },
    clear() {
      state.transcript.length = 0;
      state.agentState.messages.length = 0;
      activeMessages.clear();
    },
  };

  const toolExecutionManager: PhaseToolExecutionManager = {
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
  };

  return {
    phaseId: phase.id,
    state: loopContext.state,
    messages: messageManager,
    toolExecution: toolExecutionManager,
    model: {
      invoke: async (input) => {
        const { autoExecuteTools, maxToolRounds = 10, excludeTools = [] } = input;

        // Single invoke call helper
        const invokeOnce = async (phaseInput: PhaseInput): Promise<ModelInvokeOutput> => {
          // Allow extensions to transform PhaseInput before buildPrompt
          if (loopContext.config.beforePrompt) {
            phaseInput = await loopContext.config.beforePrompt(phase.id, phaseInput);
          }
          const request = phase.buildPrompt!(phaseInput);
          request.model = loopContext.config.model;
          // Ensure tools are available when phase has tools configured
          // Use phaseTools (filtered) instead of tools (all)
          if (!request.tools) {
            const modelTools = phaseInput.phaseTools ?? phaseInput.tools;
            if (modelTools.length > 0) {
              request.tools = modelTools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              }));
            }
          }
          // Pass toolChoice from phase input to request
          if (phaseInput.toolChoice && !request.toolChoice) {
            request.toolChoice = phaseInput.toolChoice;
          }
          // Retry with exponential backoff for transient model errors
          return withRetry(
            () => collectStructured({
              context: loopContext,
              message: messageManager,
              events: loopContext.config.stream(request, { signal: loopContext.signal }),
              metadataPhase: phase.id,
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
                    metadata: { type: "retry_notice" },
                  },
                  ts: createTimestamp(),
                });
              },
            },
          );
        };

        // If auto-execute is disabled, just do a single invoke
        if (!autoExecuteTools) {
          return invokeOnce(input.input);
        }

        // Auto-execute loop: invoke → execute tools → repeat until no tool calls
        let currentInput = input.input;
        let lastResult: ModelInvokeOutput | undefined;

        for (let round = 0; round < maxToolRounds; round++) {
          lastResult = await invokeOnce(currentInput);

          // Filter out excluded tool calls
          const executableToolCalls = lastResult.toolCalls.filter(
            tc => !excludeTools.includes(tc.name)
          );

          // If no executable tool calls, we're done
          if (executableToolCalls.length === 0) {
            break;
          }

          // Execute each tool and record results
          for (const toolCall of executableToolCalls) {
            await toolExecutionManager.start(toolCall.id, toolCall.name, toolCall.args);

            const result = await executeToolCall({ context: loopContext, toolCall });

            await toolExecutionManager.end(result.toolCallId, result.toolName, result, !result.ok);

            // Record tool result to message history
            const toolResultContent = JSON.stringify({
              toolName: result.toolName,
              ok: result.ok,
              content: result.content,
              ...(result.error ? { error: result.error } : {}),
            });
            const toolMsgId = messageManager.start("tool", toolResultContent, {
              toolCallId: result.toolCallId,
              toolName: result.toolName,
              isError: !result.ok,
            });
            await messageManager.end(toolMsgId);
          }

          // Update input with current messages for next round
          currentInput = {
            ...currentInput,
            messages: messageManager.visible(),
          };
        }

        return lastResult!;
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
    skills: state.agentState.skills.slice(),
    turn: async (fn) => {
      turnDepth++;
      emitTurn(state, config.emit, "turn_start");
      try {
        return await fn();
      } finally {
        turnDepth--;
        emitTurn(state, config.emit, "turn_end");
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
