import { expect, test } from "bun:test";
import {
  InMemorySessionStore,
  SESSION_SCHEMA_VERSION,
  createMessage,
  createSession,
  toPersistedSession,
} from "../src";

test("SessionStore persists versioned conversation messages and metadata", async () => {
  const store = new InMemorySessionStore();
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "hello",
    title: "Greeting",
  });
  session.messages.push(
    createMessage("assistant", "{\"needsTask\":false,\"message\":\"internal\"}", {
      kind: "routing_decision",
      phase: "route",
    }),
  );

  const created = await store.create(session);
  const persisted = toPersistedSession(created);

  expect(persisted.version).toBe(SESSION_SCHEMA_VERSION);
  expect(persisted.id).toBe(session.id);
  expect(persisted.title).toBe("Greeting");
  expect(persisted.messages.some((message) => message.content.includes("needsTask"))).toBe(true);

  const list = await store.list();
  expect(list).toEqual([
    expect.objectContaining({
      id: session.id,
      title: "Greeting",
      messageCount: persisted.messages.length,
      latestMessage: "{\"needsTask\":false,\"message\":\"internal\"}",
    }),
  ]);

  const loaded = await store.load(session.id);
  expect(loaded?.id).toBe(session.id);
  expect(loaded?.log).toEqual([]);
  expect(loaded?.messages.map((message) => message.content)).toContain(
    "{\"needsTask\":false,\"message\":\"internal\"}",
  );

  await expect(store.create(session)).rejects.toThrow("Session already exists");
  expect(await store.delete(session.id)).toBe(true);
  expect(await store.delete(session.id)).toBe(false);
  expect(await store.load(session.id)).toBeUndefined();
});
