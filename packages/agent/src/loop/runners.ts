import type {
  AgentEvent,
  AgentLoopContext,
  AgentLoopInput,
  AgentMessage,
  RunResult,
  LlmStreamEvent,
  Outcome,
  ToolCall,
  ToolResult,
} from "../types";
import type {
  ContentBlock,
  AssistantMessagePartial,
  TextBlock,
  ToolCallBlock,
} from "@rowan-agent/models";
import { createMessage } from "../types";
import { createTimestamp } from "../utils";

// Execution types (loop-level)
import type {
  PhaseContext,
  PhaseMessageManager,
  PhaseToolExecutionManager,
  ModelInvokeOutput,
} from "./execution";
import type { PhaseInput, PhaseOutput } from "../protocol/context";

// Phase system types
import type {
  Phase,
  PhaseRegistry,
} from "../harness/phases";
import { reloadPhases } from "../harness/phases";

import { executeRuntimeToolCall } from "../harness/tools";
import { buildModelRequest } from "../harness/context/prompt-builder";
import { LoopGuard } from "./errors";
import { createOutcome } from "./outcomes";
import { snapshotMessage, snapshotMessages } from "./state";
import type { AgentLoopConfig, AgentRunState } from "./types";
import { createRouteTool, extractRouteCall, createThreadTool } from "../harness/tools";
import { compactMessages, needsCompaction } from "../harness/context/compaction";

// ============================================================================
// Phase State Utilities
// ============================================================================

/** Phase sentinel states - NOT executable phases, just markers */
type PhaseState = "none" | "stop";

/** Check if value is a sentinel state (not a real phase) */
function isPhaseState(value: string): value is PhaseState {
  return value === "none" || value === "stop";
}

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
  availablePhases: Pick<Phase, 'id' | 'name' | 'description'>[],
  runLoop: (input: AgentLoopInput) => Promise<RunResult>,
): AgentLoopContext {
  const tools = [...config.tools];
  if (availablePhases.length > 0) {
    tools.push(createRouteTool(availablePhases));
  }
  const threadTool = createThreadTool(config.tools, state.agentState.skills, async (input) => {
    const result = await runLoop({
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
      phases: config.phases,
    });
    return result;
  });

  return {
    systemPrompt: state.agentState.systemPrompt,
    messages: snapshotMessages(state.agentState.messages),
    tools: [...tools, threadTool],
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
// Unified Phase Loop
// ============================================================================

export async function runPhaseLoop(
  config: AgentLoopConfig,
  state: AgentRunState,
  runLoop: (input: AgentLoopInput) => Promise<RunResult>,
): Promise<RunResult> {
  if (config.phases?.entryPhaseId) {
    return runPhasedLoop(config, state, config.phases, runLoop);
  }
  return runDefaultLoop(config, state, runLoop);
}

// ============================================================================
// Default Loop (no phases configured)
// ============================================================================

async function runDefaultLoop(
  config: AgentLoopConfig,
  state: AgentRunState,
  runLoop: (input: AgentLoopInput) => Promise<RunResult>,
): Promise<RunResult> {
  state.currentPhase = "none";

  // No route tool, no phase-related system prompt — only user's configured tools
  const loopContext = createAgentLoopContext(config, state, [], runLoop);

  const nonePhase: Phase = {
    id: "none",
    name: "None",
    description: "",
    entry: false,
    filePath: "",
    baseDir: "",
    content: "",
    buildPrompt: () => "",
  };

  let phaseInput: PhaseInput = {
    phase: "none",
    systemPrompt: loopContext.systemPrompt,
    messages: loopContext.messages,
    tools: loopContext.tools,
    skills: loopContext.skills,
    phaseTools: loopContext.tools,
    phaseSkills: loopContext.skills,
  };

  emit(state, config.emit, { type: "phase_start", phase: "none", ts: createTimestamp() });

  // Call beforePhase hook if defined
  if (config.beforePhase) {
    const extBefore = await config.beforePhase("none", phaseInput);
    if (extBefore.abort) {
      emit(state, config.emit, { type: "phase_end", phase: "none", ts: createTimestamp() });
      return completeRun(state, extBefore.abort);
    }
    if (extBefore.skip) {
      emit(state, config.emit, { type: "phase_end", phase: "none", ts: createTimestamp() });
      return completeRun(state, {
        id: "skip",
        message: extBefore.skip.message || "Skipped.",
      });
    }
    if (extBefore.input) {
      phaseInput = extBefore.input;
    }
  }

  // Execute model invocation
  const context = createPhaseContext(config, state, nonePhase, loopContext, []);
  const collected = await context.turn(() => context.model.invoke({ input: phaseInput }));

  // Create output
  let output: PhaseOutput = {
    message: collected.text,
    route: "stop",
    toolCalls: collected.toolCalls,
  };

  // Call afterPhase hook if defined
  if (config.afterPhase) {
    const extAfter = await config.afterPhase("none", output);
    if (extAfter.abort) {
      emit(state, config.emit, { type: "phase_end", phase: "none", ts: createTimestamp() });
      return completeRun(state, extAfter.abort);
    }
    if (extAfter.retry) {
      const retryCollected = await context.turn(() => context.model.invoke({ input: extAfter.retry! }));
      output = {
        message: retryCollected.text,
        route: "stop",
        toolCalls: retryCollected.toolCalls,
      };
    }
    if (extAfter.output) {
      output = extAfter.output;
    }
  }

  emit(state, config.emit, { type: "phase_end", phase: "none", ts: createTimestamp() });

  return completeRun(state, createOutcome.default(output, state.transcript));
}

// ============================================================================
// Phased Loop (phases configured)
// ============================================================================

async function runPhasedLoop(
  config: AgentLoopConfig,
  state: AgentRunState,
  registry: PhaseRegistry,
  runLoop: (input: AgentLoopInput) => Promise<RunResult>,
): Promise<RunResult> {
  // Hot-reload: re-read phase files from disk before each run
  const freshRegistry = await reloadPhases(registry);

  const maxIterations = config.limits?.maxIterations ?? 50;
  const maxPhaseRounds = config.limits?.maxPhaseRounds ?? 10;
  let currentPhaseId = freshRegistry.entryPhaseId!;
  let phaseRounds = 0;
  let isContinuing = false;

  // Build available phases list for route tool
  const availablePhases: Pick<Phase, 'id' | 'name' | 'description'>[] = [];
  for (const [, phase] of freshRegistry.phases) {
    availablePhases.push({ id: phase.id, name: phase.name, description: phase.description });
  }

  while (currentPhaseId) {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(state, createOutcome.aborted());
    }

    state.metrics.iterations++;

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

    const phase = freshRegistry.phases.get(currentPhaseId);
    if (!phase) {
      throw new Error(`Phase "${currentPhaseId}" not found in registry`);
    }

    state.currentPhase = currentPhaseId;

    const loopContext = createAgentLoopContext(config, state, availablePhases, runLoop);
    const context = createPhaseContext(config, state, phase, loopContext, availablePhases);

    // Filter tools and skills based on phase configuration
    const phaseTools = phase.tools
      ? loopContext.tools.filter(t => phase.tools!.includes(t.name))
      : loopContext.tools;
    const phaseSkills = phase.skills
      ? state.agentState.skills.filter(s => phase.skills!.includes(s.name))
      : state.agentState.skills;

    // Build unified input
    let phaseInput: PhaseInput = {
      phase: currentPhaseId,
      systemPrompt: loopContext.systemPrompt,
      messages: context.messages.visible(),
      tools: loopContext.tools,
      skills: loopContext.skills,
      phaseTools,
      phaseSkills,
    };

    // Emit phase_start only when entering a new phase (not on continue)
    if (!isContinuing) {
      emit(state, config.emit, { type: "phase_start", phase: currentPhaseId, ts: createTimestamp() });
    }
    isContinuing = false;

    // beforePhase hook
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

    // Execute phase — if run is provided, it takes over; otherwise framework calls model.invoke
    let output: PhaseOutput;
    if (phase.run) {
      const result = await phase.run(context, phaseInput);
      output = resolvePhaseOutput(result, state);
    } else {
      const collected = await context.turn(() => context.model.invoke({ input: phaseInput }));
      output = {
        message: collected.text,
        route: "stop",
        toolCalls: collected.toolCalls,
      };
    }

    // ToolChoice fallback
    if (phaseInput.toolChoice && typeof phaseInput.toolChoice === 'object' && phaseInput.toolChoice.type === 'tool') {
      const requiredTool = phaseInput.toolChoice.name;
      const hasRequiredTool = output.toolCalls?.some(tc => tc.name === requiredTool);
      if (!hasRequiredTool) {
        state.metrics.retryCount++;
      }
    }

    // Framework-level route check: extract route from tool calls
    if (output.toolCalls && output.toolCalls.length > 0) {
      const routeDecision = context.routeDecision(output.toolCalls);
      if (routeDecision) {
        output.route = routeDecision.route;
        if (routeDecision.reason) {
          output.routeReason = routeDecision.reason;
        }
      }
    }

    // afterPhase hook
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(state, extAfter.abort);
      }
      if (extAfter.retry && phase.run) {
        output = resolvePhaseOutput(await phase.run(context, extAfter.retry), state);
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

    // Handle "continue" — re-execute current phase
    if (output.route === "continue") {
      phaseRounds++;
      if (phaseRounds > maxPhaseRounds) {
        emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        phaseRounds = 0;
        // Force stop to avoid infinite loop
        return completeRun(state, createOutcome.default(output, state.transcript));
      }
      isContinuing = true;
      state.metrics.iterations++;
      continue;
    }

    phaseRounds = 0;

    emit(state, config.emit, { type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });

    // Resolve next phase: target > route > stop
    let nextRoute: string | PhaseState;
    if (phase.target) {
      nextRoute = phase.target;
    } else if (output.route) {
      nextRoute = output.route;
    } else {
      nextRoute = "stop";
    }

    // Handle sentinel states
    if (isPhaseState(nextRoute)) {
      return completeRun(state, createOutcome.default(output, state.transcript));
    }

    // Validate route target exists
    const targetPhaseId = nextRoute as string;
    if (!freshRegistry.phases.has(targetPhaseId)) {
      return completeRun(state, createOutcome.phase());
    }

    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: targetPhaseId,
      ts: createTimestamp(),
    });

    currentPhaseId = targetPhaseId;
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
  // Check for invalid model schema errors (retryable)
  if ("code" in error && (error as { code: string }).code === "invalid_model_schema") return true;
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

async function collectStreamResult(input: {
  context: AgentLoopContext;
  message: PhaseMessageManager;
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
  phase: Phase,
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
          // Allow extensions to transform PhaseInput before building request
          if (loopContext.config.beforePrompt) {
            phaseInput = await loopContext.config.beforePrompt(phase.id, phaseInput);
          }
          // Build LlmRequest: use phase's custom builder or default
          const request = phase.buildLlmRequest
            ? phase.buildLlmRequest(phaseInput)
            : buildModelRequest(phaseInput, { model: loopContext.config.model });
          // Ensure tools are available when phase has tools configured
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
            () => collectStreamResult({
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
