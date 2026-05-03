import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Outcome } from "@rowan-agent/agent";
import { LocalJsonAgentStore } from "@rowan-agent/store";
import { createMessage, createSession } from "@rowan-agent/session";
import { inspectTrace } from "@rowan-agent/trace";
import { formatOutcomeOutput } from "../src/output";

async function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
  stdin?: string,
) {
  const proc = Bun.spawn(["bun", "run", "rowan", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ROWAN_OPENAI_API_KEY: "",
      ROWAN_MODEL: "",
      ROWAN_OPENAI_BASE_URL: "",
      ROWAN_OPENAI_TIMEOUT_MS: "",
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
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify(content),
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

test("CLI requires OpenAI-compatible API key", async () => {
  const result = await runCli(["--model", "test-model", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Missing API key");
});

test("CLI requires OpenAI-compatible model", async () => {
  const result = await runCli(["--api-key", "test-key", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Missing model");
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

test("CLI rejects invalid OpenAI-compatible timeout", async () => {
  const result = await runCli(["--timeout-ms", "0", "hello"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("--timeout-ms must be a positive integer.");
});

test("CLI config shows missing and default configuration without requiring model credentials", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-config-missing-"));

  try {
    const result = await runCli(["config"], {
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Missing API key");
    expect(result.stderr).not.toContain("Missing model");
    const config = JSON.parse(result.stdout) as {
      command?: string;
      workspace?: { root?: string; sessionsDir?: string; runsDir?: string; skillsDir?: string };
      openaiCompatible?: {
        baseUrl?: string;
        baseUrlSource?: string;
        apiKey?: string | null;
        apiKeyConfigured?: boolean;
        apiKeySource?: string;
        modelConfigured?: boolean;
        modelSource?: string;
        timeoutMs?: number;
        timeoutMsSource?: string;
      };
      agent?: {
        maxThreadDepth?: number;
        maxThreadDepthSource?: string;
      };
    };

    expect(config.command).toBe("config");
    expect(config.workspace?.root).toBe(workspace);
    expect(config.workspace?.sessionsDir).toBe(join(workspace, "sessions"));
    expect(config.workspace?.runsDir).toBe(join(workspace, "runs"));
    expect(config.workspace?.skillsDir).toBe(join(workspace, "skills"));
    expect(config.openaiCompatible).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      baseUrlSource: "default",
      apiKey: null,
      apiKeyConfigured: false,
      apiKeySource: "missing",
      modelConfigured: false,
      modelSource: "missing",
      timeoutMs: 60000,
      timeoutMsSource: "default",
    });
    expect(config.agent).toMatchObject({
      maxThreadDepth: 4,
      maxThreadDepthSource: "default",
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
        "--max-thread-depth",
        "7",
        "--session",
        "ses_example",
        "--trace",
        "runs/custom.jsonl",
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
      openaiCompatible?: Record<string, unknown>;
      agent?: Record<string, unknown>;
      session?: Record<string, unknown>;
      trace?: Record<string, unknown>;
      skills?: Array<Record<string, unknown>>;
      tools?: string[];
    };

    expect(config.openaiCompatible).toMatchObject({
      baseUrl: "https://api.example/v1",
      baseUrlSource: "flag",
      apiKeyConfigured: true,
      apiKey: "super********key",
      apiKeySource: "flag",
      model: "test-model",
      modelConfigured: true,
      modelSource: "flag",
      timeoutMs: 1234,
      timeoutMsSource: "flag",
    });
    expect(config.agent).toMatchObject({
      maxThreadDepth: 7,
      maxThreadDepthSource: "flag",
    });
    expect(config.session).toEqual({ id: "ses_example", source: "flag" });
    expect(config.trace).toEqual({ automatic: false, path: "runs/custom.jsonl" });
    expect(config.skills).toEqual([
      {
        idOrPath: "example",
        path: "skills/example/SKILL.md",
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
  const store = new LocalJsonAgentStore(join(workspace, "sessions"));
  const older = createSession({
    systemPrompt: "Test system",
    input: "old hello",
    title: "Older session",
  });
  older.createdAt = "2026-05-02T120000-00+08:00";
  older.updatedAt = "2026-05-02T120001-00+08:00";
  older.messages.push(createMessage("assistant", "Older answer"));
  const newer = createSession({
    systemPrompt: "Test system",
    input: "new hello",
    title: "Newer session",
  });
  newer.createdAt = "2026-05-02T130000-00+08:00";
  newer.updatedAt = "2026-05-02T130001-00+08:00";
  newer.messages.push(createMessage("assistant", "Newer answer"));

  try {
    await store.save(older);
    await store.save(newer);

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
    expect(sessions.map((session) => session.id)).toEqual([older.id, newer.id]);
    expect(sessions[0]).toMatchObject({
      title: "Older session",
      createdAt: "2026-05-02T120000-00+08:00",
      updatedAt: "2026-05-02T120001-00+08:00",
      messageCount: older.messages.length,
    });
    expect(sessions[0]).not.toHaveProperty("latestMessage");
    expect(sessions[1]).toMatchObject({
      title: "Newer session",
      createdAt: "2026-05-02T130000-00+08:00",
      updatedAt: "2026-05-02T130001-00+08:00",
      messageCount: newer.messages.length,
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
    const result = await runCli(["--timeout-ms", "1", "hello"], {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Request timed out after 1ms.");

    const traceMatch = result.stderr.match(/Trace written to (.+\.jsonl)/);
    expect(traceMatch).not.toBeNull();
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    const tracePath = join(workspace, traceMatch?.[1] ?? "");
    await rm(tracePath, { force: true });
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI writes a default trace without --trace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-default-"));
  const responses = [
    {
      message: "Hello from model",
      route: "direct",
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
    const result = await runCli(["hello"], {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    const outcome = JSON.parse(result.stdout) as Outcome;
    expect(outcome).toMatchObject({
      passed: true,
      message: "Hello from model",
    });
    expect(outcome.taskId).toBeUndefined();
    expect(result.stdout.trim()).toBe(formatOutcomeOutput(outcome));

    const traceMatch = result.stderr.match(/Trace written to (.+\.jsonl)/);
    expect(traceMatch).not.toBeNull();
    const displayedTracePath = traceMatch?.[1];
    const sessionId = sessionIdFrom(result.stderr);
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    const metadataLines = result.stderr
      .trim()
      .split("\n")
      .filter((line) => /^(Session id|Message id|Trace written to)/.test(line));
    expect(metadataLines[0]).toMatch(/^Session id: ses_[A-Za-z0-9_-]+$/);
    expect(metadataLines[1]).toMatch(/^Message id: msg_[A-Za-z0-9_-]+$/);
    expect(metadataLines[2]).toMatch(/^Trace written to runs\/.+\.jsonl$/);
    expect(displayedTracePath?.startsWith("runs/")).toBe(true);
    expect(displayedTracePath).toMatch(
      new RegExp(`^runs/\\d{4}-\\d{2}-\\d{2}T\\d{6}-\\d{2}[+-]\\d{2}:\\d{2}-${sessionId}\\.jsonl$`),
    );

    const tracePath = join(workspace, displayedTracePath ?? "");
    const trace = await Bun.file(tracePath ?? "").text();
    const firstEvent = JSON.parse(trace.split("\n")[0] ?? "{}") as { ts?: string; timestamp?: string };
    expect(firstEvent.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
    expect(firstEvent.timestamp).toBeUndefined();
    expect(trace).toContain("\"type\":\"session_created\"");
    expect(trace).toContain("\"input\":\"hello\"");
    expect(trace).toContain("\"type\":\"model_requested\"");
    expect(trace).toContain("\"phase\":\"route\"");
    expect(trace).not.toContain("\"type\":\"task_created\"");
    expect(trace).toContain("\"type\":\"outcome\"");

    const sessionPath = join(workspace, "sessions", `${sessionId}.json`);
    const session = JSON.parse(await Bun.file(sessionPath).text()) as {
      version?: string;
      messages?: Array<{ content?: string }>;
    };
    expect(session.version).toBe("0.3.3");
    expect(session.messages?.some((message) => message.content?.includes("Hello from model"))).toBe(true);
    expect(session.messages?.some((message) => message.content === "Hello from model")).toBe(true);
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI exposes core bash during planning and executes returned tool calls", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "rowan-cli-bash-"));
  const responses = [
    {
      message: "Use bash to check the current date: $(date)",
      route: "direct",
    },
    {
      task: {
        title: "Run bash",
        instruction: "run a bash command",
        acceptanceCriteria: ["The bash command output is present."],
        toolNames: ["bash"],
      },
    },
    {
      message: "Running bash.",
      toolCalls: [
        {
          name: "bash",
          args: { command: "printf cli-bash-ok" },
        },
      ],
    },
    {
      passed: true,
      message: "cli-bash-ok",
    },
  ];
  const requests: Array<{ messages?: Array<{ content?: string }> }> = [];
  let requestCount = 0;
  let server: ReturnType<typeof Bun.serve> | undefined;
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
      await rm(workspace, { recursive: true, force: true });
      expect(true).toBe(true);
      return;
    }
    throw error;
  }

  try {
    const result = await runCli(["use bash"], {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("\"passed\": true");
    expect(requests[0]?.messages?.at(-1)?.content).toContain("\"name\": \"bash\"");

    const traceMatch = result.stderr.match(/Trace written to (.+\.jsonl)/);
    expect(traceMatch).not.toBeNull();
    const tracePath = join(workspace, traceMatch?.[1] ?? "");
    const trace = await Bun.file(tracePath).text();
    const traceEvents = trace
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)) as Array<{ type: string; phase?: string }>;
    const routeCallIndex = traceEvents.findIndex(
      (event) => event.type === "model_requested" && event.phase === "route",
    );
    const taskCreatedIndex = traceEvents.findIndex((event) => event.type === "task_created");
    expect(routeCallIndex).toBeGreaterThanOrEqual(0);
    expect(taskCreatedIndex).toBeGreaterThan(routeCallIndex);
    expect(trace).toContain("\"type\":\"tool_start\"");
    expect(trace).toContain("\"toolName\":\"bash\"");
    expect(trace).toContain("cli-bash-ok");
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

    const env = {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    };

    const first = await runCli(["hello"], env);
    expect(first.exitCode).toBe(0);
    const sessionId = sessionIdFrom(first.stderr);

    const second = await runCli(["--session", sessionId, "continue"], env);
    expect(second.exitCode).toBe(0);
    expect(sessionIdFrom(second.stderr)).toBe(sessionId);
    expect(countMatches(second.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(second.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(second.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);

    const secondPrompt = requests[1]?.messages?.map((message) => message.content).join("\n") ?? "";
    expect(secondPrompt).toContain("hello");
    expect(secondPrompt).toContain("First saved answer");
    expect(secondPrompt).toContain("continue");

    const runsDir = join(workspace, "runs");
    const traceFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(traceFiles).toHaveLength(2);
    expect(traceFiles.every((file) => file.endsWith(`-${sessionId}.jsonl`))).toBe(true);
    const summaries = await Promise.all(
      traceFiles.map((file) => inspectTrace(join(runsDir, file), runsDir)),
    );
    expect(summaries.every((summary) => summary.sessionIds.includes(sessionId))).toBe(true);
    expect(summaries.some((summary) => summary.eventTypes.session_created === 1)).toBe(true);
    expect(summaries.some((summary) => summary.eventTypes.session_loaded === 1)).toBe(true);
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
      ["hello"],
      {
        ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
        ROWAN_OPENAI_API_KEY: "test-key",
        ROWAN_MODEL: "test-model",
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
    expect(countMatches(result.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(2);

    const secondPrompt = requests[1]?.messages?.map((message) => message.content).join("\n") ?? "";
    expect(secondPrompt).toContain("hello");
    expect(secondPrompt).toContain("Chat first");
    expect(secondPrompt).toContain("again");

    const sessionFiles = await readdir(join(workspace, "sessions"));
    expect(sessionFiles).toEqual([`${sessionId}.json`]);

    const runsDir = join(workspace, "runs");
    const traceFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(traceFiles).toHaveLength(1);
    expect(traceFiles[0]?.endsWith(`-${sessionId}.jsonl`)).toBe(true);
    const summary = await inspectTrace(join(runsDir, traceFiles[0] ?? ""), runsDir);
    expect(summary.eventTypes.session_created).toBe(1);
    expect(summary.eventTypes.session_loaded).toBeUndefined();
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

    const env = {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    };
    const initial = await runCli(["hello"], env);
    expect(initial.exitCode).toBe(0);
    const sessionId = sessionIdFrom(initial.stderr);

    const chat = await runCli(["--session", sessionId, "again"], env, "more\n:quit\n");
    expect(chat.exitCode).toBe(0);
    expect(sessionIdFrom(chat.stderr)).toBe(sessionId);
    expect(countMatches(chat.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(chat.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(chat.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(2);

    const runsDir = join(workspace, "runs");
    const traceFiles = (await readdir(runsDir)).filter((file) => file.endsWith(".jsonl"));
    expect(traceFiles).toHaveLength(2);
    expect(traceFiles.every((file) => file.endsWith(`-${sessionId}.jsonl`))).toBe(true);

    const summaries = await Promise.all(
      traceFiles.map((file) => inspectTrace(join(runsDir, file), runsDir)),
    );
    const loadedSummary = summaries.find((summary) => summary.eventTypes.session_loaded === 1);
    expect(loadedSummary).toBeDefined();
    expect(loadedSummary?.eventTypes.session_created).toBeUndefined();
    expect(loadedSummary?.eventTypes.session_start).toBeUndefined();
    expect(loadedSummary?.eventTypes.session_end).toBeUndefined();

    const loadedTrace = await Bun.file(loadedSummary?.filePath ?? "").text();
    const firstEvent = JSON.parse(loadedTrace.split("\n")[0] ?? "{}") as { type?: string };
    expect(firstEvent.type).toBe("session_loaded");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("CLI no longer exposes chat, sessions, or trace subcommands in help", async () => {
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

    const result = await runCli(["chat"], {
      ROWAN_OPENAI_BASE_URL: server.url.toString().replace(/\/$/, ""),
      ROWAN_OPENAI_API_KEY: "test-key",
      ROWAN_MODEL: "test-model",
      ROWAN_WORKSPACE: workspace,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("chat was handled as a prompt");
    expect(countMatches(result.stderr, /Session id: ses_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(countMatches(result.stderr, /Trace written to .+\.jsonl/g)).toBe(1);
    expect(countMatches(result.stderr, /Message id: msg_[A-Za-z0-9_-]+/g)).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.messages?.map((message) => message.content).join("\n")).toContain("\"chat\"");
  } finally {
    server?.stop(true);
    await rm(workspace, { recursive: true, force: true });
  }
});
