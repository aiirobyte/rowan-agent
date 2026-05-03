import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMessage, createSession } from "@rowan-agent/session";
import { LocalJsonAgentStore } from "../src/session-store";

test("LocalJsonAgentStore reads and writes sessions and steps inside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-local-session-"));
  const store = new LocalJsonAgentStore(join(root, "sessions"));
  const session = createSession({
    systemPrompt: "Test system",
    input: "hello",
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
      input?: string;
      messages?: Array<{ content: string }>;
      steps?: unknown[];
    };

    expect(raw.version).toBe("0.3.3");
    expect(raw.id).toBe(session.id);
    expect(raw.input).toBe("hello");
    expect(raw.messages?.some((message) => message.content.includes("Planning"))).toBe(false);
    expect(raw.steps).toEqual([]);

    await store.appendStep(session.id, {
      id: "step_test",
      sessionId: session.id,
      phase: "plan",
      requestedAtMs: 1,
      completedAtMs: 2,
      model: { provider: "test", name: "model" },
      scope: "execution",
      entries: [{ kind: "assistant_text", text: "Planning." }],
    });
    expect(await store.loadSteps(session.id)).toHaveLength(1);

    const loaded = await store.load(session.id);
    expect(loaded?.id).toBe(session.id);
    expect(loaded?.log).toEqual([]);

    const list = await store.list();
    expect(list[0]).toEqual(
      expect.objectContaining({
        id: session.id,
        title: "Local session",
        latestMessage: "hello",
      }),
    );

    expect(await store.delete(session.id)).toBe(true);
    expect(await store.load(session.id)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LocalJsonAgentStore rejects old session schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-local-session-old-schema-"));
  const store = new LocalJsonAgentStore(join(root, "sessions"));

  try {
    await mkdir(join(root, "sessions"), { recursive: true });
    await writeFile(
      join(root, "sessions", "ses_legacy.json"),
      `${JSON.stringify({
        version: "0.3.2",
        id: "ses_legacy",
        systemPrompt: "Test system",
        input: "hello",
        messages: [],
        skills: [],
        createdAt: "2026-05-03T120000-00+08:00",
        updatedAt: "2026-05-03T120001-00+08:00",
      })}\n`,
      "utf8",
    );

    await expect(store.load("ses_legacy")).rejects.toThrow("Unsupported session schema version");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
