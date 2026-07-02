import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEvent } from "@rowan-agent/agent";
import { LocalJsonlSessionManager } from "@rowan-agent/agent";
import { createMessage } from "@rowan-agent/agent";

type AgentEventLogRecord = Record<string, unknown> & {
  event?: AgentEvent;
  eventType?: AgentEvent["type"];
  eventTs?: string;
  phase?: string;
  sessionId?: string;
};

type LoggedEventSummary = {
  type: string;
  ts?: string;
  phase?: string;
  sessionId?: string;
  event?: AgentEvent;
};

type LogSummary = {
  filePath: string;
  eventTypes: Record<string, number>;
  sessionIds: string[];
};

function modelFlags(server: { url: URL }): string[] {
  return ["--base-url", server.url.toString().replace(/\/$/, ""), "--api-key", "test-key", "--model", "test-model"];
}

async function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
  stdin?: string,
) {
  const proc = Bun.spawn(["bun", "run", "rowan", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ROWAN_LOG_LEVEL: "",
      ...env,
    },
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (stdin !== undefined && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

function openAIResponse(content: unknown): Response {
  const contentText = content && typeof content === "object" && "message" in content && typeof content.message === "string"
    ? content.message
    : JSON.stringify(content);
  const toolCalls = content && typeof content === "object" && "toolCalls" in content && Array.isArray(content.toolCalls)
    ? content.toolCalls.map((toolCall: { id?: string; name?: string; args?: unknown }, index: number) => ({
        id: toolCall.id ?? `call_${index}`,
        type: "function",
        function: {
          name: toolCall.name ?? "",
          arguments: JSON.stringify(toolCall.args ?? {}),
        },
      }))
    : undefined;

  return Response.json({
    choices: [
      {
        message: {
          content: contentText,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
      },
    ],
  });
}

function canSkipLocalBindError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? error.code : undefined;
  return code === "EPERM" || code === "EADDRINUSE";
}

function sessionIdFrom(stderr: string): string {
  const match = stderr.match(/Session id: (ses_[A-Za-z0-9_-]+)/);
  if (!match?.[1]) {
    throw new Error(`Missing session id in stderr: ${stderr}`);
  }
  return match[1];
}

function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}

async function readLogRecords(path: string): Promise<AgentEventLogRecord[]> {
  const content = await Bun.file(path).text();
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AgentEventLogRecord);
}

async function readLogEvents(path: string): Promise<LoggedEventSummary[]> {
  return (await readLogRecords(path)).map((record) => {
    const type = record.event?.type ?? record.eventType;
    if (!type) {
      throw new Error(`Missing event type in log record: ${JSON.stringify(record)}`);
    }
    return {
      type,
      ts: record.event?.ts ?? record.eventTs,
      phase: record.event && "phase" in record.event ? record.event.phase : record.phase,
      sessionId: record.event ? eventSessionId(record.event) : record.sessionId,
      event: record.event,
    };
  });
}

function eventSessionId(event: AgentEvent): string | undefined {
  if (event.type === "agent_start" || event.type === "agent_end") {
    return event.sessionId;
  }
  return undefined;
}

async function summarizeLogFile(filePath: string): Promise<LogSummary> {
  const eventTypes: Record<string, number> = {};
  const sessionIds = new Set<string>();
  for (const event of await readLogEvents(filePath)) {
    eventTypes[event.type] = (eventTypes[event.type] ?? 0) + 1;
    if (event.sessionId) {
      sessionIds.add(event.sessionId);
    }
    if (event.event && (event.event.type === "agent_start" || event.event.type === "agent_end")) {
      sessionIds.add(event.event.sessionId);
    }
  }
  return { filePath, eventTypes, sessionIds: [...sessionIds] };
}

test("CLI requires API key when no config file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-no-apikey-"));
  try {
    const result = await runCli(["--model", "test-model", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("API key is required");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI requires model when no config file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-no-model-"));
  try {
    const result = await runCli(["--api-key", "test-key", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Model is required");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI rejects removed fake runtime flag", async () => {
  const result = await runCli(["--fake", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown option: --fake");
});

test("CLI rejects removed OpenAI-compatible flag", async () => {
  const result = await runCli(["--openai-compatible", "--model", "test-model", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown option: --openai-compatible");
});

test("CLI rejects removed trace flag", async () => {
  const result = await runCli(["--trace", "runs/custom.jsonl", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown option: --trace");
});

test("CLI rejects invalid OpenAI-compatible timeout", async () => {
  const result = await runCli(["--timeout-ms", "0", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("--timeout-ms must be a positive integer.");
});

test("CLI rejects invalid log level", async () => {
  const result = await runCli(["--log-level", "verbose", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("--log-level must be one of: debug, info, warn, error, silent.");
});

test("CLI loads file phases from workspace .rowan directory", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-file-phases-"));

  try {
    const phaseDir = join(workspace, ".rowan", "phases", "default");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: CLI Default
description: Runs from the CLI-loaded phase file.
---

CLI file phase content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "CLI file phase ran", route: "stop" };
      }
    `);

    const result = await runCli(["--model", "test-model", "--api-key", "test-key", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CLI file phase ran");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI session continuation loads current workspace skills from file", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-session-skills-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  const requests: unknown[] = [];

  try {
    const skillDir = join(workspace, ".rowan", "skills", "example");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---
name: Example
description: Loaded from file during session continuation.
---

Use the example skill.
`);

    const session = await LocalJsonlSessionManager.create(join(workspace, ".rowan", "sessions"), {
      systemPrompt: "Test system",
      input: "old turn",
      skills: [],
    });
    await session.appendMessage(createMessage("user", "old turn"));

    try {
      server = Bun.serve({
        port: 0,
        async fetch(request) {
          requests.push(await request.json());
          return openAIResponse("Done.");
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli([...modelFlags(server), "--session", session.getSessionId(), "new turn"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(requests)).toContain("Loaded from file during session continuation.");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI interactive prompts hot reload workspace skills", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-skill-hot-reload-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  const requests: unknown[] = [];

  try {
    const skillDir = join(workspace, ".rowan", "skills", "example");
    const skillPath = join(skillDir, "SKILL.md");
    await mkdir(skillDir, { recursive: true });
    await writeFile(skillPath, `---
name: Example
description: First skill description.
---

First skill version.
`);

    try {
      server = Bun.serve({
        port: 0,
        async fetch(request) {
          requests.push(await request.json());
          if (requests.length === 1) {
            await writeFile(skillPath, `---
name: Example
description: Second skill description.
---

Second skill version.
`);
            return openAIResponse("First turn.");
          }
          return openAIResponse("Second turn.");
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli([...modelFlags(server)], {
      ROWAN_WORKSPACE: workspace,
    }, "first\nsecond\n");

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(requests[0])).toContain("First skill description.");
    expect(JSON.stringify(requests[1])).toContain("Second skill description.");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI config shows missing config file and default configuration without requiring model credentials", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-config-missing-"));

  try {
    const result = await runCli(["config"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("API key is required");
    expect(result.stderr).not.toContain("Model is required");
    const config = JSON.parse(result.stdout) as {
      command?: string;
      workspace?: { cwd?: string; rowanDir?: string };
      configFile?: { loaded?: boolean; path?: string | null };
      model?: { flag?: string | null; apiKeyConfigured?: boolean; apiKey?: string | null; baseUrl?: string | null; timeoutMs?: number | null };
      logging?: Record<string, unknown>;
    };

    expect(config.command).toBe("config");
    expect(config.workspace?.cwd).toBe(workspace);
    expect(config.workspace?.rowanDir).toBe(join(workspace, ".rowan"));
    expect(config.configFile).toEqual({ loaded: false, path: null });
    expect(config.model).toMatchObject({
      flag: null,
      apiKeyConfigured: false,
      apiKey: null,
      baseUrl: null,
      timeoutMs: null,
    });
    expect(config.logging).toEqual({
      automatic: true,
      path: null,
      level: "info",
      levelSource: "default",
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI config reports resolved flags without exposing API key material", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-config-flags-"));

  try {
    const result = await runCli(
      [
        "--base-url",
        "https://api.example/v1/",
        "--api-key",
        "super-secret-key",
        "--model",
        "test-model",
        "--timeout-ms",
        "1234",
        "--session",
        "ses_example",
        "--log",
        "runs/custom.jsonl",
        "--log-level",
        "Debug",
        "--skill",
        "example",
        "config",
      ],
      {
        ROWAN_WORKSPACE: workspace,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("super-secret-key");
    const config = JSON.parse(result.stdout) as {
      configFile?: Record<string, unknown>;
      model?: Record<string, unknown>;
      session?: Record<string, unknown>;
      logging?: Record<string, unknown>;
      skills?: Array<Record<string, unknown>>;
      tools?: string[];
    };

    expect(config.configFile).toEqual({ loaded: false, path: null });
    expect(config.model).toMatchObject({
      flag: "test-model",
      apiKeyConfigured: true,
      apiKey: "super********key",
      baseUrl: "https://api.example/v1",
      timeoutMs: 1234,
    });
    expect(config.session).toEqual({ id: "ses_example", source: "flag" });
    expect(config.logging).toEqual({
      automatic: false,
      path: ".rowan/runs/custom.jsonl",
      level: "debug",
      levelSource: "flag",
    });
    expect(config.skills).toEqual([
      {
        idOrPath: "example",
      },
    ]);
    expect(config.tools).toEqual(["read", "write", "edit", "bash"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI config rejects trailing prompt text", async () => {
  const result = await runCli(["config", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("config does not accept a prompt.");
});

test("CLI list returns saved sessions in the current workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-list-"));
  const older = await LocalJsonlSessionManager.create(join(workspace, ".rowan", "sessions"), {
    systemPrompt: "Test system",
    input: "old hello",
    title: "Older session",
  });
  await older.appendMessage(createMessage("user", "old hello"));
  await older.appendMessage(createMessage("assistant", "Older answer"));
  await Bun.sleep(20);
  const newer = await LocalJsonlSessionManager.create(join(workspace, ".rowan", "sessions"), {
    systemPrompt: "Test system",
    input: "new hello",
    title: "Newer session",
  });
  await newer.appendMessage(createMessage("user", "new hello"));
  await newer.appendMessage(createMessage("assistant", "Newer answer"));

  try {
    const result = await runCli(["list"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Missing API key");
    expect(result.stderr).not.toContain("Missing model");
    const sessions = JSON.parse(result.stdout) as Array<{
      id?: string;
      title?: string | null;
      createdAt?: string;
      updatedAt?: string;
      messageCount?: number;
    }>;

    expect(sessions).toHaveLength(2);
    expect(result.stdout).not.toContain("Newer answer");
    expect(result.stdout).not.toContain("Older answer");
    expect(sessions.map((session) => session.id)).toEqual([newer.getSessionId(), older.getSessionId()]);
    expect(sessions[0]).toMatchObject({
      title: "Newer session",
      messageCount: 2,
    });
    expect(sessions[0]).not.toHaveProperty("latestMessage");
    expect(sessions[1]).toMatchObject({
      title: "Older session",
      messageCount: 2,
    });
    expect(sessions[1]).not.toHaveProperty("latestMessage");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI list rejects trailing prompt text", async () => {
  const result = await runCli(["list", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("list does not accept a prompt.");
});

test("CLI times out stalled OpenAI-compatible requests", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-timeout-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    server = Bun.serve({
      port: 0,
      fetch: () => new Promise<Response>(() => undefined),
    });
  } catch (error) {
    if (canSkipLocalBindError(error)) {
      await rm(workspace, { recursive: true, force: true });
      expect(true).toBe(true);
      return;
    }
    throw error;
  }

  try {
    const result = await runCli([...modelFlags(server), "--timeout-ms", "1", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Request timed out after 1ms.");

    const logMatch = result.stderr.match(/Log written to (.+\.jsonl)/);
    expect(logMatch).not.toBeNull();
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    const logPath = join(workspace, logMatch?.[1] ?? "");
    await rm(logPath, { force: true });
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI interactive prompt reports model errors once", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-interactive-error-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  let requestCount = 0;
  try {
    try {
      server = Bun.serve({
        port: 0,
        fetch: () => {
          requestCount++;
          if (requestCount === 1) {
            return Response.json(
              { error: { message: "provider down" } },
              { status: 400, statusText: "Bad Request" },
            );
          }
          return openAIResponse({ message: "Recovered.", route: "direct" });
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli(
      [...modelFlags(server)],
      {
        ROWAN_WORKSPACE: workspace,
      },
      "hello\nagain\n",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Recovered.");
    expect(countMatches(result.stderr, /provider down/g)).toBe(1);
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(2);

    const sessionId = sessionIdFrom(result.stderr);
    const sessionPath = join(workspace, ".rowan", "sessions", `${sessionId}.jsonl`);
    const sessionLines = (await Bun.file(sessionPath).text()).trim().split("\n");
    const messageEntries = sessionLines.slice(1).map((line) => JSON.parse(line)) as Array<{
      type?: string;
      message?: { role?: string; content?: unknown };
    }>;
    expect(
      messageEntries.some(
        (entry) => entry.message?.role === "assistant" && JSON.stringify(entry.message.content).includes("provider down"),
      ),
    ).toBe(false);
    expect(
      messageEntries.filter((entry) => entry.type === "message" && entry.message?.role === "assistant"),
    ).toHaveLength(1);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI writes a default log without --log", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-default-"));
  const responses = [
    {
      message: "Hello from model",
      toolCalls: [
        {
          name: "route",
          args: { route: "stop", reason: "Hello from model" },
        },
      ],
    },
  ];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    server = Bun.serve({
      port: 0,
      fetch: () => openAIResponse(responses[requestCount++] ?? responses.at(-1)),
    });
  } catch (error) {
    if (canSkipLocalBindError(error)) {
      await rm(workspace, { recursive: true, force: true });
      expect(true).toBe(true);
      return;
    }
    throw error;
  }

  try {
    const result = await runCli([...modelFlags(server), "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.trim();
    expect(stdout).toBe("Hello from model");

    const logMatch = result.stderr.match(/Log written to (.+\.jsonl)/);
    expect(logMatch).not.toBeNull();
    const displayedLogPath = logMatch?.[1];
    const sessionId = sessionIdFrom(result.stderr);
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    // Events are written to the log file, not streamed to stderr
    const metadataLines = result.stderr
      .trim()
      .split("\n")
      .filter((line) => /^(Session id|Message id|Log written to)/.test(line));
    expect(metadataLines[0]).toMatch(/^Session id: ses_[A-Za-z0-9_-]+$/);
    expect(metadataLines[1]).toMatch(/^Message id: msg_[A-Za-z0-9_-]+$/);
    expect(metadataLines[2]).toMatch(/^Log written to \.rowan\/runs\/.+\.jsonl$/);
    expect(displayedLogPath?.startsWith(".rowan/runs/")).toBe(true);
    expect(displayedLogPath).toMatch(
      new RegExp(`^\\.rowan/runs/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}(Z|[+-]\\d{2}:\\d{2})-${sessionId}\\.jsonl$`),
    );

    const logPath = join(workspace, displayedLogPath ?? "");
    const logText = await Bun.file(logPath ?? "").text();
    const [firstRecord] = await readLogRecords(logPath);
    const [firstEvent] = await readLogEvents(logPath);
    expect(firstRecord?.time).toEqual(expect.any(String));
    expect(firstEvent?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:\d{2})$/);
    expect(firstEvent?.type).toBe("agent_start");
    expect(firstRecord?.timestamp).toBeUndefined();
    expect(firstRecord?.event).toBeUndefined();
    expect(firstRecord).toMatchObject({
      level: 30,
      eventType: "agent_start",
    });
    expect(firstRecord?.msg).toBeUndefined();
    expect(logText).not.toContain("\"eventType\":\"agent_state_created\"");
    expect(logText).not.toContain("\"eventType\":\"agent_state_loaded\"");
    expect(logText).toContain("\"eventType\":\"turn_start\"");
    expect(logText).not.toContain("\"msg\":");
    expect(logText).not.toContain("\"event\":");
    expect(logText).not.toContain("\"input\":\"hello\"");
    expect(logText).toContain("\"eventType\":\"model_requested\"");
    expect(logText).toContain("\"phase\":\"default\"");
    expect(logText).not.toContain("\"eventType\":\"task_created\"");
    expect(logText).toContain("\"eventType\":\"turn_end\"");

    const sessionPath = join(workspace, ".rowan", "sessions", `${sessionId}.jsonl`);
    const sessionLines = (await Bun.file(sessionPath).text()).trim().split("\n");
    const session = JSON.parse(sessionLines[0] ?? "{}") as {
      version?: string;
    };
    const messageEntries = sessionLines.slice(1).map((line) => JSON.parse(line)) as Array<{
      type?: string;
      message?: { content?: unknown };
    }>;
    expect(session.version).toBe("0.4.4");
    expect(messageEntries.some((entry) => JSON.stringify(entry.message?.content).includes("Hello from model"))).toBe(true);
    expect(messageEntries.some((entry) => entry.type === "execution_turn")).toBe(false);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI --log-level debug writes redacted event payloads", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-debug-log-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    try {
      server = Bun.serve({
        port: 0,
        fetch: () => openAIResponse({ message: "Debug answer", route: "direct" }),
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli([...modelFlags(server), "--log-level", "Debug", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    const logMatch = result.stderr.match(/Log written to (.+\.jsonl)/);
    expect(logMatch).not.toBeNull();
    const logPath = join(workspace, logMatch?.[1] ?? "");
    const logText = await Bun.file(logPath).text();
    const [firstRecord] = await readLogRecords(logPath);
    expect(logText).toContain("\"type\":\"turn_start\"");
    expect(logText).toContain("\"content\":\"hello\"");
    expect(logText).toContain("\"event\":");
    expect(logText).toContain("\"content\":\"hello\"");
    expect(logText).not.toContain("\"eventType\":\"agent_state_created\"");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI --log-level silent suppresses run log files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-silent-log-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    try {
      server = Bun.serve({
        port: 0,
        fetch: () => openAIResponse({ message: "Silent answer", route: "direct" }),
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli([...modelFlags(server), "--log-level", "silent", "hello"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Log written to");
    expect(result.stderr).not.toContain("\"eventType\":");
    const runsDir = join(workspace, ".rowan", "runs");
    const logFiles = await readdir(runsDir).catch(() => []);
    expect(logFiles.filter((file) => file.endsWith(".jsonl"))).toHaveLength(0);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI exposes core bash in the none phase", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-bash-"));
  const responses = [
    {
      message: "Bash is available.",
      toolCalls: [
        {
          id: "call_bash",
          name: "bash",
          args: { command: "printf cli-bash-ok" },
        },
      ],
    },
    { message: "Bash finished." },
  ];
  const requests: Array<{ messages?: Array<{ content?: string }>; tools?: Array<{ function: { name: string } }> }> = [];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    server = Bun.serve({
      port: 0,
      async fetch(request) {
        requests.push((await request.json()) as { messages?: Array<{ content?: string }>; tools?: Array<{ function: { name: string } }> });
        return openAIResponse(responses[requestCount++] ?? responses.at(-1));
      },
    });
  } catch (error) {
    if (canSkipLocalBindError(error)) {
      await rm(workspace, { recursive: true, force: true });
      expect(true).toBe(true);
      return;
    }
    throw error;
  }

  try {
    const result = await runCli([...modelFlags(server), "use bash"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Bash is available");
    expect(result.stdout).toContain("Bash finished.");
    expect(result.stdout).not.toContain("cli-bash-ok");
    expect(requests[0]?.tools?.some((t: { function: { name: string } }) => t.function.name === "bash")).toBe(true);

    const logMatch = result.stderr.match(/Log written to (.+\.jsonl)/);
    expect(logMatch).not.toBeNull();
    const logPath = join(workspace, logMatch?.[1] ?? "");
    const logEvents = await readLogEvents(logPath);
    const nonePhaseIndex = logEvents.findIndex(
      (event) => event.type === "phase_start" && event.phase === "default",
    );
    expect(nonePhaseIndex).toBeGreaterThanOrEqual(0);
    expect(logEvents.some((event) => event.type === "tool_execution_start")).toBe(true);
    expect(logEvents.some((event) => event.type === "tool_execution_end")).toBe(true);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI --session continues a saved one-shot session", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-session-"));
  const responses = [
    { message: "First saved answer", route: "direct" },
    { message: "Second saved answer", route: "direct" },
  ];
  const requests: Array<{ messages?: Array<{ content?: string }> }> = [];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;

  try {
    try {
      server = Bun.serve({
        port: 0,
        async fetch(request) {
          requests.push((await request.json()) as { messages?: Array<{ content?: string }> });
          return openAIResponse(responses[requestCount++] ?? responses.at(-1));
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const first = await runCli([...modelFlags(server), "hello"], { ROWAN_WORKSPACE: workspace });
    expect(first.exitCode).toBe(0);
    const sessionId = sessionIdFrom(first.stderr);

    const second = await runCli([...modelFlags(server), "--session", sessionId, "continue"], { ROWAN_WORKSPACE: workspace });
    expect(second.exitCode).toBe(0);
    expect(sessionIdFrom(second.stderr)).toBe(sessionId);
    expect(countMatches(second.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(second.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(second.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);

    const secondPrompt = requests[1]?.messages?.map((message) => message.content).join("\n") ?? "";
    expect(secondPrompt).toContain("hello");
    expect(secondPrompt).toContain("First saved answer");
    expect(secondPrompt).toContain("continue");

    const runsDir = join(workspace, ".rowan", "runs");
    const logFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(logFiles).toHaveLength(2);
    expect(logFiles.every((file) => file.endsWith(`-${sessionId}.jsonl`))).toBe(true);
    const summaries = await Promise.all(
      logFiles.map((file) => summarizeLogFile(join(runsDir, file))),
    );
    expect(summaries.every((summary) => summary.eventTypes.turn_start === 1)).toBe(true);
    expect(summaries.every((summary) => summary.eventTypes.agent_state_created === undefined)).toBe(true);
    expect(summaries.every((summary) => summary.eventTypes.agent_state_loaded === undefined)).toBe(true);
    expect(second.stderr).toContain(`-${sessionId}.jsonl`);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI initial prompt continues into the default interactive session", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-interactive-"));
  const responses = [
    { message: "Chat first", route: "direct" },
    { message: "Chat second", route: "direct" },
  ];
  const requests: Array<{ messages?: Array<{ content?: string }> }> = [];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;

  try {
    try {
      server = Bun.serve({
        port: 0,
        async fetch(request) {
          requests.push((await request.json()) as { messages?: Array<{ content?: string }> });
          return openAIResponse(responses[requestCount++] ?? responses.at(-1));
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli(
      [...modelFlags(server), "hello"],
      {
        ROWAN_WORKSPACE: workspace,
      },
      ":session\nagain\n:quit\n",
    );

    expect(result.exitCode).toBe(0);
    const sessionId = sessionIdFrom(result.stderr);
    expect(result.stdout).toContain("Chat first");
    expect(result.stdout).toContain("Chat second");
    expect(result.stdout).toContain(sessionId);
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(2);

    const secondPrompt = requests[1]?.messages?.map((message) => message.content).join("\n") ?? "";
    expect(secondPrompt).toContain("hello");
    expect(secondPrompt).toContain("Chat first");
    expect(secondPrompt).toContain("again");

    const sessionFiles = await readdir(join(workspace, ".rowan", "sessions"));
    expect(sessionFiles).toEqual([`${sessionId}.jsonl`]);

    const runsDir = join(workspace, ".rowan", "runs");
    const logFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(logFiles).toHaveLength(1);
    expect(logFiles[0]?.endsWith(`-${sessionId}.jsonl`)).toBe(true);
    const summary = await summarizeLogFile(join(runsDir, logFiles[0] ?? ""));
    expect(summary.eventTypes.turn_start).toBe(2);
    expect(summary.eventTypes.agent_state_created).toBeUndefined();
    expect(summary.eventTypes.agent_state_loaded).toBeUndefined();
    expect(summary.eventTypes.session_start).toBeUndefined();
    expect(summary.eventTypes.session_end).toBeUndefined();
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI --session can continue with additional interactive turns", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-loaded-interactive-"));
  const responses = [
    { message: "Initial answer", route: "direct" },
    { message: "Loaded chat first", route: "direct" },
    { message: "Loaded chat second", route: "direct" },
  ];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;

  try {
    try {
      server = Bun.serve({
        port: 0,
        fetch: () => openAIResponse(responses[requestCount++] ?? responses.at(-1)),
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }
    const initial = await runCli([...modelFlags(server), "hello"], { ROWAN_WORKSPACE: workspace });
    expect(initial.exitCode).toBe(0);
    const sessionId = sessionIdFrom(initial.stderr);

    const chat = await runCli([...modelFlags(server), "--session", sessionId, "again"], { ROWAN_WORKSPACE: workspace }, "more\n:quit\n");
    expect(chat.exitCode).toBe(0);
    expect(sessionIdFrom(chat.stderr)).toBe(sessionId);
    expect(countMatches(chat.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(chat.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(chat.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(2);

    const runsDir = join(workspace, ".rowan", "runs");
    const logFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(logFiles).toHaveLength(2);
    expect(logFiles.every((file) => file.endsWith(`-${sessionId}.jsonl`))).toBe(true);

    const summaries = await Promise.all(
      logFiles.map((file) => summarizeLogFile(join(runsDir, file))),
    );
    const loadedSummary = summaries.find((summary) => summary.eventTypes.turn_start === 2);
    expect(loadedSummary).toBeDefined();
    expect(loadedSummary?.eventTypes.agent_state_created).toBeUndefined();
    expect(loadedSummary?.eventTypes.agent_state_loaded).toBeUndefined();
    expect(loadedSummary?.eventTypes.session_start).toBeUndefined();
    expect(loadedSummary?.eventTypes.session_end).toBeUndefined();

    const [firstEvent] = await readLogEvents(loadedSummary?.filePath ?? "");
    expect(firstEvent?.type).toBe("agent_start");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI no longer exposes chat, sessions, or log subcommands in help", async () => {
  const result = await runCli(["--help"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).toContain("bun run rowan [options] [command] [prompt]");
  expect(result.stdout).toContain("config  Show the current resolved configuration");
  expect(result.stdout).toContain("list    List saved sessions in the current workspace");
  expect(result.stdout).not.toContain("bun run rowan chat");
  expect(result.stdout).not.toContain("sessions list");
  expect(result.stdout).not.toContain("trace list");
  expect(result.stdout).not.toContain("trace show");
});

test("CLI treats chat as a prompt instead of a command", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-chat-prompt-"));
  const requests: Array<{ messages?: Array<{ content?: string }> }> = [];
  let server: ReturnType<typeof Bun.serve> | undefined;

  try {
    try {
      server = Bun.serve({
        port: 0,
        async fetch(request) {
          requests.push((await request.json()) as { messages?: Array<{ content?: string }> });
          return openAIResponse({ message: "chat was handled as a prompt", route: "direct" });
        },
      });
    } catch (error) {
      if (canSkipLocalBindError(error)) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }

    const result = await runCli([...modelFlags(server), "chat"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("chat was handled as a prompt");
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Log written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(requests).toHaveLength(1);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});
