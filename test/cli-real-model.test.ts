import { expect, test } from "bun:test";

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
