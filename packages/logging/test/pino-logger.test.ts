import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import type { AgentEvent } from "@rowan-agent/agent";
import { consoleAgentEventLogger, pinoAgentEventLogger, redactSecrets } from "../src";

function parseLogLines(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("pinoAgentEventLogger writes summary Pino JSONL records at info by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-"));
  const logPath = join(root, "run.jsonl");
  const logger = pinoAgentEventLogger(logPath);
  const event: AgentEvent = {
    type: "phase_start",
    phase: "chat",
    ts: "2026-05-03T141659-32+08:00",
  };

  logger(event);
  await logger.flush?.();

  expect(logger.path()).toBe(logPath);
  const [record] = parseLogLines(await readFile(logPath, "utf8"));
  expect(record).toMatchObject({
    eventType: "phase_start",
    eventTs: "2026-05-03T141659-32+08:00",
    phase: "chat",
  });
  expect(record?.level).toBe(30);
  expect(record?.msg).toBeUndefined();
  expect(record?.pid).toBeUndefined();
  expect(record?.hostname).toBeUndefined();
  expect(record?.event).toBeUndefined();
});

test("pinoAgentEventLogger includes redacted event payloads at debug level", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-debug-"));
  const logPath = join(root, "run.jsonl");
  const logger = pinoAgentEventLogger(logPath, { level: "debug" });
  const event: AgentEvent = {
    type: "tool_execution_start",
    toolCallId: "call_1",
    toolName: "bash",
    args: { command: "OPENAI_API_KEY=secret-token bun test" },
    ts: "2026-05-03T141659-32+08:00",
  };

  logger(event);
  await logger.flush?.();

  const [record] = parseLogLines(await readFile(logPath, "utf8"));
  expect(record).toMatchObject({
    eventType: "tool_execution_start",
    event: {
      type: "tool_execution_start",
      toolName: "bash",
      ts: "2026-05-03T141659-32+08:00",
    },
  });
  expect(JSON.stringify(record)).not.toContain("secret-token");
  expect(JSON.stringify(record)).toContain("OPENAI_API_KEY=[REDACTED]");
});

test("pinoAgentEventLogger resolves dynamic paths from the first session event", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-dynamic-"));
  const logger = pinoAgentEventLogger((event) =>
    event.type === "turn_start" && "parentSessionId" in event ? join(root, `${event.sessionId}.jsonl`) : undefined
  );

  logger({
    type: "turn_start",
    content: [],
    sessionId: "ses_12345678",
    parentSessionId: "ses_parent",
    prompt: "hello",
    ts: "2026-05-03T141659-32+08:00",
  });
  await logger.flush?.();

  expect(logger.path()).toBe(join(root, "ses_12345678.jsonl"));
  const [record] = parseLogLines(await readFile(logger.path() ?? "", "utf8"));
  expect(record).toMatchObject({
    eventType: "turn_start",
    sessionId: "ses_parent",
  });
  expect(record?.msg).toBeUndefined();
  expect(record?.event).toBeUndefined();
});

test("pinoAgentEventLogger filters warning and error levels", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-warn-"));
  const logPath = join(root, "run.jsonl");
  const logger = pinoAgentEventLogger(logPath, { level: "warn" });

  logger({
    type: "phase_start",
    phase: "chat",
    ts: "2026-05-03T141659-32+08:00",
  });
  logger({
    type: "tool_execution_end",
    toolCallId: "call_1",
    toolName: "bash",
    result: { toolCallId: "call_1", toolName: "bash", ok: false, content: null, error: "Tool failed." },
    isError: true,
    ts: "2026-05-03T141700-32+08:00",
  });
  await logger.flush?.();

  const records = parseLogLines(await readFile(logPath, "utf8"));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    level: 40,
    eventType: "tool_execution_end",
    eventTs: "2026-05-03T141700-32+08:00",
  });
  expect(records[0]?.msg).toBeUndefined();
});

test("pinoAgentEventLogger silent level does not create a log file", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-silent-"));
  const logPath = join(root, "run.jsonl");
  const logger = pinoAgentEventLogger(logPath, { level: "silent" });

  logger({
    type: "phase_start",
    phase: "chat",
    ts: "2026-05-03T141659-32+08:00",
  });
  await logger.flush?.();

  expect(logger.path()).toBeUndefined();
  expect(existsSync(logPath)).toBe(false);
});

test("consoleAgentEventLogger writes Pino-shaped JSONL records to the configured stream", async () => {
  const chunks: string[] = [];
  const logger = consoleAgentEventLogger({
    stream: {
      write: (chunk) => {
        chunks.push(chunk);
      },
    },
  });

  logger({
    type: "phase_start",
    phase: "chat",
    ts: "2026-05-03T141659-32+08:00",
  });
  await logger.flush?.();

  const [record] = parseLogLines(chunks.join(""));
  expect(record).toMatchObject({
    level: 30,
    eventType: "phase_start",
    eventTs: "2026-05-03T141659-32+08:00",
    phase: "chat",
  });
  expect(record?.time).toEqual(expect.any(Number));
  expect(record?.msg).toBeUndefined();
  expect(record?.event).toBeUndefined();
});

test("consoleAgentEventLogger debug output includes redacted event payloads", async () => {
  const chunks: string[] = [];
  const logger = consoleAgentEventLogger({
    level: "debug",
    stream: {
      write: (chunk) => {
        chunks.push(chunk);
      },
    },
  });

  logger({
    type: "tool_execution_start",
    toolCallId: "call_1",
    toolName: "bash",
    args: { command: "OPENAI_API_KEY=secret-token bun test" },
    ts: "2026-05-03T141659-32+08:00",
  });
  await logger.flush?.();

  const [record] = parseLogLines(chunks.join(""));
  expect(record).toMatchObject({
    level: 30,
    eventType: "tool_execution_start",
    event: {
      type: "tool_execution_start",
      toolName: "bash",
      ts: "2026-05-03T141659-32+08:00",
    },
  });
  expect(JSON.stringify(record)).not.toContain("secret-token");
  expect(JSON.stringify(record)).toContain("OPENAI_API_KEY=[REDACTED]");
});

test("redactSecrets redacts API keys in nested event payloads", () => {
  const redacted = redactSecrets({
    event: {
      command: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz run",
      nested: { value: "ANTHROPIC_API_KEY=secret-token" },
      raw: "sk-rawrawrawrawraw",
    },
  });

  expect(JSON.stringify(redacted)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  expect(JSON.stringify(redacted)).not.toContain("sk-rawrawrawrawraw");
  expect(JSON.stringify(redacted)).not.toContain("secret-token");
  expect(JSON.stringify(redacted)).toContain("OPENAI_API_KEY=[REDACTED]");
  expect(JSON.stringify(redacted)).toContain("ANTHROPIC_API_KEY=[REDACTED]");
});
