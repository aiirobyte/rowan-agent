import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import type { AgentEvent } from "@rowan-agent/agent";
import { pinoAgentEventLogger, redactSecrets } from "../src";

function parseLogLines(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("pinoAgentEventLogger writes AgentEvent payloads as Pino JSONL records", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-"));
  const logPath = join(root, "run.jsonl");
  const logger = pinoAgentEventLogger(logPath);
  const event: AgentEvent = {
    type: "model_requested",
    phase: "route",
    model: { provider: "test", name: "model" },
    usage: { inputMessages: 3 },
    ts: "2026-05-03T141659-32+08:00",
  };

  logger(event);
  await logger.flush?.();

  expect(logger.path()).toBe(logPath);
  const [record] = parseLogLines(await readFile(logPath, "utf8"));
  expect(record).toMatchObject({
    msg: "agent event",
    eventType: "model_requested",
    eventTs: "2026-05-03T141659-32+08:00",
    phase: "route",
    event,
  });
  expect(record?.level).toBe(30);
});

test("pinoAgentEventLogger resolves dynamic paths from the first session event", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-logging-dynamic-"));
  const logger = pinoAgentEventLogger((event) =>
    event.type === "session_created" ? join(root, `${event.session.id}.jsonl`) : undefined
  );

  logger({
    type: "session_created",
    session: {
      version: "0.3.3",
      id: "ses_12345678",
      systemPrompt: "Test system",
      input: "hello",
      skills: [],
    },
    ts: "2026-05-03T141659-32+08:00",
  });
  await logger.flush?.();

  expect(logger.path()).toBe(join(root, "ses_12345678.jsonl"));
  const [record] = parseLogLines(await readFile(logger.path() ?? "", "utf8"));
  expect(record).toMatchObject({
    eventType: "session_created",
    sessionId: "ses_12345678",
  });
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
