import type { ContextScope, Session as CoreSession } from "@rowan-agent/session";
import type {
  ExecutionTurn,
  ExecutionTurnEntry,
  LlmPhase,
  ModelCallUsage,
  ModelRef,
} from "@rowan-agent/protocol";
import { createId } from "./types";

export type TurnRecorderRuntime = {
  session: CoreSession<unknown>;
  model: ModelRef;
  recordStep?: (step: ExecutionTurn) => Promise<void>;
};

export async function recordPhaseStep(input: {
  loop: TurnRecorderRuntime;
  phase: LlmPhase;
  requestedAtMs: number;
  entries: ExecutionTurnEntry[];
  usage?: ModelCallUsage;
  scope?: ContextScope;
}): Promise<void> {
  if (!input.loop.recordStep || input.entries.length === 0) {
    return;
  }

  await input.loop.recordStep({
    id: createId("step"),
    sessionId: input.loop.session.id,
    ...(input.loop.session.parentSessionId ? { parentSessionId: input.loop.session.parentSessionId } : {}),
    phase: input.phase,
    requestedAtMs: input.requestedAtMs,
    completedAtMs: Date.now(),
    model: input.loop.model,
    ...(input.usage ? { usage: input.usage } : {}),
    scope: input.scope ?? "execution",
    entries: input.entries,
  });
}
