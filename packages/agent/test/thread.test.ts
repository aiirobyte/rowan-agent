import { expect, test } from "bun:test";
import { createSession } from "@rowan-agent/agent";
import { Agent } from "../src/agent";
import type { AgentEvent, StreamFn } from "../src/types";
import { createId } from "../src/utils";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { echoTool } from "./support/echo-tool";
import { scriptedStream, buildTestPartial, yieldRouteToolCall } from "./support/scripted-stream";

test("Agent does not expose startThread", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
  });

  await runAgentTurn(agent, "hello");
  expect("startThread" in agent).toBe(false);
});

test("tools can spawn sub-agents via the thread tool and return outcomes", async () => {
  const parentStream: StreamFn = async function* parentStream(request, options) {
    const threadResult = request.messages.find((message) => message.role === "tool");
    if (threadResult) {
      expect(JSON.stringify(threadResult.content)).toContain("Sub-agent response.");
      const text = "Parent received sub-agent response.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    // Sub-agent runs get a simple response
    const isSubAgent = request.messages.some(
      (m) => typeof m.content === "string" && m.content.includes("use echo tool"),
    );
    if (isSubAgent) {
      const text = "Sub-agent response.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    // Parent: call thread tool then return
    const toolId = createId("call");
    const toolName = "thread";
    const toolArgs = JSON.stringify({ prompt: "use echo tool" });
    const withTool = {
      role: "assistant" as const,
      contentBlocks: [
        { type: "tool_call" as const, id: toolId, name: toolName, args: toolArgs },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: toolName, partial: withTool };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: withTool };
    yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: withTool };
    yield { type: "done" };
  };

  const events: AgentEvent[] = [];
  const session = createSession<AgentEvent>({
    systemPrompt: "Test system",
    input: "call helper tool",
  });
  const agent = new Agent({
    context: createTestContext({
      tools: [echoTool],
      messages: session.messages,
    }),
    model: { provider: "test", name: "parent" },
    stream: parentStream,
    sessionId: session.id,
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "call helper tool");

  expect(outcome.outcome).not.toHaveProperty("evidence");
  expect(outcome.outcome).not.toHaveProperty("failedCriteria");
  expect(outcome.outcome.message).toBe("Parent received sub-agent response.");
  expect(outcome.outcome.toolResults).toEqual([
    expect.objectContaining({
      toolName: "thread",
      ok: true,
    }),
  ]);
});
