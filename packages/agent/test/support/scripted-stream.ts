import type { LlmRequest, StreamFn } from "../../src/types";
import { createId } from "../../src/types";
import { createDefaultCriteria } from "@rowan-agent/agent";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) {
      return match[1];
    }
  }
  return "chat";
}

function wantsEcho(input: string): boolean {
  return /\becho\b|tool|工具|use echo/i.test(input);
}

function extractUserRequest(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const match = (msg.content as string).match(/Current user request:\s*\n"([^"]+)"/);
      if (match) {
        return match[1];
      }
    }
  }
  return "";
}

function createScriptedTask(input: string, skillIds: string[]): {
  id: string;
  title: string;
  instruction: string;
  acceptanceCriteria: string[];
  toolNames: string[];
  skillIds: string[];
  status: string;
  attempts: number;
} {
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

export const scriptedStream: StreamFn = async function* scriptedStream(request, options) {
  if (options.signal?.aborted) {
    throw new Error("Stream aborted.");
  }

  const phase = detectPhase(request.messages);
  const userRequest = extractUserRequest(request.messages);

  if (phase === "chat") {
    const route = wantsEcho(userRequest) ? "plan" : "direct";
    const message = route === "plan" ? "Routing to task execution." : `Direct response: ${userRequest}`;
    yield {
      type: "model_requested",
      model: request.model,
      usage: { inputMessages: request.messages.length },
    };
    yield { type: "text_delta", text: JSON.stringify({ message, route }) };
    yield { type: "done" };
    return;
  }

  if (phase === "plan") {
    const input = userRequest || "hello";
    yield { type: "text_delta", text: JSON.stringify({ message: "Planning task...", task: createScriptedTask(input, []) }) };
    yield { type: "done" };
    return;
  }

  if (phase === "execute") {
    // Always yield tool call - the execute handler handles unknown/blocked tools
    yield {
      type: "text_delta",
      text: JSON.stringify({
        message: "Calling echo tool.",
        toolCalls: [
          {
            id: createId("call"),
            name: "echo",
            args: { message: userRequest || "echo" },
          },
        ],
      }),
    };
    yield { type: "done" };
    return;
  }

  if (phase === "verify") {
    // The verify prompt includes task output with tool results as JSON.
    // Check if echo tool evidence is present in the prompt content.
    const lastUserMsg = (request.messages.filter((m) => m.role === "user").pop()?.content ?? "") as string;
    const requiresEcho = lastUserMsg.includes("echo") && lastUserMsg.includes("acceptanceCriteria");
    const hasEchoEvidence = /"toolName"\s*:\s*"echo"/.test(lastUserMsg) && /"ok"\s*:\s*true/.test(lastUserMsg);
    const passed = requiresEcho ? hasEchoEvidence : true;
    // Extract task title from verify prompt for the message
    const taskTitleMatch = lastUserMsg.match(/"title"\s*:\s*"([^"]+)"/);
    const taskTitle = taskTitleMatch?.[1] ?? (userRequest || "task");
    const message = passed
      ? `Task passed: ${taskTitle}`
      : `Task failed: missing required echo evidence for ${taskTitle}`;

    yield { type: "text_delta", text: JSON.stringify({ passed, message }) };
    yield { type: "done" };
  }
};
