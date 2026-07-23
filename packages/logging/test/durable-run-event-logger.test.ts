import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DurableRunEvent } from "@rowan-agent/agent";
import {
  consoleDurableRunEventLogger,
  pinoDurableRunEventLogger,
  redactSecrets,
} from "../src";

const event = (overrides: Record<string, unknown> = {}): DurableRunEvent => ({
  id: "evt_1",
  schemaVersion: 1,
  cursor: "evt:1",
  durability: "durable",
  agentId: "agt_1",
  runId: "run_1",
  runRevision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "run_transitioned",
  from: "queued",
  to: "running",
  ...overrides,
} as DurableRunEvent);

test("pino durable event logger writes summary records", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-log-"));
  const path = join(root, "run.jsonl");
  const logger = pinoDurableRunEventLogger(path);
  logger(event());
  await logger.flush();
  const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  expect(record.eventType).toBe("run_transitioned");
  expect(record.agentId).toBe("agt_1");
  expect(record.runId).toBe("run_1");
  expect(record.event).toBeUndefined();
});

test("debug durable event logs include redacted event payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-log-"));
  const path = join(root, "run.jsonl");
  const logger = pinoDurableRunEventLogger(path, { level: "debug" });
  logger(event({ metadata: { apiKey: "secret-value" } }));
  await logger.flush();
  const text = await readFile(path, "utf8");
  expect(text).toContain('"event"');
  expect(text).not.toContain("secret-value");
  expect(text).toContain("[REDACTED]");
});

test("console durable event logger writes Pino-shaped records", async () => {
  let output = "";
  const logger = consoleDurableRunEventLogger({ stream: { write: (chunk) => { output += chunk; } } });
  logger(event());
  await logger.flush();
  expect(JSON.parse(output)).toMatchObject({ eventType: "run_transitioned", runId: "run_1" });
});

test("redactSecrets handles nested credentials", () => {
  expect(redactSecrets({ token: "secret", nested: { apiKey: "secret" } })).toEqual({
    token: "[REDACTED]",
    nested: { apiKey: "[REDACTED]" },
  });
});
