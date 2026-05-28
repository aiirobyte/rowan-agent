import { expect, test, describe } from "bun:test";
import type { PhaseContext, PhaseDefinition } from "../src/loop/phases";
import type { AgentLoopConfig, AgentRunState } from "../src/loop/types";
import { createLoopLifecycle } from "../src/agent-loop";
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

function createTestLifecycle(overrides: Record<string, unknown> = {}): { config: AgentLoopConfig; state: AgentRunState } {
  return createLoopLifecycle({
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

function createTestContext(state: AgentRunState): PhaseContext {
  return {
    phaseId: "test",
    state: {
      agentState: state.agentState,
      currentPhase: "test",
      attempt: 0,
      limitUsage: { modelCalls: 0, toolCalls: 0 },
      depth: { threadDepth: 0, maxThreadDepth: 4 },
      transcript: [],
    },
    messages: {
      visible: () => [],
      append: () => {},
      appendState: () => {},
    },
    message: {
      start: () => "msg_1",
      update: async () => {},
      end: async () => {},
    },
    toolExecution: {
      start: async () => {},
      update: async () => {},
      end: async () => {},
    },
    model: {
      collect: async () => ({ text: "", structured: undefined }),
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
    emit: () => {},
    consumeLimit: () => {},
    turn: async (fn) => fn(),
    incrementAttempt: () => {},
    setLastExecuteText: () => {},
    availablePhases: [],
  };
}

function testPhase(
  definition: Omit<PhaseDefinition, "name" | "description">,
): PhaseDefinition {
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
    const { state } = createTestLifecycle();
    const context = createTestContext(state);
    const builtInput = {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    };

    const definition = testPhase({
      id: "test",
      run: async (_ctx, input) => {
        expect(input).toHaveProperty("systemPrompt");
        return { message: "output", route: "stop" };
      },
    });

    const output = await definition.run(context, builtInput);

    expect(output).toEqual({ message: "output", route: "stop" });
  });

  test("runPhase returns output with route for transitions", async () => {
    const { state } = createTestLifecycle();
    const context = createTestContext(state);

    const definition = testPhase({
      id: "test",
      run: async () => ({ message: "answer", route: "stop" }),
    });

    const output = await definition.run(context, {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    });

    expect(output).toEqual({ message: "answer", route: "stop" });
    expect(output).not.toHaveProperty("type");
    expect(output).not.toHaveProperty("phaseId");
    expect(output).not.toHaveProperty("outcome");
  });

  test("runPhase calls definition.run with PhaseContext, not AgentLoopRuntime", async () => {
    const { state } = createTestLifecycle();
    const context = createTestContext(state);
    let receivedContext: unknown;

    const definition = testPhase({
      id: "test",
      run: async (ctx) => {
        receivedContext = ctx;
        return { message: "", route: "stop" };
      },
    });

    await definition.run(context, {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    });

    expect(receivedContext).toBeDefined();
    expect(receivedContext).toHaveProperty("phaseId");
    expect(receivedContext).toHaveProperty("messages");
    expect(receivedContext).toHaveProperty("message");
    expect(receivedContext).toHaveProperty("toolExecution");
    expect(receivedContext).toHaveProperty("model");
    expect(receivedContext).toHaveProperty("tools");
    expect(receivedContext).toHaveProperty("emit");
    expect(receivedContext).not.toHaveProperty("agentState");
    expect(receivedContext).not.toHaveProperty("currentTask");
    expect(receivedContext).not.toHaveProperty("attempt");
  });

  test("runPhase provides runs.create through PhaseContext", async () => {
    const { state } = createTestLifecycle();
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
      ...createTestContext(state),
      runs: { create: customCreateRun },
    };

    let receivedCreateRun: unknown;

    const definition = testPhase({
      id: "test",
      run: async (ctx) => {
        receivedCreateRun = ctx.runs.create;
        return { message: "", route: "stop" };
      },
    });

    await definition.run(context, {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    });

    expect(receivedCreateRun).toBe(customCreateRun);
  });
});

// ============================================================================
// Input builders are loop-owned, not definition-owned
// ============================================================================

describe("loop-owned input builders", () => {
  test("PhaseDefinition has no buildInput field", () => {
    const definition: PhaseDefinition = {
      id: "test",
      name: "Test",
      description: "Test phase",
      run: async () => ({ message: "output", route: "stop" }),
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
    const definition: PhaseDefinition = {
      id: "test",
      name: "Test",
      description: "Test phase",
      run: async () => ({ message: "output", route: "stop" }),
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
