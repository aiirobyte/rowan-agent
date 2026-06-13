import type { Outcome, AgentMessage } from "../types";
import { createId } from "../utils";
import type { LoopResult } from "./errors";

function extractToolResults(transcript: AgentMessage[]): NonNullable<Outcome["toolResults"]> {
  const results: NonNullable<Outcome["toolResults"]> = [];
  for (const msg of transcript) {
    if (msg.role !== "tool") continue;
    try {
      const parsed = JSON.parse(msg.content);
      results.push({
        toolName: parsed.toolName,
        ok: parsed.ok,
        content: parsed.content,
        ...(parsed.error ? { error: parsed.error } : {}),
      });
    } catch {
      // Skip malformed tool messages
    }
  }
  return results;
}

export const createOutcome = {
  fromResult(result: LoopResult): Outcome {
    if (result.stopReason === "none") {
      return { id: createId("out"), message: "Completed." };
    }
    if (result.stopReason === "aborted") {
      return createOutcome.aborted();
    }
    return createOutcome.error(result.message);
  },

  phase(): Outcome {
    return { id: "default", message: "Phase completed." };
  },

  default(output: { message: string }, transcript?: AgentMessage[]): Outcome {
    const outcome: Outcome = {
      id: createId("out"),
      message: output.message || "Completed.",
    };
    if (transcript) {
      const toolResults = extractToolResults(transcript);
      if (toolResults.length > 0) {
        outcome.toolResults = toolResults;
      }
    }
    return outcome;
  },

  aborted(): Outcome {
    return { id: createId("out"), message: "Agent run aborted." };
  },

  error(message: string): Outcome {
    return { id: createId("out"), message };
  },
};
