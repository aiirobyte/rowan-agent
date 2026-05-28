import { expect, test } from "bun:test";
import {
  InMemorySessionStore,
  SESSION_SCHEMA_VERSION,
  appendUserTurn,
  createMessage,
  createSession,
  latestUserInput,
  sessionFromPersisted,
  summarizePersistedSession,
  toPersistedSession,
} from "../../../src/harness/session";

test("SessionStore persists versioned conversation messages and metadata", async () => {
  const store = new InMemorySessionStore();
  const session = createSession({
    systemPrompt: "Test system",
    input: "hello",
    title: "Greeting",
  });
  appendUserTurn(session, "second turn");
  session.messages.push(
    createMessage("assistant", "{\"route\":\"direct\",\"message\":\"internal\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
  );

  const created = await store.create(session);
  const persisted = toPersistedSession(created);

  expect(persisted.version).toBe(SESSION_SCHEMA_VERSION);
  expect(persisted.id).toBe(session.id);
  expect(persisted.input).toBe("hello");
  expect(persisted).not.toHaveProperty("userInput");
  expect(persisted.title).toBe("Greeting");
  expect(persisted.messages.some((message) => message.content.includes("\"route\":\"direct\""))).toBe(false);

  const list = await store.list();
  expect(list).toEqual([
    expect.objectContaining({
      id: session.id,
      title: "Greeting",
      messageCount: persisted.messages.length,
      latestMessage: "second turn",
    }),
  ]);

  const loaded = await store.load(session.id);
  expect(loaded?.id).toBe(session.id);
  expect(loaded?.input).toBe("hello");
  expect(loaded ? latestUserInput(loaded) : undefined).toBe("second turn");
  expect(loaded?.log).toEqual([]);
  expect(loaded?.messages.map((message) => message.content)).not.toContain(
    "{\"route\":\"direct\",\"message\":\"internal\"}",
  );

  await expect(store.create(session)).rejects.toThrow("Session already exists");
  expect(await store.delete(session.id)).toBe(true);
  expect(await store.delete(session.id)).toBe(false);
  expect(await store.load(session.id)).toBeUndefined();
});

test("session persistence rejects old userInput schema", () => {
  const legacy = {
    version: "0.3.1",
    id: "ses_legacy",
    systemPrompt: "Test system",
    userInput: "hello from legacy",
    messages: [
      createMessage("system", "Test system"),
      createMessage("user", "hello from legacy"),
      createMessage("assistant", "legacy answer"),
    ],
    skills: [],
    createdAt: "2026-05-02T120000-00+08:00",
    updatedAt: "2026-05-02T120001-00+08:00",
    title: "Legacy session",
  };

  expect(() => sessionFromPersisted(legacy)).toThrow();
  expect(() => summarizePersistedSession(legacy)).toThrow();
});

test("latestUserInput ignores recorded phase prompts", () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "human request",
  });

  session.messages.push(
    createMessage("user", "Phase: verify\n\nTask output: {}", {
      kind: "phase_prompt",
      phase: "verify",
    }),
  );

  expect(latestUserInput(session)).toBe("human request");
});
