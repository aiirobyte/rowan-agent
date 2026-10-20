import type { JsonObject, JsonValue, Message, RunStateChanged } from "../runtime-events";
import type { RunInteraction } from "../harness/phases/interactions";
import type { UserInput } from "./contracts";

/** The durable consumer through which a child Agent's Runs reach its parent. */
export const CHILD_REPORTS_CONSUMER_ID = "rowan:child-reports";

export const CHILD_OUTCOME_KIND = "rowan.child-outcome";
export const CHILD_INTERACTION_KIND = "rowan.child-interaction";

export type SettledChildRun = Extract<RunStateChanged, { to: "completed" | "failed" | "cancelled" }>;
export type WaitingChildRun = Extract<RunStateChanged, { to: "input_required" }>;

export function isSettledChildRun(event: RunStateChanged): event is SettledChildRun {
  return event.to === "completed" || event.to === "failed" || event.to === "cancelled";
}

/** A host-neutral input: JSON a model can read, and the same identity as machine-readable metadata. */
function report(metadata: JsonObject, detail: JsonObject): UserInput {
  return { content: JSON.stringify({ ...metadata, ...detail }), metadata };
}

/** The Outcome of a settled child Run, or why it failed or was cancelled. */
export function childOutcomeInput(event: SettledChildRun): UserInput {
  const metadata = { kind: CHILD_OUTCOME_KIND, childAgentId: event.agentId, childRunId: event.runId, state: event.to };
  if (event.to === "completed") {
    return report(metadata, {
      message: event.outcome.message,
      ...(event.outcome.payload === undefined ? {} : { payload: event.outcome.payload }),
    });
  }
  if (event.to === "failed") return report(metadata, { code: event.failure.code, error: event.failure.message });
  return report(metadata, event.reason === undefined ? {} : { reason: event.reason });
}

/** One Interaction a child Run is waiting on; `toolCall` is the call it would permit, when there is one. */
export function childInteractionInput(
  event: WaitingChildRun,
  interaction: RunInteraction,
  toolCall?: Readonly<{ name: string; args: JsonValue }>,
): UserInput {
  const metadata = {
    kind: CHILD_INTERACTION_KIND,
    childAgentId: event.agentId,
    childRunId: event.runId,
    interactionId: interaction.id,
    interactionKind: interaction.kind,
  };
  return report(metadata, {
    prompt: interaction.prompt,
    ...(interaction.payload === undefined ? {} : { payload: interaction.payload }),
    ...(interaction.toolCallId === undefined ? {} : { toolCallId: interaction.toolCallId }),
    ...(toolCall === undefined ? {} : { toolCall: { name: toolCall.name, args: toolCall.args } }),
  });
}

/** The name and arguments of the Tool Call an Interaction guards, from the child's history. */
export function toolCallOf(history: readonly Message[], interaction: RunInteraction): { name: string; args: JsonValue } | undefined {
  if (interaction.toolCallId === undefined) return undefined;
  for (const message of history) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type === "tool_use" && block.toolCallId === interaction.toolCallId) {
        return { name: block.name, args: block.input };
      }
    }
  }
  return undefined;
}
