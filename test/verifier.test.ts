import { expect, test } from "bun:test";
import { verifyTask } from "../src/verifier";
import { fakeStream } from "../src/stream";
import { createSession } from "../src/session";
import { parseTask, createDefaultCriteria } from "../src/task";
import { createId } from "../src/types";

test("verifyTask uses stream structured output", async () => {
  const session = createSession({ systemPrompt: "Test", userInput: "hello" });
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
    model: { provider: "fake", name: "fake-v0" },
    stream: fakeStream,
    session,
    task,
    toolResults: [],
  });

  expect(result.passed).toBe(true);
});
