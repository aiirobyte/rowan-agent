import { expect, test, describe } from "bun:test";
import { join } from "node:path";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentContext, StreamFn, Tool } from "../src/types";
import { createMessage } from "../src/types";
import { loadPhase, loadPhases } from "../src/harness/phases/loader";
import type { Phase, PhaseRegistry } from "../src/harness/phases/types";
import { echoTool } from "./support/echo-tool";
import { buildTestPartial, yieldRouteToolCall } from "./support/scripted-stream";
import { extractRouteCall } from "../src/harness/tools/route-tool";
import { jsonToXml } from "../src/harness/context/resource-formatter";
import { createDefaultPhase } from "../src/harness/phases";

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
  const defaultPhase = createDefaultPhase();
  return {
    systemPrompt: "You are a helpful assistant.",
    messages: [createMessage("user", input.input)],
    tools: input.tools?.slice() ?? [echoTool],
    skills: [],
    phases: { phases: new Map([[defaultPhase.name, defaultPhase]]), entryPhaseId: defaultPhase.name },
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
function* yieldTextAndRoute(text: string, route: string, reason?: string, payload?: unknown): Generator<any> {
  yield { type: "text_delta", text, partial: buildTestPartial(text) };
  yield* yieldRouteToolCallWithPayload(route, reason ?? text, text, payload);
}

/** Yield events for a route tool call with payload */
function* yieldRouteToolCallWithPayload(route: string, reason: string, text: string, payload?: unknown): Generator<any> {
  const target: Record<string, unknown> = { phase: route, reason };
  if (payload !== undefined) {
    target.payload = payload;
  }
  const args = { decision: [target], instruction: undefined };
  const argsJson = JSON.stringify(args);
  const toolId = "route_1";
  const contentBlocks: any[] = [];
  if (text) {
    contentBlocks.push({ type: "text", text });
  }
  contentBlocks.push({ type: "tool_call", id: toolId, name: "route", args: argsJson });
  const partial = {
    role: "assistant" as const,
    contentBlocks,
  };
  yield { type: "tool_call_start", id: toolId, name: "route", partial };
  yield { type: "tool_call_delta", id: toolId, arguments: argsJson, partial };
  yield { type: "tool_call_end", id: toolId, name: "route", arguments: argsJson, partial };
}

// ============================================================================
// Route Tool Payload Tests
// ============================================================================

describe("Route tool payload", () => {
  test("extractRouteCall extracts payload from tool calls", () => {
    const toolCalls = [
      { name: "route", args: { decision: [{ phase: "verify", reason: "done", payload: { items: ["a", "b"], count: 2 } }] } },
    ];
    const result = extractRouteCall(toolCalls);
    expect(result).toBeDefined();
    expect(result!.decision[0].phase).toBe("verify");
    expect(result!.decision[0].payload).toEqual({ items: ["a", "b"], count: 2 });
  });

  test("extractRouteCall returns undefined payload when not provided", () => {
    const toolCalls = [
      { name: "route", args: { decision: [{ phase: "stop", reason: "done" }] } },
    ];
    const result = extractRouteCall(toolCalls);
    expect(result).toBeDefined();
    expect(result!.decision[0].phase).toBe("stop");
    expect(result!.decision[0].payload).toBeUndefined();
  });

  test("extractRouteCall handles array payload", () => {
    const toolCalls = [
      { name: "route", args: { decision: [{ phase: "next", payload: ["x", "y"] }] } },
    ];
    const result = extractRouteCall(toolCalls);
    expect(result!.decision[0].payload).toEqual(["x", "y"]);
  });

  test("extractRouteCall handles primitive payload", () => {
    const toolCalls = [
      { name: "route", args: { decision: [{ phase: "next", payload: "hello" }] } },
    ];
    const result = extractRouteCall(toolCalls);
    expect(result!.decision[0].payload).toBe("hello");
  });
});

// ============================================================================
// jsonToXml Tests
// ============================================================================

describe("jsonToXml", () => {
  test("converts object to XML elements", () => {
    const result = jsonToXml({ count: 2, name: "test" }, 0);
    expect(result).toContain("<count>2</count>");
    expect(result).toContain("<name>test</name>");
  });

  test("converts array to <item> elements", () => {
    const result = jsonToXml(["a", "b", "c"], 0);
    expect(result).toContain("<item>a</item>");
    expect(result).toContain("<item>b</item>");
    expect(result).toContain("<item>c</item>");
  });

  test("converts nested object", () => {
    const result = jsonToXml({ items: ["a", "b"], meta: { count: 2 } }, 0);
    expect(result).toContain("<items>");
    expect(result).toContain("<item>a</item>");
    expect(result).toContain("<item>b</item>");
    expect(result).toContain("<meta>");
    expect(result).toContain("<count>2</count>");
  });

  test("handles primitives", () => {
    expect(jsonToXml("hello", 0)).toBe("hello");
    expect(jsonToXml(42, 0)).toBe("42");
    expect(jsonToXml(true, 0)).toBe("true");
  });

  test("handles null/undefined", () => {
    expect(jsonToXml(null, 0)).toBe("");
    expect(jsonToXml(undefined, 0)).toBe("");
  });

  test("escapes XML special characters", () => {
    const result = jsonToXml({ key: "<script>alert('xss')</script>" }, 0);
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });

  test("respects depth indentation", () => {
    const result = jsonToXml({ a: 1 }, 2);
    expect(result).toBe("    <a>1</a>");
  });
});

// ============================================================================
// Phase Payload Integration Tests
// ============================================================================

describe("Phase payload flow", () => {
  test("PhaseOutput.payload populated from route tool call", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;
      if (requestCount === 1) {
        const text = "Plan created.";
        yield* yieldTextAndRoute(text, "verify", "Plan complete.", { items: ["a", "b"], count: 2 });
        yield { type: "done" };
        return;
      }
      if (requestCount === 2) {
        const text = "Verified.";
        yield* yieldTextAndRoute(text, "stop", "Done.", { final: true, count: 2 });
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
    expect(result.outcome.message).toContain("Verified");
    expect(result.outcome.payload).toEqual({ final: true, count: 2 });
  });

  test("payload passes through phase transition", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    // Track messages to verify payload injection
    const messages: string[] = [];

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;
      // Capture user context messages sent to the model.
      for (const msg of request.messages) {
        if (msg.role === "user" && typeof msg.content === "string") {
          messages.push(msg.content);
        }
      }

      if (requestCount === 1) {
        const text = "Plan ready.";
        yield* yieldTextAndRoute(text, "verify", "Routing to verify.", { result: "ok" });
        yield { type: "done" };
        return;
      }
      if (requestCount === 2) {
        const text = "Verified.";
        yield* yieldTextAndRoute(text, "stop", "Done.");
        yield { type: "done" };
        return;
      }
    };

    await runAgentLoop({
      context: { ...createContext({ input: "plan and verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    // The second request (verify phase) should have the payload in its messages
    expect(requestCount).toBe(2);
    const verifyMessages = messages.filter(m => m.includes("<prev_phase_outputs>"));
    expect(verifyMessages.length).toBeGreaterThanOrEqual(1);
    // Check that the payload content is present (XML format)
    expect(verifyMessages.some(m => m.includes("<result>ok</result>"))).toBe(true);
  });

  test("no payload when route tool has no payload", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    const messages: string[] = [];

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;
      for (const msg of request.messages) {
        if (msg.role === "user" && typeof msg.content === "string") {
          messages.push(msg.content);
        }
      }

      if (requestCount === 1) {
        const text = "Plan ready.";
        yield* yieldTextAndRoute(text, "verify", "Routing to verify.");
        yield { type: "done" };
        return;
      }
      if (requestCount === 2) {
        const text = "Verified.";
        yield* yieldTextAndRoute(text, "stop", "Done.");
        yield { type: "done" };
        return;
      }
    };

    await runAgentLoop({
      context: { ...createContext({ input: "plan and verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    // No phase_input should appear when no payload
    const payloadMessages = messages.filter(m => m.includes("phase_input"));
    expect(payloadMessages.length).toBe(0);
  });

  test("string payload is normalized to object for jsonToXml", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    const messages: string[] = [];

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;
      // Capture user context messages sent to the model.
      for (const msg of request.messages) {
        if (msg.role === "user" && typeof msg.content === "string") {
          messages.push(msg.content);
        }
      }

      if (requestCount === 1) {
        const text = "Plan ready.";
        // Send payload as a JSON string (simulating LLM behavior)
        const stringPayload = JSON.stringify({ prompt: "test image", style: "oil painting", quality: "high" });
        yield* yieldTextAndRoute(text, "verify", "Routing to verify.", stringPayload);
        yield { type: "done" };
        return;
      }
      if (requestCount === 2) {
        const text = "Verified.";
        yield* yieldTextAndRoute(text, "stop", "Done.");
        yield { type: "done" };
        return;
      }
    };

    await runAgentLoop({
      context: { ...createContext({ input: "plan and verify" }), phases: registry },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    // The second request (verify phase) should have the payload in its messages
    expect(requestCount).toBe(2);
    const verifyMessages = messages.filter(m => m.includes("<prev_phase_outputs>"));
    expect(verifyMessages.length).toBeGreaterThanOrEqual(1);
    // Check that the string payload was parsed and converted to XML elements
    expect(verifyMessages.some(m => m.includes("<prompt>test image</prompt>"))).toBe(true);
    expect(verifyMessages.some(m => m.includes("<style>oil painting</style>"))).toBe(true);
    expect(verifyMessages.some(m => m.includes("<quality>high</quality>"))).toBe(true);
    // Should NOT contain raw JSON string
    expect(verifyMessages.some(m => m.includes("{&quot;prompt&quot;"))).toBe(false);
  });
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe("Backward compatibility", () => {
  test("existing plan→verify flow works unchanged", async () => {
    const planPhase = await loadPhase(fixturePhase("plan"));
    const verifyPhase = await loadPhase(fixturePhase("verify"));
    const registry = buildPhaseRegistry([planPhase, verifyPhase]);

    let requestCount = 0;
    const stream: StreamFn = async function* (request) {
      requestCount++;
      if (requestCount === 1) {
        const text = "Plan ready.";
        yield* yieldTextAndRoute(text, "verify", "Plan complete.");
        yield { type: "done" };
        return;
      }
      if (requestCount === 2) {
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

  test("default loop (no phases) works unchanged", async () => {
    const stream: StreamFn = async function* (request) {
      const text = "Hello, world!";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
    };

    const result = await runAgentLoop({
      context: createContext({ input: "say hello" }),
      model: { provider: "test", id: "scripted" },
      stream,
    });

    expect(result.outcome.message).toContain("Hello, world!");
  });
});
