import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMessage, createSession } from "@rowan-agent/session";
import { LocalJsonSessionStore } from "../src/session-store";

test("LocalJsonSessionStore reads and writes sessions inside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-local-session-"));
  const store = new LocalJsonSessionStore(join(root, "sessions"));
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "hello",
    title: "Local session",
  });
  session.messages.push(
    createMessage("assistant", "{\"message\":\"Planning.\",\"task\":{}}", {
      kind: "model_message",
      phase: "plan",
    }),
  );

  try {
    await mkdir(join(root, "sessions"), { recursive: true });
    await expect(store.load("../outside")).rejects.toThrow("Invalid session id");

    await store.save(session);
    const filePath = join(root, "sessions", `${session.id}.json`);
    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      version?: string;
      id?: string;
      messages?: Array<{ content: string }>;
    };

    expect(raw.version).toBe("0.3.1");
    expect(raw.id).toBe(session.id);
    expect(raw.messages?.some((message) => message.content.includes("Planning"))).toBe(true);

    const loaded = await store.load(session.id);
    expect(loaded?.id).toBe(session.id);
    expect(loaded?.log).toEqual([]);

    const list = await store.list();
    expect(list[0]).toEqual(
      expect.objectContaining({
        id: session.id,
        title: "Local session",
        latestMessage: "{\"message\":\"Planning.\",\"task\":{}}",
      }),
    );

    expect(await store.delete(session.id)).toBe(true);
    expect(await store.load(session.id)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
