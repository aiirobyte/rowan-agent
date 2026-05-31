import type { LlmRequest, StreamFn } from "../../src/types";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { createId } from "../../src/utils";

/** Build a partial snapshot for test events */
export function buildTestPartial(text: string): AssistantMessagePartial {
  return {
    role: "assistant",
    contentBlocks: text ? [{ type: "text", text }] : [],
  };
}

/** Build a partial with a tool call for test events */
export function buildToolCallPartial(toolId: string, toolName: string, toolArgs: string): AssistantMessagePartial {
  return {
    role: "assistant",
    contentBlocks: [{ type: "tool_call", id: toolId, name: toolName, args: toolArgs }],
  };
}

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
    acceptanceCriteria: [
      shouldUseEcho
        ? "The outcome must include evidence from the echo tool."
        : "The outcome must address the user's input.",
    ],
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
    const text = JSON.stringify({ message, route });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
    return;
  }

  if (phase === "plan") {
    const input = userRequest || "hello";
    const text = JSON.stringify({ message: "Planning task...", task: createScriptedTask(input, []) });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
    return;
  }

  if (phase === "execute") {
    // Yield native tool call events for the echo tool
    const toolId = createId("call");
    const toolName = "echo";
    const toolArgs = JSON.stringify({ message: userRequest || "echo" });
    const textPartial = buildTestPartial("");
    const withTool: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [{ type: "tool_call", id: toolId, name: toolName, args: toolArgs }],
    };
    yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...withTool, contentBlocks: [...withTool.contentBlocks] } };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...withTool, contentBlocks: [...withTool.contentBlocks] } };
    yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...withTool, contentBlocks: [...withTool.contentBlocks] } };
    yield { type: "done" };
    return;
  }

  if (phase === "verify") {
    const lastUserMsg = (request.messages.filter((m) => m.role === "user").pop()?.content ?? "") as string;
    const requiresEcho = lastUserMsg.includes("echo") && lastUserMsg.includes("acceptanceCriteria");
    const hasEchoEvidence = /"toolName"\s*:\s*"echo"/.test(lastUserMsg) && /"ok"\s*:\s*true/.test(lastUserMsg);
    const passed = requiresEcho ? hasEchoEvidence : true;
    const taskTitleMatch = lastUserMsg.match(/"title"\s*:\s*"([^"]+)"/);
    const taskTitle = taskTitleMatch?.[1] ?? (userRequest || "task");
    const message = passed
      ? `Task passed: ${taskTitle}`
      : `Task failed: missing required echo evidence for ${taskTitle}`;
    const text = message;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  }
};
