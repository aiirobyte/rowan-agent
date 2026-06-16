import { expect, test } from "bun:test";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentContext, StreamFn, Tool } from "../src/types";
import { createMessage } from "../src/types";
import type { Phase, PhaseRegistry } from "../src/harness/phases/types";
import { createId } from "../src/utils";
import { echoTool } from "./support/echo-tool";
import { buildTestPartial } from "./support/scripted-stream";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestPhase(overrides: Partial<Phase> & { id: string }): Phase {
  return {
    name: overrides.id,
    description: `${overrides.id} phase`,
    filePath: "",
    baseDir: "",
    content: "",
    ...overrides,
  };
}

function buildPhaseRegistry(phases: Phase[], entryPhaseId?: string): PhaseRegistry {
  const map = new Map<string, Phase>();
  for (const phase of phases) {
    map.set(phase.id, phase);
  }
  const entry = entryPhaseId ?? phases[0]?.id ?? null;
  return { phases: map, entryPhaseId: entry };
}

function createContext(input: { systemPrompt: string; input: string; tools?: Tool[] }): AgentContext {
  return {
    systemPrompt: input.systemPrompt,
    messages: [createMessage("user", input.input)],
    tools: input.tools?.slice() ?? [],
    skills: [],
  };
}

/** Yield events for a route tool call */
function* yieldRouteToolCall(route: string, reason?: string): Generator<any> {
  const toolId = createId("route");
  const toolArgs = JSON.stringify({ route, reason });
  const partial: AssistantMessagePartial = {
    role: "assistant",
    contentBlocks: [
      ...(reason ? [{ type: "text" as const, text: reason }] : []),
      { type: "tool_call" as const, id: toolId, name: "route", args: toolArgs },
    ],
  };
  yield { type: "tool_call_start", id: toolId, name: "route", partial };
  yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
  yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("route in same turn extracts route normally — no forced routing", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan" }),
    buildTestPhase({ id: "execute" }),
  ], "plan");

  let requestCount = 0;
  const stream: StreamFn = async function* (request) {
    requestCount++;

    if (requestCount === 1) {
      // Plan phase: text + route only (no executable tools) → route extracted
      const text = "Planning done.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("execute", "Plan complete.");
      yield { type: "done" };
      return;
    }

    if (requestCount === 2) {
      // Execute phase: text + route → stops
      const text = "Execution done.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("stop", "All done.");
      yield { type: "done" };
      return;
    }
  };

  const result = await runAgentLoop({
    context: createContext({ systemPrompt: "Test", input: "do something", tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream,
    phases,
  });

  expect(requestCount).toBe(2);
  expect(result.metrics.phaseTransitions).toEqual([
    expect.objectContaining({ from: "plan", to: "execute" }),
  ]);
});


test("phase with tools restricted to exclude route returns stop gracefully", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({
      id: "plan",
      tools: ["echo"], // route tool excluded
    }),
    buildTestPhase({ id: "execute" }),
  ], "plan");

  let requestCount = 0;
  const stream: StreamFn = async function* (request) {
    requestCount++;
    // Text only, no route (route tool not available to the LLM anyway)
    const text = "Planning done.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  const result = await runAgentLoop({
    context: createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream,
    phases,
  });

  // Only 1 model invocation — forceRoutingTurn returns stop immediately (no route tool available)
  expect(requestCount).toBe(1);
  // No transitions — defaults to stop
  expect(result.metrics.phaseTransitions).toHaveLength(0);
});
