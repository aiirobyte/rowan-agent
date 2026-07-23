import { expect, test } from "bun:test";
import type {
  AgentId,
  AssistantMessage,
  DurableRunEvent,
  EventCursor,
  EventId,
  MessageId,
  RunId,
} from "../../src/runtime-events";

const agentId = "agent-1" as AgentId;
const runId = "run-1" as RunId;
const assistant: AssistantMessage = {
  id: "message-1" as MessageId,
  agentId,
  runId,
  role: "assistant",
  content: "done",
  sequenceWithinRun: 1,
  createdAt: "2026-07-23T00:00:00.000Z",
};

test("Runtime Events are readonly discriminated DTOs owned by agent", () => {
  const event = {
    id: "event-1" as EventId,
    schemaVersion: 1,
    cursor: "store-1:1" as EventCursor,
    durability: "durable",
    agentId,
    runId,
    runRevision: 2,
    createdAt: "2026-07-23T00:00:00.000Z",
    kind: "run_transitioned",
    from: "running",
    to: "completed",
    outcome: { id: "outcome-1" as never, message: "done" },
    output: assistant,
  } satisfies DurableRunEvent;
  expect(event.kind).toBe("run_transitioned");
  expect(event.output?.role).toBe("assistant");
  const invalid: DurableRunEvent = {
    ...event,
    kind: "tool_state_changed",
    transition: { from: null, to: "pending" },
    // @ts-expect-error A pending Tool event must carry a pending Tool snapshot.
    toolCall: { state: "completed" },
  };
  void invalid;
});
