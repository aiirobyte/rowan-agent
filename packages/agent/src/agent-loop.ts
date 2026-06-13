import type {
  AgentContext as AgentRunContext,
  AgentEvent,
  AgentLoopInput,
  RunResult,
  AgentState,
  Outcome,
  Tool,
} from "./types";
import { createAgentState, createMessage } from "./types";
import { createTimestamp } from "./utils";

import { LoopGuard } from "./loop/errors";
import { createOutcome } from "./loop/outcomes";
import { snapshotMessages } from "./loop/state";
import type { AgentLoopConfig, AgentRunState } from "./loop/types";
import { runPhaseLoop } from "./loop/runners";

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
    phases: input.phases,
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
// Main Loop
// ============================================================================

export async function runAgentLoop(input: AgentLoopInput): Promise<RunResult> {
  const { config: initialConfig, state } = createLoopLifecycle(input);
  const config = { ...initialConfig };
  const emitFn = config.emit;

  // Inline emit (previously a private helper, now in loop/runners)
  const emitEvent = (event: AgentEvent) => {
    state.agentState.updatedAt = event.ts;
    emitFn?.(event);
  };

  emitEvent({ type: "agent_start", sessionId: state.agentState.id, ts: createTimestamp() });

  try {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(state, createOutcome.aborted());
    }

    const result = await runPhaseLoop(config, state, runAgentLoop);
    return result;
  } finally {
    emitEvent({
      type: "agent_end",
      sessionId: state.agentState.id,
      messages: snapshotMessages(state.agentState.messages),
      ts: createTimestamp(),
    });
  }
}

// ============================================================================
// Run Completion (used by runAgentLoop for early abort)
// ============================================================================

function completeRun(
  state: AgentRunState,
  outcome: Outcome,
): RunResult {
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  const outcomeMessage = createMessage("assistant", outcome.message, { kind: "outcome" });
  state.agentState.messages.push(outcomeMessage);

  return {
    sessionId: state.agentState.id,
    messages: snapshotMessages(state.agentState.messages),
    outcome,
    metrics: state.metrics,
  };
}
