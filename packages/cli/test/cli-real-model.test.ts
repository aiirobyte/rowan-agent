import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function runCli(args: string[], env: Record<string, string | undefined> = {}) {
  const proc = Bun.spawn(["bun", "run", "rowan", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ROWAN_OPENAI_API_KEY: "",
      ROWAN_MODEL: "",
      ROWAN_OPENAI_BASE_URL: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

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

test("CLI writes a default trace without --trace", async () => {
  const responses = [
    {
      task: {
        title: "Say hello",
        instruction: "hello",
        acceptanceCriteria: ["The final outcome addresses hello."],
        toolNames: [],
      },
    },
    {
      message: "Hello from model",
      toolCalls: [],
    },
    {
      passed: true,
      message: "The model greeted the user.",
      evidence: [],
      failedCriteria: [],
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
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("\"passed\": true");

    const traceMatch = result.stderr.match(/Trace written to (.+\.jsonl)/);
    expect(traceMatch).not.toBeNull();
    const displayedTracePath = traceMatch?.[1];
    expect(displayedTracePath?.startsWith("runs/")).toBe(true);
    expect(displayedTracePath).toMatch(
      /runs\/\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}-run_[a-f0-9]{8}\.jsonl$/,
    );

    const tracePath = join(process.cwd(), displayedTracePath ?? "");
    const trace = await Bun.file(tracePath ?? "").text();
    const firstEvent = JSON.parse(trace.split("\n")[0] ?? "{}") as { ts?: string; timestamp?: string };
    expect(firstEvent.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
    expect(firstEvent.timestamp).toBeUndefined();
    expect(trace).toContain("\"type\":\"session_created\"");
    expect(trace).toContain("\"userInput\":\"hello\"");
    expect(trace).toContain("\"type\":\"model_call\"");
    expect(trace).toContain("\"type\":\"outcome\"");

    await rm(tracePath, { force: true });
  } finally {
    server?.stop(true);
  }
});

test("CLI exposes workspace bash during planning and executes returned tool calls", async () => {
  const responses = [
    {
      task: {
        title: "Run bash",
        instruction: "run a bash command",
        acceptanceCriteria: ["The bash command output is present."],
        toolNames: ["workspace.bash"],
      },
    },
    {
      message: "Running bash.",
      toolCalls: [
        {
          name: "workspace.bash",
          args: { command: "printf cli-bash-ok" },
        },
      ],
    },
    {
      passed: true,
      message: "cli-bash-ok",
      evidence: [],
      failedCriteria: [],
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
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("\"passed\": true");
    expect(requests[0]?.messages?.at(-1)?.content).toContain("\"name\": \"workspace.bash\"");

    const traceMatch = result.stderr.match(/Trace written to (.+\.jsonl)/);
    expect(traceMatch).not.toBeNull();
    const tracePath = join(process.cwd(), traceMatch?.[1] ?? "");
    const trace = await Bun.file(tracePath).text();
    expect(trace).toContain("\"type\":\"tool_call_start\"");
    expect(trace).toContain("\"toolName\":\"workspace.bash\"");
    expect(trace).toContain("cli-bash-ok");

    await rm(tracePath, { force: true });
  } finally {
    server?.stop(true);
  }
});

test("CLI trace list and show inspect local runs", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-cli-trace-"));
  const tracePath = join(runsDir, "2026-05-01T120000-00+08:00-run_abcd1234.jsonl");
  await writeFile(
    tracePath,
    [
      JSON.stringify({ type: "session_start", sessionId: "ses_test", ts: "2026-05-01T120000-00+08:00" }),
      JSON.stringify({ type: "outcome", outcome: { id: "out_test" }, ts: "2026-05-01T120001-00+08:00" }),
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const list = await runCli(["trace", "list", "--runs-dir", runsDir]);
    expect(list.exitCode).toBe(0);
    const runs = JSON.parse(list.stdout) as Array<{ runId?: string; filePath?: string }>;
    expect(runs[0]?.runId).toBe("run_abcd1234");
    expect(runs[0]?.filePath).toBe(tracePath);

    const show = await runCli(["trace", "show", "run_abcd1234", "--runs-dir", runsDir]);
    expect(show.exitCode).toBe(0);
    const summary = JSON.parse(show.stdout) as {
      eventCount: number;
      eventTypes: Record<string, number>;
      sessionIds: string[];
    };
    expect(summary.eventCount).toBe(2);
    expect(summary.eventTypes.session_start).toBe(1);
    expect(summary.eventTypes.outcome).toBe(1);
    expect(summary.sessionIds).toEqual(["ses_test"]);
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});
