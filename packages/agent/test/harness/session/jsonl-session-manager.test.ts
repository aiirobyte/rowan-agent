import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMessage, type ExecutionTurn } from "@rowan-agent/agent";
import { LocalJsonlSessionManager } from "../../../src/harness/session";

function executionTurn(sessionId: string): ExecutionTurn {
  return {
    id: "step_execute",
    sessionId,
    phase: "execute",
    requestedAtMs: 1,
    completedAtMs: 2,
    model: { provider: "test", name: "model" },
    scope: "execution",
    entries: [{ kind: "assistant_text", text: "ran a tool" }],
  };
}

test("LocalJsonlSessionManager writes append-only JSONL sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-jsonl-session-"));
  const sessionsDir = join(root, "sessions");

  try {
    const manager = await LocalJsonlSessionManager.create(sessionsDir, {
      systemPrompt: "Test system",
      input: "hello",
      title: "Local session",
    });
    await manager.appendMessage(createMessage("user", "hello", { scope: "conversation" }));
    await manager.appendExecutionTurn(executionTurn(manager.getSessionId()));
    await manager.appendOutcome({ id: "out_test", passed: true, message: "ok" });

    const files = await readdir(sessionsDir);
    expect(files).toEqual([`${manager.getSessionId()}.jsonl`]);

    const lines = (await readFile(manager.getSessionFile() ?? "", "utf8")).trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0] ?? "{}")).toEqual(
      expect.objectContaining({ type: "header", id: manager.getSessionId(), title: "Local session" }),
    );
    expect(JSON.parse(lines[1] ?? "{}")).toEqual(expect.objectContaining({ type: "message" }));
    expect(JSON.parse(lines[2] ?? "{}")).toEqual(expect.objectContaining({ type: "execution_turn" }));
    expect(JSON.parse(lines[3] ?? "{}")).toEqual(expect.objectContaining({ type: "outcome" }));

    const opened = await LocalJsonlSessionManager.open(sessionsDir, manager.getSessionId());
    expect((await opened?.buildAgentContext())?.messages.map((message) => message.content)).toEqual(["hello"]);
    expect(await opened?.loadExecutionTurns()).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LocalJsonlSessionManager lists and deletes only JSONL sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-jsonl-session-list-"));
  const sessionsDir = join(root, "sessions");

  try {
    await mkdir(sessionsDir, { recursive: true });
    const first = await LocalJsonlSessionManager.create(sessionsDir, {
      systemPrompt: "Test system",
      input: "first",
      title: "First",
    });
    await first.appendMessage(createMessage("user", "first", { scope: "conversation" }));
    await Bun.sleep(20);

    const second = await LocalJsonlSessionManager.create(sessionsDir, {
      systemPrompt: "Test system",
      input: "second",
      title: "Second",
    });
    await second.appendMessage(createMessage("user", "second", { scope: "conversation" }));

    const sessions = await LocalJsonlSessionManager.list(sessionsDir);
    expect(sessions.map((session) => session.id)).toEqual([second.getSessionId(), first.getSessionId()]);
    expect(await LocalJsonlSessionManager.open(sessionsDir, "../outside")).toBeUndefined();
    expect(await LocalJsonlSessionManager.delete(sessionsDir, first.getSessionId())).toBe(true);
    expect(await LocalJsonlSessionManager.delete(sessionsDir, first.getSessionId())).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
