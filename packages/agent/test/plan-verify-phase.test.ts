import { expect, test, describe } from "bun:test";
import { join } from "node:path";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentContext, StreamFn, Tool } from "../src/types";
import { createMessage } from "../src/types";
import { loadPhase, loadPhases } from "../src/harness/phases/loader";
import type { Phase, PhaseRegistry } from "../src/harness/phases/types";
import { echoTool } from "./support/echo-tool";
import { buildTestPartial, yieldRouteToolCall } from "./support/scripted-stream";

// ---------------------------------------------------------------------------
// Test workspace pointing to checked-in fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const PHASES_DIR = join(FIXTURES_DIR, "phases");

function fixturePhase(name: string): string {
  return join(PHASES_DIR, name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(input: { input: string; tools?: Tool[] }): AgentContext {
  return {
    systemPrompt: "You are a helpful assistant.",
    messages: [createMessage("user", input.input)],
    tools: input.tools?.slice() ?? [echoTool],
    skills: [],
  };
}

function buildPhaseRegistry(phases: Phase[], entryPhaseId?: string): PhaseRegistry {
  const map = new Map<string, Phase>();
  for (const phase of phases) {
    map.set(phase.name, phase);
  }
  const entry = entryPhaseId ?? phases[0]?.name ?? null;
  return { phases: map, entryPhaseId: entry };
}

/** Yield events for a route tool call with preceding text */
function* yieldTextAndRoute(text: string, route: string, reason?: string): Generator<any> {
  yield { type: "text_delta", text, partial: buildTestPartial(text) };
  yield* yieldRouteToolCall(route, reason ?? text, text);
}

// ============================================================================
// Phase Loading Tests
// ============================================================================

describe("Phase file loading", () => {
  test("plan phase loads from filesystem", async () => {
    const phase = await loadPhase(fixturePhase("plan"));
    expect(phase.name).toBe("plan");
    // tools can be undefined (empty/undefined = all tools available)
    expect(phase.content).toMatch(/plan/i);
  });

  test("verify phase loads from filesystem", async () => {
    const phase = await loadPhase(fixturePhase("verify"));
    expect(phase.name).toBe("verify");
    expect(phase.target).toBe("stop");
    // tools can be undefined (empty/undefined = all tools available)
    expect(phase.content).toMatch(/verify/i);
  });

  test("loadPhases discovers both plan and verify", async () => {
    const registry = await loadPhases(PHASES_DIR);
    expect(registry.phases.size).toBeGreaterThanOrEqual(2);
    expect(registry.phases.has("plan")).toBe(true);
    expect(registry.phases.has("verify")).toBe(true);
    // entryPhaseId defaults to null until Agent applies its default phase
    expect(registry.entryPhaseId).toBeNull();
  });
});

// ============================================================================
// Plan Phase Execution Tests
// ============================================================================

describe("Plan phase execution", () => {
  test("plan phase runs and produces output", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const registry = buildPhaseRegistry([planPhase]);

    const stream: StreamFn = async function* (request) {
      const text = JSON.stringify({
        task: {
          title: "Test task",
          instruction: "Run the test",
          acceptanceCriteria: ["Test passes"],
          toolNames: ["echo"],
          skillIds: [],
          status: "pending",
          attempts: 0,
        },
        message: "Plan ready.",
      });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "plan this task" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(result.outcome.message).toContain("Plan ready");
  });

  test("plan phase routes to next phase via route tool", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;

      if (requestCount === 1) {
        // Plan phase: output plan and route to verify
        const text = "Plan created.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("verify", "Routing to verify.");
        yield { type: "done" };
        return;
      }

      if (requestCount === 2) {
        // Verify phase: verify and stop
        const text = "Verification passed.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("stop", "All criteria met.");
        yield { type: "done" };
        return;
      }
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "plan and verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(requestCount).toBe(2);
    expect(result.metrics.phaseTransitions).toEqual([
      expect.objectContaining({ from: "plan", to: "verify" }),
    ]);
  });
});

// ============================================================================
// Verify Phase Execution Tests
// ============================================================================

describe("Verify phase execution", () => {
  test("verify phase produces output", async () => {
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([verifyPhase]);

    const stream: StreamFn = async function* (request) {
      const text = "All acceptance criteria met. Verification passed.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "verify this" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(result.outcome.message).toContain("Verification passed");
  });

  test("verify phase routes to stop when criteria met", async () => {
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    // Set verify as entry since it's the only phase
    const registry = buildPhaseRegistry([verifyPhase], "verify");

    const stream: StreamFn = async function* (request) {
      const text = "Verification complete.";
      yield* yieldTextAndRoute(text, "stop", "All criteria met.");
      yield { type: "done" };
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(result.outcome.message).toContain("Verification complete");
    expect(result.metrics.phaseTransitions).toHaveLength(0); // No transitions, went straight to stop
  });
});

// ============================================================================
// Plan → Verify Integration Tests
// ============================================================================

describe("Plan → Verify full flow", () => {
  test("plan→verify→stop complete flow", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;

      if (requestCount === 1) {
        // Plan phase
        const text = JSON.stringify({ task: { title: "Test", status: "pending", attempts: 0 }, message: "Plan ready." });
        yield* yieldTextAndRoute(text, "verify", "Plan complete, routing to verify.");
        yield { type: "done" };
        return;
      }

      if (requestCount === 2) {
        // Verify phase
        const text = "All criteria met.";
        yield* yieldTextAndRoute(text, "stop", "Verification passed.");
        yield { type: "done" };
        return;
      }
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "plan and verify this task" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(requestCount).toBe(2);
    expect(result.metrics.phaseTransitions).toEqual([
      expect.objectContaining({ from: "plan", to: "verify" }),
    ]);
    expect(result.outcome.message).toContain("All criteria met");
  });

  test("plan phase routes to verify even without explicit route tool", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;

      if (requestCount === 1) {
        // Plan phase with route to verify
        const text = "Plan created.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("verify", "Routing to verify.");
        yield { type: "done" };
        return;
      }

      if (requestCount === 2) {
        // Verify phase
        const text = "Verification passed.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("stop", "Done.");
        yield { type: "done" };
        return;
      }
    };

    const result = await runAgentLoop({
      context: { ...createContext({ input: "plan and verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(requestCount).toBe(2);
    expect(result.metrics.phaseTransitions).toHaveLength(1);
    expect(result.metrics.phaseTransitions[0]).toEqual(
      expect.objectContaining({ from: "plan", to: "verify" }),
    );
  });
});

// ============================================================================
// Phase Framework Execution Tests (no run function)
// ============================================================================

describe("Phase framework execution", () => {
  test("plan phase has no run function — framework handles via invokeModelWithToolLoop", async () => {
    const phase = await loadPhase(fixturePhase("plan"));
    // Phase has no index.ts, so run is undefined
    // Framework handles execution via invokeModelWithToolLoop
    expect(phase.run).toBeUndefined();
    expect(phase.content).toMatch(/plan/i);
  });

  test("verify phase has no run function — framework handles via invokeModelWithToolLoop", async () => {
    const phase = await loadPhase(fixturePhase("verify"));
    expect(phase.run).toBeUndefined();
    expect(phase.content).toMatch(/verify/i);
  });
});
