import type { EngineContext, EngineStreamEvent, StreamFn } from "../../src/types";
import { createId } from "../../src/types";
import { createDefaultCriteria } from "@rowan-agent/agent";

function detectPhase(messages: EngineContext["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = messages[i].content.match(/^Phase:\s*(\w+)/);
    if (match) {
      return match[1];
    }
  }
  return "chat";
}

function wantsEcho(input: string): boolean {
  return /\becho\b|tool|工具|use echo/i.test(input);
}

function extractUserRequest(messages: EngineContext["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const match = msg.content.match(/Current user request:\s*\n"([^"]+)"/);
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

export const scriptedStream: StreamFn = async function* scriptedStream(model, context, options) {
  if (options.signal?.aborted) {
    throw new Error("Stream aborted.");
  }

  const phase = detectPhase(context.messages);
  const userRequest = extractUserRequest(context.messages);

  if (phase === "chat") {
    const route = wantsEcho(userRequest) ? "plan" : "direct";
    const message = route === "plan" ? "Routing to task execution." : `Direct response: ${userRequest}`;
    yield {
      type: "model_requested",
      model,
      usage: { inputMessages: context.messages.length },
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

  if (phase === "plan") {
    const input = userRequest || "hello";
    yield { type: "text_delta", text: "Planning task..." };
    yield {
      type: "structured_output",
      content: createScriptedTask(input, []),
    };
    yield { type: "done" };
    return;
  }

  if (phase === "execute") {
    // Always yield tool call - the execute handler handles unknown/blocked tools
    yield {
      type: "structured_output",
      content: {
        message: "Calling echo tool.",
        toolCalls: [
          {
            id: createId("call"),
            name: "echo",
            args: { message: userRequest || "echo" },
          },
        ],
      },
    };
    yield { type: "done" };
    return;
  }

  if (phase === "verify") {
    // The verify prompt includes task output with tool results as JSON.
    // Check if echo tool evidence is present in the prompt content.
    const lastUserMsg = context.messages.filter((m) => m.role === "user").pop()?.content ?? "";
    const requiresEcho = lastUserMsg.includes("echo") && lastUserMsg.includes("acceptanceCriteria");
    const hasEchoEvidence = /"toolName"\s*:\s*"echo"/.test(lastUserMsg) && /"ok"\s*:\s*true/.test(lastUserMsg);
    const passed = requiresEcho ? hasEchoEvidence : true;
    // Extract task title from verify prompt for the message
    const taskTitleMatch = lastUserMsg.match(/"title"\s*:\s*"([^"]+)"/);
    const taskTitle = taskTitleMatch?.[1] ?? (userRequest || "task");
    const message = passed
      ? `Task passed: ${taskTitle}`
      : `Task failed: missing required echo evidence for ${taskTitle}`;

    yield { type: "text_delta", text: "Verifying task outcome..." };
    yield {
      type: "structured_output",
      content: { passed, message },
    };
    yield { type: "done" };
  }
};
