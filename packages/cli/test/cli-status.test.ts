import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SqliteRuntimeStateStore,
  createMessage,
} from "@rowan-agent/agent";

test("CLI list exposes the persisted question for a suspended Run", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-status-"));
  const rowanDir = join(workspace, ".rowan");
  await mkdir(rowanDir, { recursive: true });
  const store = new SqliteRuntimeStateStore(join(rowanDir, "runtime.sqlite"));

  try {
    const agent = await store.createAgent({ sessionId: "session-status" });
    const enqueued = await store.enqueueAgentInput({
      agentId: agent.id,
      input: createMessage("user", "start workflow"),
    });
    await store.leaseRun({
      runId: enqueued.run.id,
      workerId: "status-test",
      leaseDurationMs: 30_000,
    });
    await store.suspendRun({
      runId: enqueued.run.id,
      reason: "Agent requested input.",
      inputRequest: {
        phase: "plan",
        prompt: "Which environment should I target?",
        requestedAt: "2026-01-01T00:00:00.000+00:00",
      },
    });
    store.close();

    const child = Bun.spawn(["bun", "run", "rowan", "list"], {
      cwd: process.cwd(),
      env: { ...process.env, ROWAN_WORKSPACE: workspace, ROWAN_LOG_LEVEL: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("Error");
    expect(JSON.parse(stdout)).toContainEqual(expect.objectContaining({
      id: agent.id,
      run: {
        id: enqueued.run.id,
        state: "suspended",
        inputRequest: {
          phase: "plan",
          prompt: "Which environment should I target?",
          requestedAt: "2026-01-01T00:00:00.000+00:00",
        },
      },
    }));
  } finally {
    try {
      store.close();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
});
