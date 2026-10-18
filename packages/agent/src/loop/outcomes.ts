import type { JsonValue } from "@rowan-agent/models";
import type { Outcome, OutcomeId, ToolCallId, ToolResultRecord } from "../runtime-events";
import type { AgentMessage } from "../protocol/agent";
import type { PhaseOutput } from "../harness/phases/types";
import { createId } from "../utils";

export type LoopOutcome = Outcome & Readonly<{ display?: boolean }>;

type ExtractedToolResult = ToolResultRecord;

function parseToolResult(content: string): ExtractedToolResult | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<ExtractedToolResult>;
    if (
      typeof parsed.toolCallId === "string" &&
      typeof parsed.toolName === "string" &&
      typeof parsed.ok === "boolean"
    ) {
      const base = {
        toolCallId: parsed.toolCallId as ToolCallId,
        toolName: parsed.toolName,
        content: (parsed.content as JsonValue) ?? null,
      };
      if (parsed.ok) {
        return { ...base, ok: true };
      }
      return {
        ...base,
        ok: false,
        error: typeof (parsed as any).error === "string" ? (parsed as any).error : "Tool execution failed.",
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractToolResults(transcript: AgentMessage[]): NonNullable<Outcome["toolResults"]> {
  const results: ExtractedToolResult[] = [];
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
      if (typeof part.content === "string") {
        const result = parseToolResult(part.content);
        if (result) {
          results.push(result);
        }
      }
    }
  }
  return results;
}

export const createOutcome = {
  phaseNotFound(output: PhaseOutput): LoopOutcome {
    return {
      id: createId("out") as OutcomeId,
      message: `Phase "${output.phase ?? "Unknown"}" not found.`,
      display: true,
    };
  },

  default(output: PhaseOutput, transcript?: AgentMessage[]): LoopOutcome {
    const toolResults = transcript ? extractToolResults(transcript) : [];
    const message = output.message || output.routeReason || `${output.phase ?? "Unknown"} phase completed.`;
    return {
      id: createId("out") as OutcomeId,
      message,
      ...(output.payload !== undefined ? { payload: output.payload as never } : {}),
      ...(toolResults.length > 0 ? { toolResults } : {}),
    };
  },

  phase(output: PhaseOutput, transcript?: AgentMessage[]): LoopOutcome {
    return {
      ...this.default(output, transcript),
      display: true,
    };
  },

  aborted(): LoopOutcome {
    return { id: createId("out") as OutcomeId, message: "Agent run aborted." };
  },

  error(message: string): LoopOutcome {
    return { id: createId("out") as OutcomeId, message, display: true };
  },
};
