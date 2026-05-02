import type { AgentMessage } from "@rowan-agent/session";
import type {
  ModelRef,
  StreamFn,
  Task,
  ToolResult,
  VerificationResult,
} from "./types";
import { parseVerificationResult } from "./task";

export async function verifyTask(input: {
  model: ModelRef;
  stream: StreamFn;
  session: { messages: AgentMessage[] } & Parameters<StreamFn>[1]["session"];
  task: Task;
  toolResults: ToolResult[];
  signal?: AbortSignal;
}): Promise<VerificationResult> {
  let structured: unknown;

  for await (const event of input.stream(
    input.model,
    {
      phase: "verify",
      session: input.session,
      task: input.task,
      toolResults: input.toolResults,
      criteria: input.task.acceptanceCriteria,
    },
    { signal: input.signal },
  )) {
    if (event.type === "structured_output") {
      structured = event.content;
    }
  }

  if (!structured) {
    return {
      passed: false,
      message: "Verifier did not produce structured output.",
    };
  }

  return parseVerificationResult(structured);
}
