/**
 * Example: Phase with run pattern
 *
 * The run function takes full control — no LLM invocation happens.
 * Use this for phases that do programmatic work (validation, file ops, etc.)
 *
 * The PHASE.md still defines metadata; the run() function replaces the
 * LLM call with custom logic.
 */
import type { PhaseContext, PhaseExecution, PhaseOutput } from "@rowan-agent/agent";

export async function run(
  context: PhaseContext,
  execution: PhaseExecution,
): Promise<PhaseOutput> {
  const payload = context.state.payload as {
    steps?: Array<{ action: string; verified: boolean }>;
  } | undefined;

  const steps = payload?.steps ?? [];
  const allVerified = steps.length > 0 && steps.every((s) => s.verified);

  if (allVerified) {
    return {
      message: `All ${steps.length} steps verified.`,
      route: "stop",
      payload: { success: true, completedSteps: steps.length },
    };
  }

  // Programmatic validation — no LLM involved
  return {
    message: `${steps.filter((s) => s.verified).length}/${steps.length} steps verified. Continuing.`,
    route: "continue",
  };
}
