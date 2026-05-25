import { expect, test } from "bun:test";
import { runConfiguredPhase } from "../src/loop/phases";
import type { PhaseDefinition, PhaseTransition } from "../src/loop/phases";
import type { AgentLoopRuntime } from "../src/loop";
import { createLoopRuntime } from "../src/loop";
import type { Outcome } from "../src/types";
import { createId, createMessage } from "../src/types";

function createTestRuntime(overrides: Record<string, unknown> = {}): AgentLoopRuntime {
  return createLoopRuntime({
    kind: "run",
    context: {
      systemPrompt: "test",
      messages: [createMessage("user", "hello", { scope: "conversation" })],
    },
    model: { provider: "test", name: "test" },
    stream: async function* () {},
    tools: [],
    ...overrides,
  } as any);
}

function noopCreateRun(): never {
  throw new Error("createRun not implemented in test");
}

function testPhase<TInput = unknown, TOutput = unknown>(
  definition: Omit<PhaseDefinition<TInput, TOutput>, "name" | "description">,
): PhaseDefinition<TInput, TOutput> {
  return {
    name: "Test",
    description: "Test phase",
    ...definition,
  };
}

test("runConfiguredPhase calls buildInput and returns stop when no apply", async () => {
  const runtime = createTestRuntime();
  let buildInputCalled = false;

  const definition = testPhase({
    id: "test",
    buildInput: (rt) => {
      buildInputCalled = true;
      return { from: rt };
    },
  });

  const transition = await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(buildInputCalled).toBe(true);
  expect(transition.type).toBe("stop");
});

test("runConfiguredPhase calls run hook with phase context", async () => {
  const runtime = createTestRuntime();
  let runInput: unknown;

  const definition = testPhase<{ value: string }, { result: string }>({
    id: "test",
    buildInput: () => ({ value: "hello" }),
    run: async (_ctx, input) => {
      runInput = input;
      return { result: "world" };
    },
  });

  const transition = await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(runInput).toEqual({ value: "hello" });
  expect(transition.type).toBe("stop");
});

test("runConfiguredPhase calls apply hook and returns its transition", async () => {
  const runtime = createTestRuntime();
  const expectedOutcome: Outcome = { id: createId("out"), passed: true, message: "done" };

  const definition = testPhase<string, string>({
    id: "test",
    buildInput: () => "input",
    run: async () => "output",
    apply: async (_rt, output, _input): Promise<PhaseTransition> => {
      expect(output).toBe("output");
      return { type: "stop", outcome: expectedOutcome };
    },
  });

  const transition = await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(transition).toEqual({ type: "stop", outcome: expectedOutcome });
});

test("runConfiguredPhase returns next transition from apply", async () => {
  const runtime = createTestRuntime();

  const definition = testPhase<string, string>({
    id: "test",
    buildInput: () => "input",
    run: async () => "output",
    apply: async (): Promise<PhaseTransition> => {
      return { type: "next", phaseId: "next-phase" };
    },
  });

  const transition = await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(transition).toEqual({ type: "next", phaseId: "next-phase" });
});

test("runConfiguredPhase calls parseOutput before apply", async () => {
  const runtime = createTestRuntime();
  let parsedOutput: unknown;

  const definition = testPhase<string, { parsed: boolean }>({
    id: "test",
    buildInput: () => "raw",
    run: async () => "raw-output" as any,
    parseOutput: (raw) => {
      return { parsed: true, raw };
    },
    apply: async (_rt, output) => {
      parsedOutput = output;
      return { type: "stop", outcome: { id: "out", passed: true, message: "ok" } };
    },
  });

  await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(parsedOutput).toEqual({ parsed: true, raw: "raw-output" });
});

test("runConfiguredPhase provides createRun in phase context", async () => {
  const runtime = createTestRuntime();
  const customCreateRun = async () => {
    return {
      kind: "thread" as const,
      parentSessionId: "parent",
      sessionId: "child",
      messages: [],
      outcome: { id: "out", passed: true, message: "ok" },
      limitUsage: { modelCalls: 0, toolCalls: 0 },
      depth: { threadDepth: 1, maxThreadDepth: 4 },
      prompt: "test",
    };
  };

  let receivedCreateRun: unknown;

  const definition = testPhase<string, void>({
    id: "test",
    buildInput: () => "input",
    run: async (ctx) => {
      receivedCreateRun = ctx.createRun;
    },
  });

  await runConfiguredPhase(runtime, definition, customCreateRun);

  expect(receivedCreateRun).toBe(customCreateRun);
});

test("runConfiguredPhase respects runtime beforePhase abort", async () => {
  const runtime = createTestRuntime({
    runtime: {
      async beforePhase() {
        return {
          abort: { id: "out", passed: false, message: "aborted" },
        };
      },
    },
  });

  const definition = testPhase<string, string>({
    id: "test",
    modelPhase: "chat",
    buildInput: () => "input",
    run: async () => "output",
  });

  const transition = await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(transition.type).toBe("abort");
  if (transition.type === "abort") {
    expect(transition.outcome.message).toBe("aborted");
  }
});

test("runConfiguredPhase respects runtime afterPhase retry up to 3 times", async () => {
  let attempts = 0;

  const runtime = createTestRuntime({
    runtime: {
      async afterPhase() {
        attempts += 1;
        if (attempts < 3) {
          return { retry: { state: runtime.agentState, runtime: { threadDepth: 0, maxThreadDepth: 4 }, tools: [], availablePhases: [] } };
        }
        return undefined;
      },
    },
  });

  const definition = testPhase<string, string>({
    id: "test",
    modelPhase: "chat",
    buildInput: () => "input",
    run: async () => "output",
  });

  await runConfiguredPhase(runtime, definition, noopCreateRun as any);

  expect(attempts).toBe(3);
});

test("runConfiguredPhase throws after too many runtime retries", async () => {
  const runtime = createTestRuntime({
    runtime: {
      async afterPhase() {
        return { retry: { state: runtime.agentState, runtime: { threadDepth: 0, maxThreadDepth: 4 }, tools: [], availablePhases: [] } };
      },
    },
  });

  const definition = testPhase<string, string>({
    id: "test",
    modelPhase: "chat",
    buildInput: () => "input",
    run: async () => "output",
  });

  await expect(
    runConfiguredPhase(runtime, definition, noopCreateRun as any),
  ).rejects.toThrow("too many test phase retries");
});
