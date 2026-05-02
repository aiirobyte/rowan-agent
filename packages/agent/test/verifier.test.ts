import { expect, test } from "bun:test";
import { createSession as createBaseSession } from "@rowan-agent/session";
import { verifyTask } from "../src/verifier";
import { parseTask, createDefaultCriteria } from "../src/task";
import { createId, type AgentEvent } from "../src/types";
import { scriptedStream } from "./support/scripted-stream";

function createSession(input: Parameters<typeof createBaseSession>[0]) {
  return createBaseSession<AgentEvent>(input);
}

test("verifyTask uses stream structured output", async () => {
  const session = createSession({ systemPrompt: "Test", input: "hello" });
  const task = parseTask({
    id: createId("task"),
    title: "No tool task",
    instruction: "hello",
    acceptanceCriteria: createDefaultCriteria("Respond"),
    toolNames: [],
    skillIds: [],
    status: "pending",
    attempts: 0,
  });

  const result = await verifyTask({
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
  });

  expect(result.passed).toBe(true);
});
