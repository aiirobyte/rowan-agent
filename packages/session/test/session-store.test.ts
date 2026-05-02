import { expect, test } from "bun:test";
import {
  InMemorySessionStore,
  SESSION_SCHEMA_VERSION,
  appendUserTurn,
  createMessage,
  createSession,
  latestUserInput,
  toPersistedSession,
} from "../src";

test("SessionStore persists versioned conversation messages and metadata", async () => {
  const store = new InMemorySessionStore();
  const session = createSession({
    systemPrompt: "Test system",
    input: "hello",
    task: "Say hello",
    goal: "A greeting is returned.",
    title: "Greeting",
  });
  appendUserTurn(session, "second turn");
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
  expect(persisted.input).toBe("hello");
  expect(persisted).not.toHaveProperty("userInput");
  expect(persisted.task).toBe("Say hello");
  expect(persisted.goal).toBe("A greeting is returned.");
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
  expect(loaded?.input).toBe("hello");
  expect(loaded?.task).toBe("Say hello");
  expect(loaded?.goal).toBe("A greeting is returned.");
  expect(loaded ? latestUserInput(loaded) : undefined).toBe("second turn");
  expect(loaded?.log).toEqual([]);
  expect(loaded?.messages.map((message) => message.content)).toContain(
    "{\"needsTask\":false,\"message\":\"internal\"}",
  );

  await expect(store.create(session)).rejects.toThrow("Session already exists");
  expect(await store.delete(session.id)).toBe(true);
  expect(await store.delete(session.id)).toBe(false);
  expect(await store.load(session.id)).toBeUndefined();
});
