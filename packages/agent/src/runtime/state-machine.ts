import type { RunState } from "../runtime-events";

export const RUN_STATES = [
  "queued",
  "running",
  "input_required",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly RunState[];

const transitions: Readonly<Record<"nonexistent" | RunState, readonly RunState[]>> = {
  nonexistent: ["queued"],
  queued: ["running", "failed", "cancelled"],
  running: ["input_required", "completed", "failed", "cancelled"],
  input_required: ["queued", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRun(from: "nonexistent" | RunState, to: RunState): boolean {
  return transitions[from].includes(to);
}

export function allowedRunTransitions(from: "nonexistent" | RunState): readonly RunState[] {
  return transitions[from];
}

export function assertRunTransition(from: "nonexistent" | RunState, to: RunState): void {
  if (!canTransitionRun(from, to)) throw new RangeError(`Invalid Run transition: ${from} -> ${to}`);
}

export function isTerminalRunState(state: RunState): state is "completed" | "failed" | "cancelled" {
  return state === "completed" || state === "failed" || state === "cancelled";
}
