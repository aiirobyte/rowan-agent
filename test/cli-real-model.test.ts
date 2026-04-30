import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";

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
  const server = Bun.serve({
    port: 0,
    fetch: () => openAIResponse(responses[requestCount++] ?? responses.at(-1)),
  });

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
    const tracePath = traceMatch?.[1];
    expect(tracePath?.startsWith(".rowan/runs/")).toBe(true);
    expect(tracePath).toMatch(
      /\.rowan\/runs\/\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}-run_[a-f0-9]{8}\.jsonl$/,
    );

    const trace = await Bun.file(tracePath ?? "").text();
    const firstEvent = JSON.parse(trace.split("\n")[0] ?? "{}") as { ts?: string; timestamp?: string };
    expect(firstEvent.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
    expect(firstEvent.timestamp).toBeUndefined();
    expect(trace).toContain("\"type\":\"session_created\"");
    expect(trace).toContain("\"userInput\":\"hello\"");
    expect(trace).toContain("\"type\":\"model_call\"");
    expect(trace).toContain("\"type\":\"outcome\"");

    await rm(tracePath ?? "", { force: true });
  } finally {
    server.stop(true);
  }
});
