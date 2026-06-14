import type { Outcome, AgentMessage } from "../types";
import { createId } from "../utils";
import type { LoopResult } from "./errors";

type ExtractedToolResult = NonNullable<Outcome["toolResults"]>[number];

function summarizeToolResult(result: ExtractedToolResult): string {
  if (typeof result.content === "string") {
    return result.content;
  }
  if (result.content && typeof result.content === "object") {
    const content = result.content as Record<string, unknown>;
    const stdout = typeof content.stdout === "string" ? content.stdout : "";
    const stderr = typeof content.stderr === "string" ? content.stderr : "";
    const text = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (text) {
      return text;
    }
  }
  return result.ok
    ? `${result.toolName} completed.`
    : `${result.toolName} failed${result.error ? `: ${result.error}` : "."}`;
}

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
    const toolResults = transcript ? extractToolResults(transcript) : [];
    const outcome: Outcome = {
      id: createId("out"),
      message: output.message || toolResults.map(summarizeToolResult).filter(Boolean).join("\n\n") || "Completed.",
    };
    if (toolResults.length > 0) {
      outcome.toolResults = toolResults;
    }
    return outcome;
  },

  aborted(): Outcome {
    return { id: createId("out"), message: "Agent run aborted." };
  },

  threadDepthLimit(input: { threadDepth: number; maxThreadDepth: number }): Outcome {
    return {
      id: "thread_depth_limit",
      message: `Thread depth limit exceeded (${input.threadDepth}/${input.maxThreadDepth}).`,
    };
  },

  error(message: string): Outcome {
    return { id: createId("out"), message };
  },
};
