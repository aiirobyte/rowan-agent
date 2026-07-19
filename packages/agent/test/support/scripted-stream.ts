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
export function* yieldRouteToolCall(route: string, reason?: string, existingText?: string): Generator<any> {
  const toolId = createId("route");
  const toolArgs = JSON.stringify({ decision: [{ phase: route, reason }], instruction: undefined });
  const contentBlocks: AssistantMessagePartial["contentBlocks"] = [];
  if (existingText) {
    contentBlocks.push({ type: "text", text: existingText });
  }
  contentBlocks.push({ type: "tool_call", id: toolId, name: "route", args: toolArgs });
  const partial: AssistantMessagePartial = {
    role: "assistant",
    contentBlocks,
  };
  yield { type: "tool_call_start", id: toolId, name: "route", partial };
  yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
  yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial };
}

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    if (typeof content === "string") {
      const match = content.match(/^Phase:\s*(\w+)/);
      if (match) {
        return match[1];
      }
    }
  }
  return "chat";
}

function wantsEcho(input: string): boolean {
  return /\becho\b|tool|工具|use echo/i.test(input);
}

function extractUserRequest(messages: LlmRequest["messages"]): string {
  // Find the first user message (the actual user input, not phase instructions)
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      // Skip phase instruction messages; the runtime sends them as user
      // context, before the actual user input.
      if (msg.content.startsWith("Phase:") || msg.content.startsWith("<phase_content")) continue;
      return msg.content;
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
    const toolArgs = JSON.stringify({ decision: [{ phase: route, reason }], instruction: undefined });
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
    const toolArgs = JSON.stringify({ decision: [{ phase: "execute", reason: "Task planned." }], instruction: undefined });
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
    const routeArgs = JSON.stringify({ decision: [{ phase: "verify", reason: "Execution complete." }], instruction: undefined });
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
    // Check for task info in messages (could be in yield or conversation)
    const allContent = request.messages.map(m => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map(b => {
          if (b.type === "text") return b.text;
          if (b.type === "tool_result") return b.content;
          return "";
        }).join(" ");
      }
      return "";
    }).join("\n");
    const requiresEcho = allContent.includes("echo") && allContent.includes("acceptanceCriteria");
    // Check for successful echo tool execution in tool messages
    const hasEchoEvidence = request.messages.some(m => {
      if (m.role !== "tool") return false;
      // Check string content for successful echo result
      if (typeof m.content === "string") {
        return m.content.includes('"ok":true') && m.content.includes('"toolName":"echo"');
      }
      // Check content blocks for tool_result with echo evidence
      if (Array.isArray(m.content)) {
        return m.content.some(b => {
          if (b.type !== "tool_result") return false;
          return b.content.includes('"ok":true') && b.content.includes('"toolName":"echo"');
        });
      }
      return false;
    });
    const passed = requiresEcho ? hasEchoEvidence : true;
    const taskTitleMatch = allContent.match(/"title"\s*:\s*"([^"]+)"/);
    const taskTitle = taskTitleMatch?.[1] ?? (userRequest || "task");
    const reason = passed
      ? `Task passed: ${taskTitle}`
      : `Task failed: missing required echo evidence for ${taskTitle}`;
    const text = reason;
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    // Output route tool call
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ decision: [{ phase: "stop", reason }], instruction: undefined });
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
