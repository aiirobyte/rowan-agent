import { expect, test, describe } from "bun:test";
import type { PhaseContext, PhaseDefinition } from "../src/loop/phases";
import type { AgentLoopConfig, AgentRunState } from "../src/loop/types";
import { createLoopLifecycle } from "../src/agent-loop";
import { createMessage } from "../src/types";
import { createBuiltinPhaseRegistry } from "../src/extensions";
import { resolvePhaseEntry } from "../src/loop/phases";

const builtinPhaseRegistry = createBuiltinPhaseRegistry();

function requireBuiltinPhase(id: string): PhaseDefinition {
  return resolvePhaseEntry(builtinPhaseRegistry, id);
}

const chatPhase = requireBuiltinPhase("chat");
const planPhase = requireBuiltinPhase("plan");
const executePhase = requireBuiltinPhase("execute");
const verifyPhase = requireBuiltinPhase("verify");

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
      depth: { threadDepth: 0, maxThreadDepth: 4 },
      transcript: [],
      metrics: {
        iterations: 0,
        phaseTransitions: [],
        compactionCount: 0,
        retryCount: 0,
        startedAt: new Date().toISOString(),
        startedAtMs: Date.now(),
      },
    },
    messages: {
      visible: () => [],
      start: () => "msg_1",
      update: async () => {},
      end: async () => {},
      snapshot: () => ({ transcriptLength: 0, stateMessagesLength: 0 }),
      restore: () => {},
    },
    toolExecution: {
      start: async () => {},
      update: async () => {},
      end: async () => {},
    },
    model: {
      invoke: async () => ({ text: "", contentBlocks: [], toolCalls: [] }),
    },
    tools: {
      execute: async () => ({ toolCallId: "tc", toolName: "t", ok: true, content: null }),
    },
    threads: {
      create: async () => {
        throw new Error("not implemented");
      },
    },
    skills: [],
    turn: async (fn) => fn(),
    incrementAttempt: () => {},
    availablePhases: [],
    routeDecision: () => undefined,
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

    const output = await definition.run!(context, builtInput);

    expect(output).toEqual({ message: "output", route: "stop" });
  });

  test("runPhase returns output with route for transitions", async () => {
    const { state } = createTestLifecycle();
    const context = createTestContext(state);

    const definition = testPhase({
      id: "test",
      run: async () => ({ message: "answer", route: "stop" }),
    });

    const output = await definition.run!(context, {
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

    await definition.run!(context, {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    });

    expect(receivedContext).toBeDefined();
    expect(receivedContext).toHaveProperty("phaseId");
    expect(receivedContext).toHaveProperty("messages");
    expect(receivedContext).toHaveProperty("toolExecution");
    expect(receivedContext).toHaveProperty("model");
    expect(receivedContext).toHaveProperty("tools");
    expect(receivedContext).not.toHaveProperty("agentState");
    expect(receivedContext).not.toHaveProperty("currentTask");
    expect(receivedContext).not.toHaveProperty("attempt");
  });

  test("runPhase provides messages with visible, start, update, end", async () => {
    const { state } = createTestLifecycle();
    const context = createTestContext(state);

    let receivedMessages: unknown;

    const definition = testPhase({
      id: "test",
      run: async (ctx) => {
        receivedMessages = ctx.messages;
        return { message: "", route: "stop" };
      },
    });

    await definition.run!(context, {
      phase: "test",
      systemPrompt: "test",
      messages: [],
      tools: [],
      skills: [],
    });

    expect(receivedMessages).toHaveProperty("visible");
    expect(receivedMessages).toHaveProperty("start");
    expect(receivedMessages).toHaveProperty("update");
    expect(receivedMessages).toHaveProperty("end");
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
    expect(chatPhase).not.toHaveProperty("buildInput");
  });

  test("built-in plan phase definition does not include buildInput", () => {
    expect(planPhase).not.toHaveProperty("buildInput");
  });

  test("built-in execute phase definition does not include buildInput", () => {
    expect(executePhase).not.toHaveProperty("buildInput");
  });

  test("built-in verify phase definition does not include buildInput", () => {
    expect(verifyPhase).not.toHaveProperty("buildInput");
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
    expect(chatPhase).not.toHaveProperty("apply");
  });

  test("built-in plan phase definition does not include apply", () => {
    expect(planPhase).not.toHaveProperty("apply");
  });

  test("built-in execute phase definition does not include apply", () => {
    expect(executePhase).not.toHaveProperty("apply");
  });

  test("built-in verify phase definition does not include apply", () => {
    expect(verifyPhase).not.toHaveProperty("apply");
  });
});

// ============================================================================
// Built-in phase modules do not require AgentLoopRuntime
// ============================================================================

describe("built-in phase runtime boundary", () => {
  test("built-in phase definitions have no buildInput or apply", () => {
    expect(chatPhase).not.toHaveProperty("buildInput");
    expect(chatPhase).not.toHaveProperty("apply");
    expect(planPhase).not.toHaveProperty("buildInput");
    expect(planPhase).not.toHaveProperty("apply");
    expect(executePhase).not.toHaveProperty("buildInput");
    expect(executePhase).not.toHaveProperty("apply");
    expect(verifyPhase).not.toHaveProperty("buildInput");
    expect(verifyPhase).not.toHaveProperty("apply");
  });
});
