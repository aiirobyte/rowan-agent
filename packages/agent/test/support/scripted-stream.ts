import type { StreamFn, Task, TaskOutput, ToolResult } from "../../src/types";
import { createId, latestUserInput } from "../../src/types";
import { createDefaultCriteria } from "@rowan-agent/agent";

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

function toolResultsFromTaskOutput(taskOutput: TaskOutput): ToolResult[] {
  return taskOutput.kind === "tools" ? taskOutput.toolResults : [];
}

function createScriptedVerification(task: Task, taskOutput: TaskOutput): { passed: boolean; message: string } {
  const requiredEcho = task.toolNames.includes("echo");
  const toolResults = toolResultsFromTaskOutput(taskOutput);
  const hasEcho = toolResults.some((result) => result.toolName === "echo" && result.ok);
  const passed = requiredEcho ? hasEcho : true;

  return {
    passed,
    message: passed
      ? `Task passed: ${task.title}`
      : `Task failed: missing required echo evidence for ${task.title}`,
  };
}

export const scriptedStream: StreamFn = async function* scriptedStream(model, context, options) {
  if (options.signal?.aborted) {
    throw new Error("Stream aborted.");
  }

  if (context.phase === "chat") {
    const currentInput = latestUserInput(context.state);
    const route = wantsEcho(currentInput) ? "plan" : "direct";
    const message = route === "plan" ? "Routing to task execution." : `Direct response: ${currentInput}`;
    yield {
      type: "model_requested",
      phase: "chat",
      model,
      usage: { inputMessages: context.state.messages.length },
    };
    yield { type: "text_delta", text: message };
    yield {
      type: "structured_output",
      content: {
        message,
        route,
      },
    };
    yield { type: "done" };
    return;
  }

  if (context.phase === "plan") {
    const skillIds = context.state.skills.map((skill) => skill.id);
    const currentInput = context.state.task ?? latestUserInput(context.state);
    yield { type: "text_delta", text: "Planning task..." };
    yield {
      type: "structured_output",
      content: createScriptedTask(currentInput, skillIds),
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

  if (context.phase === "verify") {
    yield { type: "text_delta", text: "Verifying task outcome..." };
    yield {
      type: "structured_output",
      content: createScriptedVerification(context.task, context.taskOutput),
    };
    yield { type: "done" };
  }
};
