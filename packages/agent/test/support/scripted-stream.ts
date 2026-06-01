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

/** Yield events for a route tool call */
export function* yieldRouteToolCall(route: string, reason?: string): Generator<any> {
  const toolId = createId("route");
  const toolArgs = JSON.stringify({ route, reason });
  const partial = buildToolCallPartial(toolId, "route", toolArgs);
  yield { type: "tool_call_start", id: toolId, name: "route", partial };
  yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
  yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial };
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
    const route = wantsEcho(userRequest) ? "plan" : "stop";
    const reason = route === "plan" ? "Routing to task execution." : `Direct response: ${userRequest}`;
    yield {
      type: "model_requested",
      model: request.model,
      usage: { inputMessages: request.messages.length },
    };
    // Output text message
    const text = reason;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    // Output route tool call
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ route, reason });
    const withRoute: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "text", text },
        { type: "tool_call", id: toolId, name: "route", args: toolArgs },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: "route", partial: withRoute };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withRoute };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: withRoute };
    yield { type: "done" };
    return;
  }

  if (phase === "plan") {
    const input = userRequest || "hello";
    const task = createScriptedTask(input, []);
    const text = JSON.stringify(task);
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    // Output route tool call to execute
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ route: "execute", reason: "Task planned." });
    const withRoute: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "text", text },
        { type: "tool_call", id: toolId, name: "route", args: toolArgs },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: "route", partial: withRoute };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withRoute };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: withRoute };
    yield { type: "done" };
    return;
  }

  if (phase === "execute") {
    // Yield native tool call events for the echo tool
    const toolId = createId("call");
    const toolName = "echo";
    const toolArgs = JSON.stringify({ message: userRequest || "echo" });
    const withTool: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [{ type: "tool_call", id: toolId, name: toolName, args: toolArgs }],
    };
    yield { type: "tool_call_start", id: toolId, name: toolName, partial: withTool };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withTool };
    yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: withTool };
    // Output route tool call to verify
    const routeId = createId("route");
    const routeArgs = JSON.stringify({ route: "verify", reason: "Execution complete." });
    const withRoute: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "tool_call", id: toolId, name: toolName, args: toolArgs },
        { type: "tool_call", id: routeId, name: "route", args: routeArgs },
      ],
    };
    yield { type: "tool_call_start", id: routeId, name: "route", partial: withRoute };
    yield { type: "tool_call_delta", id: routeId, arguments: routeArgs, partial: withRoute };
    yield { type: "tool_call_end", id: routeId, name: "route", arguments: routeArgs, partial: withRoute };
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
    const reason = passed
      ? `Task passed: ${taskTitle}`
      : `Task failed: missing required echo evidence for ${taskTitle}`;
    const text = reason;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    // Output route tool call
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ route: "stop", reason });
    const withRoute: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "text", text },
        { type: "tool_call", id: toolId, name: "route", args: toolArgs },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: "route", partial: withRoute };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withRoute };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: withRoute };
    yield { type: "done" };
  }
};
