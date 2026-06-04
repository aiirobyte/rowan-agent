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
    // Sub-agent runs get the scripted stream
    const isSubAgent = request.messages.some(
      (m) => typeof m.content === "string" && m.content.includes("use echo tool"),
    );
    if (isSubAgent) {
      yield* scriptedStream(request, options);
      return;
    }

    const phase = request.messages
      .map((m) => {
        const match = (m.content as string).match(/^Phase:\s*(\w+)/);
        return match?.[1];
      })
      .filter(Boolean)
      .pop() ?? "chat";

    if (phase === "chat") {
      const text = "Start a sub-agent.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("plan", text);
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      const text = JSON.stringify({
        id: createId("task"),
        title: "Delegate sub-agent work",
        instruction: "Ask a sub-agent to use echo.",
        acceptanceCriteria: ["Sub-agent outcome must pass."],
        toolNames: ["thread"],
        skillIds: [],
        status: "pending",
        attempts: 0,
      });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("execute", "Task planned.");
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
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
      // Add route tool call
      const routeId = createId("route");
      const routeArgs = JSON.stringify({ route: "verify", reason: "Execution complete." });
      const withRoute = {
        role: "assistant" as const,
        contentBlocks: [
          { type: "tool_call" as const, id: toolId, name: toolName, args: toolArgs },
          { type: "tool_call" as const, id: routeId, name: "route", args: routeArgs },
        ],
      };
      yield { type: "tool_call_start", id: routeId, name: "route", partial: withRoute };
      yield { type: "tool_call_delta", id: routeId, arguments: routeArgs, partial: withRoute };
      yield { type: "tool_call_end", id: routeId, name: "route", arguments: routeArgs, partial: withRoute };
      yield { type: "done" };
      return;
    }

    // verify phase
    const text = "Sub-agent outcome was returned.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", text);
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
  expect(
    events.some(
      (event) =>
        event.type === "tool_execution_end" &&
        event.toolName === "thread" &&
        !event.isError &&
        typeof event.result.content === "string" &&
        event.result.content.includes("outcome"),
    ),
  ).toBe(true);
});
