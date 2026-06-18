import type { Outcome, AgentMessage } from "../types";
import type { PhaseOutput } from "../protocol/context";
import { createId } from "../utils";

type ExtractedToolResult = NonNullable<Outcome["toolResults"]>[number];

function parseToolResult(content: string): ExtractedToolResult | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<ExtractedToolResult>;
    if (
      typeof parsed.toolCallId === "string" &&
      typeof parsed.toolName === "string" &&
      typeof parsed.ok === "boolean"
    ) {
      return {
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        ok: parsed.ok,
        content: parsed.content,
        ...(parsed.error ? { error: parsed.error } : {}),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractToolResults(transcript: AgentMessage[]): NonNullable<Outcome["toolResults"]> {
  const results: NonNullable<Outcome["toolResults"]> = [];
  for (const msg of transcript) {
    if (msg.role !== "tool") continue;
    if (typeof msg.content === "string") {
      const result = parseToolResult(msg.content);
      if (result) {
        results.push(result);
      }
      continue;
    }

    for (const part of msg.content) {
      if (part.type !== "tool_result") continue;
      const result = parseToolResult(part.content);
      if (result) {
        results.push(result);
      }
    }
  }
  return results;
}

export const createOutcome = {
  phaseNotFound(output: PhaseOutput): Outcome {
    return { id: createId("out"), message: `Phase "${output.phase ?? "Unknown"}" not found.` };
  },

  default(output: PhaseOutput, transcript?: AgentMessage[]): Outcome {
    const toolResults = transcript ? extractToolResults(transcript) : [];
    const message = output.message || output.routeReason || `${output.phase ?? "Unknown"} phase completed.`;
    const outcome: Outcome = {
      id: createId("out"),
      message,
    };
    if (toolResults.length > 0) {
      outcome.toolResults = toolResults;
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
