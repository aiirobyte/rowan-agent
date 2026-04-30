import type { StreamFn, Task, ToolResult, VerificationResult } from "../../src/types";
import { createId } from "../../src/types";
import { createDefaultCriteria } from "../../src/task";

function wantsEcho(input: string): boolean {
  return /\becho\b|tool|工具|use echo/i.test(input);
}

function createScriptedTask(input: string, skillIds: string[]): Task {
  const shouldUseEcho = wantsEcho(input);
  return {
    id: createId("task"),
    title: shouldUseEcho ? "Use echo tool" : "Respond to user",
    instruction: input,
    acceptanceCriteria: createDefaultCriteria(
      shouldUseEcho
        ? "The outcome must include evidence from the echo tool."
        : "The outcome must address the user's input.",
    ),
    toolNames: shouldUseEcho ? ["echo"] : [],
    skillIds,
    status: "pending",
    attempts: 0,
  };
}

function createScriptedVerification(task: Task, toolResults: ToolResult[]): VerificationResult {
  const requiredEcho = task.toolNames.includes("echo");
  const hasEcho = toolResults.some((result) => result.toolName === "echo" && result.ok);
  const passed = requiredEcho ? hasEcho : true;

  return {
    passed,
    message: passed
      ? `Task passed: ${task.title}`
      : `Task failed: missing required echo evidence for ${task.title}`,
    evidence: toolResults.map((result) => ({
      id: createId("ev"),
      kind: "tool_result",
      summary: result.ok
        ? `${result.toolName} returned usable evidence.`
        : `${result.toolName} failed: ${result.error ?? "unknown error"}`,
      data: result,
    })),
    failedCriteria: passed
      ? []
      : task.acceptanceCriteria.filter((criterion) => criterion.required).map((criterion) => criterion.id),
  };
}

export const scriptedStream: StreamFn = async function* scriptedStream(_model, context, options) {
  if (options.signal?.aborted) {
    throw new Error("Stream aborted.");
  }

  if (context.phase === "plan") {
    const skillIds = context.session.skills.map((skill) => skill.id);
    yield { type: "text_delta", text: "Planning task..." };
    yield {
      type: "structured_output",
      content: createScriptedTask(context.session.userInput, skillIds),
    };
    yield { type: "done" };
    return;
  }

  if (context.phase === "execute") {
    if (context.task.toolNames.includes("echo")) {
      yield {
        type: "tool_call",
        toolCall: {
          id: createId("call"),
          name: "echo",
          args: { message: context.task.instruction },
        },
      };
    } else {
      yield { type: "text_delta", text: `No tool needed for: ${context.task.instruction}` };
    }
    yield { type: "done" };
    return;
  }

  yield { type: "text_delta", text: "Verifying task outcome..." };
  yield {
    type: "structured_output",
    content: createScriptedVerification(context.task, context.toolResults),
  };
  yield { type: "done" };
};
