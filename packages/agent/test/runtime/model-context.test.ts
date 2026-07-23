import { expect, test } from "bun:test";
import Type from "typebox";
import { projectModelContext } from "../../src/runtime/model-context";
import type { AgentId, Message, RunId } from "../../src/runtime-events";

const agentId = "agent-1" as AgentId;
const runId = "run-1" as RunId;

test("projects durable Tool messages to provider correlation fields", () => {
  const messages: Message[] = [
    {
      id: "message-1" as never,
      agentId,
      runId,
      role: "assistant",
      content: [{ type: "tool_use", toolCallId: "tool-1" as never, name: "lookup", input: { query: "rowan" } }],
      sequenceWithinRun: 0,
      createdAt: "2026-07-23T00:00:00.000Z",
    },
    {
      id: "message-2" as never,
      agentId,
      runId,
      role: "tool",
      content: [{ type: "tool_result", toolCallId: "tool-1" as never, result: { ok: true, content: { value: 42 } } }],
      sequenceWithinRun: 1,
      createdAt: "2026-07-23T00:00:01.000Z",
    },
  ];
  const context = projectModelContext({
    context: {
      systemPrompt: "Test",
      tools: [{ name: "lookup", description: "Look up", parameters: Type.Object({}), execute: async () => ({ ok: true, content: null }) }],
      skills: [],
    },
    messages,
    agentId,
    runId,
  });

  expect(context.messages[0]?.content).toEqual([{ type: "tool_use", id: "tool-1", name: "lookup", input: { query: "rowan" } }]);
  expect(context.messages[1]?.content).toEqual([{ type: "tool_result", toolUseId: "tool-1", content: JSON.stringify({ value: 42 }) }]);
});
