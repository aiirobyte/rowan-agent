import { expect, test } from "bun:test";
import {
  InMemorySessionManager,
  createMessage,
  type ExecutionTurn,
} from "../../../src/harness/session";

function executionTurn(sessionId: string): ExecutionTurn {
  return {
    id: "step_route",
    sessionId,
    phase: "chat",
    requestedAtMs: 1,
    completedAtMs: 2,
    model: { provider: "test", name: "model" },
  };
}

test("InMemorySessionManager appends entries and rebuilds conversation context", async () => {
  const manager = InMemorySessionManager.create({
    systemPrompt: "Test system",
    input: "hello",
    skills: [{ name: "skill", description: "Use the skill.", filePath: "SKILL.md", baseDir: ".", content: "", disableModelInvocation: false }],
  });

  await manager.appendMessage(createMessage("user", "hello"));
  await manager.appendMessage(createMessage("assistant", "visible answer"));
  await manager.appendMessage(createMessage("assistant", "hidden phase", { kind: "model_message" }));
  await manager.appendExecutionTurn(executionTurn(manager.getSessionId()));

  const context = await manager.buildAgentContext();

  expect(context.systemPrompt).toBe("Test system");
  expect(context.skills.map((skill) => skill.name)).toEqual(["skill"]);
  expect(context.messages.map((message) => message.content)).toEqual(["hello", "visible answer", "hidden phase"]);
  expect((await manager.listEntries()).map((entry) => entry.type)).toEqual([
    "message",
    "message",
    "message",
    "execution_turn",
  ]);
});

test("InMemorySessionManager branches by changing the active leaf without deleting history", async () => {
  const manager = InMemorySessionManager.create({
    systemPrompt: "Test system",
    input: "root",
  });
  const rootMessageId = await manager.appendMessage(createMessage("user", "root"));
  await manager.appendMessage(createMessage("assistant", "branch A"));

  await manager.branch(rootMessageId);
  await manager.appendMessage(createMessage("assistant", "branch B"));

  const context = await manager.buildAgentContext();
  const entries = await manager.listEntries();

  expect(context.messages.map((message) => message.content)).toEqual(["root", "branch B"]);
  expect(entries.map((entry) => entry.type)).toEqual(["message", "message", "message"]);
  expect(entries.some((entry) => entry.type === "message" && entry.message.content === "branch A")).toBe(true);
});
