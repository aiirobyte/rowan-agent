import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  kind: "run_state_changed",
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
  expect(record.eventType).toBe("run_state_changed");
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

test("append mode repairs a partial JSONL tail and ignores duplicate complete events", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-log-"));
  const path = join(root, "run.jsonl");
  await writeFile(path, `${JSON.stringify({ eventId: "evt_existing", eventType: "run_state_changed" })}\n{"partial":`, "utf8");
  const logger = pinoDurableRunEventLogger(path, { mode: "append" });
  logger(event({ id: "evt_existing" }));
  logger(event({ id: "evt_new" }));
  await logger.flush();

  const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => line.eventId)).toEqual(["evt_existing", "evt_new"]);
});

test("separate append loggers write complete non-interleaved JSONL records", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-log-"));
  const path = join(root, "run.jsonl");
  const first = pinoDurableRunEventLogger(path, { mode: "append" });
  const second = pinoDurableRunEventLogger(path, { mode: "append" });
  first(event({ id: "evt_first" }));
  second(event({ id: "evt_second" }));
  await Promise.all([first.flush(), second.flush()]);

  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => (JSON.parse(line) as Record<string, unknown>).eventId).sort()).toEqual(["evt_first", "evt_second"]);
});

test("console durable event logger writes Pino-shaped records", async () => {
  let output = "";
  const logger = consoleDurableRunEventLogger({ stream: { write: (chunk) => { output += chunk; } } });
  logger(event());
  await logger.flush();
  expect(JSON.parse(output)).toMatchObject({ eventType: "run_state_changed", runId: "run_1" });
});

test("redactSecrets handles nested credentials", () => {
  expect(redactSecrets({ token: "secret", nested: { apiKey: "secret" } })).toEqual({
    token: "[REDACTED]",
    nested: { apiKey: "[REDACTED]" },
  });
});
