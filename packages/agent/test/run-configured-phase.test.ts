import { expect, test, describe } from "bun:test";
import { runPhase } from "../src/loop/phases";
import type { PhaseContext, PhaseDefinition } from "../src/loop/phases";
import type { AgentLoopRuntime } from "../src/agent-loop";
import { createLoopRuntime } from "../src/agent-loop";
import { createMessage } from "../src/types";
import {
  chatPhaseDefinition,
  planPhaseDefinition,
  executePhaseDefinition,
  verifyPhaseDefinition,
} from "../src/loop/phases";

// ============================================================================
// Test Helpers
// ============================================================================

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

function createTestContext(runtime: AgentLoopRuntime): PhaseContext {
  return {
    phaseId: "test",
    state: {
      agentState: runtime.agentState,
      currentPhase: "test",
      attempt: 0,
      toolResults: [],
      limitUsage: { modelCalls: 0, toolCalls: 0 },
      depth: { threadDepth: 0, maxThreadDepth: 4 },
    },
    messages: {
      visible: () => [],
      append: async () => {},
      appendState: async () => {},
    },
    model: {
      collect: async () => ({ text: "", toolCalls: [] }),
    },
    tools: {
      execute: async () => ({ toolCallId: "tc", toolName: "t", ok: true, content: null }),
    },
    runs: {
      create: async () => {
        throw new Error("not implemented");
      },
    },
    skills: [],
    emit: async () => {},
    consumeLimit: () => {},
  };
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

// ============================================================================
// runPhase contract — receives input, returns output, no transition
// ============================================================================

describe("runPhase contract", () => {
  test("runPhase accepts already-built input and returns output directly", async () => {
    const runtime = createTestRuntime();
    const context = createTestContext(runtime);
    const builtInput = { value: "pre-built" };

    const definition = testPhase<{ value: string }, { result: string }>({
      id: "test",
      run: async (_ctx, input) => {
        expect(input).toEqual({ value: "pre-built" });
        return { result: "output" };
      },
    });

    const output = await runPhase(context, definition, builtInput);

    expect(output).toEqual({ result: "output" });
  });

  test("runPhase returns output without constructing a PhaseTransition", async () => {
    const runtime = createTestRuntime();
    const context = createTestContext(runtime);

    const definition = testPhase<string, { answer: number }>({
      id: "test",
      run: async () => ({ answer: 42 }),
    });

    const output = await runPhase(context, definition, "input");

    expect(output).toEqual({ answer: 42 });
    expect(output).not.toHaveProperty("type");
    expect(output).not.toHaveProperty("phaseId");
    expect(output).not.toHaveProperty("outcome");
  });

  test("runPhase calls definition.run with PhaseContext, not AgentLoopRuntime", async () => {
    const runtime = createTestRuntime();
    const context = createTestContext(runtime);
    let receivedContext: unknown;

    const definition = testPhase<string, void>({
      id: "test",
      run: async (ctx) => {
        receivedContext = ctx;
      },
    });

    await runPhase(context, definition, "input");

    expect(receivedContext).toBeDefined();
    expect(receivedContext).toHaveProperty("phaseId");
    expect(receivedContext).toHaveProperty("messages");
    expect(receivedContext).toHaveProperty("model");
    expect(receivedContext).toHaveProperty("tools");
    expect(receivedContext).toHaveProperty("emit");
    expect(receivedContext).not.toHaveProperty("agentState");
    expect(receivedContext).not.toHaveProperty("currentTask");
    expect(receivedContext).not.toHaveProperty("attempt");
  });

  test("runPhase returns void output when definition.run returns undefined", async () => {
    const runtime = createTestRuntime();
    const context = createTestContext(runtime);

    const definition = testPhase<string, void>({
      id: "test",
      run: async () => {},
    });

    const output = await runPhase(context, definition, "input");

    expect(output).toBeUndefined();
  });

  test("runPhase provides runs.create through PhaseContext", async () => {
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

    const context: PhaseContext = {
      ...createTestContext(runtime),
      runs: { create: customCreateRun },
    };

    let receivedCreateRun: unknown;

    const definition = testPhase<string, void>({
      id: "test",
      run: async (ctx) => {
        receivedCreateRun = ctx.runs.create;
      },
    });

    await runPhase(context, definition, "input");

    expect(receivedCreateRun).toBe(customCreateRun);
  });
});

// ============================================================================
// Input builders are loop-owned, not definition-owned
// ============================================================================

describe("loop-owned input builders", () => {
  test("PhaseDefinition has no buildInput field", () => {
    const definition: PhaseDefinition<string, string> = {
      id: "test",
      name: "Test",
      description: "Test phase",
      run: async () => "output",
    };

    expect(definition).not.toHaveProperty("buildInput");
  });

  test("built-in chat phase definition does not include buildInput", () => {
    expect(chatPhaseDefinition).not.toHaveProperty("buildInput");
  });

  test("built-in plan phase definition does not include buildInput", () => {
    expect(planPhaseDefinition).not.toHaveProperty("buildInput");
  });

  test("built-in execute phase definition does not include buildInput", () => {
    expect(executePhaseDefinition).not.toHaveProperty("buildInput");
  });

  test("built-in verify phase definition does not include buildInput", () => {
    expect(verifyPhaseDefinition).not.toHaveProperty("buildInput");
  });
});

// ============================================================================
// Output appliers are loop-owned, not definition-owned
// ============================================================================

describe("loop-owned output appliers", () => {
  test("PhaseDefinition has no apply field", () => {
    const definition: PhaseDefinition<string, string> = {
      id: "test",
      name: "Test",
      description: "Test phase",
      run: async () => "output",
    };

    expect(definition).not.toHaveProperty("apply");
  });

  test("built-in chat phase definition does not include apply", () => {
    expect(chatPhaseDefinition).not.toHaveProperty("apply");
  });

  test("built-in plan phase definition does not include apply", () => {
    expect(planPhaseDefinition).not.toHaveProperty("apply");
  });

  test("built-in execute phase definition does not include apply", () => {
    expect(executePhaseDefinition).not.toHaveProperty("apply");
  });

  test("built-in verify phase definition does not include apply", () => {
    expect(verifyPhaseDefinition).not.toHaveProperty("apply");
  });
});

// ============================================================================
// Built-in phase modules do not require AgentLoopRuntime
// ============================================================================

describe("built-in phase runtime boundary", () => {
  test("built-in phase definitions have no buildInput or apply", () => {
    expect(chatPhaseDefinition).not.toHaveProperty("buildInput");
    expect(chatPhaseDefinition).not.toHaveProperty("apply");
    expect(planPhaseDefinition).not.toHaveProperty("buildInput");
    expect(planPhaseDefinition).not.toHaveProperty("apply");
    expect(executePhaseDefinition).not.toHaveProperty("buildInput");
    expect(executePhaseDefinition).not.toHaveProperty("apply");
    expect(verifyPhaseDefinition).not.toHaveProperty("buildInput");
    expect(verifyPhaseDefinition).not.toHaveProperty("apply");
  });
});
