import type {
  AgentContext,
  AgentEvent,
  RunResult,
  Outcome,
} from "./types";
import { createTimestamp, createId } from "./utils";

import { LoopGuard } from "./loop/errors";
import { createOutcome } from "./loop/outcomes";
import { snapshotMessages } from "./loop/state";
import type { SessionState, AgentConfig } from "./loop/types";
import { startPhaseLoop } from "./loop/runners";

// ============================================================================
// Main Loop
// ============================================================================

export async function runAgentLoop(input: AgentConfig): Promise<RunResult> {
  const sessionId = input.sessionId ?? createId("ses");
  const config: AgentConfig = {
    ...input,
    sessionId,
    maxAttempts: input.maxAttempts ?? 2,
  };

  const state: SessionState = {
    currentPhase: config.sessionState?.currentPhase ?? "",
    attempt: config.sessionState?.attempt ?? 0,
    status: config.sessionState?.status ?? "running",
    metrics: config.sessionState?.metrics ?? {
      iterations: 0,
      phaseTransitions: [],
      compactionCount: 0,
      retryCount: 0,
      startedAt: createTimestamp(),
      startedAtMs: Date.now(),
    },
  };

  const emitEvent = (event: AgentEvent) => {
    config.emit?.(event);
  };

  emitEvent({ type: "agent_start", sessionId: sessionId, ts: createTimestamp() });

  try {
    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(config, state, createOutcome.aborted());
    }

    return await startPhaseLoop(config, state);
  } finally {
    emitEvent({
      type: "agent_end",
      sessionId: sessionId,
      messages: snapshotMessages(config.context.messages),
      ts: createTimestamp(),
    });
  }
}

// ============================================================================
// Run Completion
// ============================================================================

async function completeRun(
  config: AgentConfig,
  state: SessionState,
  outcome: Outcome,
): Promise<RunResult> {
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  await config.onOutcome?.(outcome);

  return {
    sessionId: config.sessionId!,
    messages: snapshotMessages(config.context.messages),
    outcome,
    metrics: state.metrics,
  };
}
