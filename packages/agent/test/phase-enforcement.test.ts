import { expect, test } from "bun:test";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentContext, StreamFn, Tool } from "../src/types";
import { createMessage } from "../src/types";
import type { Phase, PhaseRegistry } from "../src/harness/phases/types";
import { createId } from "../src/utils";
import { echoTool } from "./support/echo-tool";
import { buildTestPartial, buildToolCallPartial } from "./support/scripted-stream";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestPhase(overrides: Partial<Phase> & { id: string }): Phase {
  return {
    name: overrides.id,
    description: `${overrides.id} phase`,
    entry: false,
    filePath: "",
    baseDir: "",
    content: "",
    buildPrompt: () => `You are in the ${overrides.id} phase.`,
    ...overrides,
  };
}

function buildPhaseRegistry(phases: Phase[]): PhaseRegistry {
  const map = new Map<string, Phase>();
  for (const phase of phases) {
    map.set(phase.id, phase);
  }
  const entry = phases.find(p => p.entry)?.id ?? phases[0]?.id ?? null;
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
    buildTestPhase({ id: "plan", entry: true }),
    buildTestPhase({ id: "execute" }),
  ]);

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

test("forced routing turn fires when LLM calls tools but forgets route", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan", entry: true }),
    buildTestPhase({ id: "execute" }),
  ]);

  let requestCount = 0;
  const capturedToolChoices: unknown[] = [];
  const capturedToolNames: string[][] = [];
  const stream: StreamFn = async function* (request) {
    requestCount++;
    capturedToolChoices.push(request.toolChoice);
    capturedToolNames.push(request.tools?.map((t: any) => t.name) ?? []);

    if (requestCount === 1) {
      // Plan phase, round 1: echo tool only, no route
      const toolId = createId("call");
      const toolArgs = JSON.stringify({ message: "evidence" });
      const partial = buildToolCallPartial(toolId, "echo", toolArgs);
      yield { type: "tool_call_start", id: toolId, name: "echo", partial };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
      yield { type: "tool_call_end", id: toolId, name: "echo", arguments: toolArgs, partial };
      yield { type: "done" };
      return;
    }

    if (requestCount === 2) {
      // Plan phase, round 2: text only, no tool calls → LLM forgot to route → forces routing
      const text = "Here's what I found.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    if (requestCount === 3) {
      // Forced routing turn: route tool only
      yield* yieldRouteToolCall("execute", "Proceeding to execution.");
      yield { type: "done" };
      return;
    }

    if (requestCount === 4) {
      // Execute phase: text + route → stops
      const text = "Done.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("stop", "Complete.");
      yield { type: "done" };
      return;
    }
  };

  const result = await runAgentLoop({
    context: createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream,
    phases,
  });

  // 4 model invocations: 2 work rounds + 1 forced routing + 1 execute phase
  expect(requestCount).toBe(4);

  // Forced routing turn (request 3): only route tool, forced toolChoice
  expect(capturedToolNames[2]).toEqual(["route"]);
  expect(capturedToolChoices[2]).toEqual({ type: "tool", name: "route" });

  // Route extracted from forced turn → transitioned to execute
  expect(result.metrics.phaseTransitions).toEqual([
    expect.objectContaining({ from: "plan", to: "execute" }),
  ]);
});

test("forced routing turn fires on text-only response without route", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan", entry: true }),
    buildTestPhase({ id: "execute" }),
  ]);

  let requestCount = 0;
  const stream: StreamFn = async function* (request) {
    requestCount++;

    if (requestCount === 1) {
      // Plan phase: plain text, no tools at all → forces routing
      const text = "Here's my analysis.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    if (requestCount === 2) {
      // Forced routing turn
      yield* yieldRouteToolCall("execute", "Moving to execute.");
      yield { type: "done" };
      return;
    }

    if (requestCount === 3) {
      // Execute phase: text + route → stops
      const text = "Done.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("stop", "Complete.");
      yield { type: "done" };
      return;
    }
  };

  const result = await runAgentLoop({
    context: createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream,
    phases,
  });

  expect(requestCount).toBe(3);
  expect(result.metrics.phaseTransitions).toEqual([
    expect.objectContaining({ from: "plan", to: "execute" }),
  ]);
});

test("forced routing turn appends routing directive to existing phase prompt", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({
      id: "plan",
      entry: true,
      buildPrompt: () => "You are in the planning phase. Create a task plan.",
    }),
    buildTestPhase({ id: "execute" }),
  ]);

  let requestCount = 0;
  const capturedSystems: string[] = [];
  const stream: StreamFn = async function* (request) {
    requestCount++;
    capturedSystems.push(request.system ?? "");

    if (requestCount === 1) {
      // Text only, no route → forces routing
      const text = "Thinking...";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    if (requestCount === 2) {
      // Forced routing turn
      yield* yieldRouteToolCall("execute", "Done.");
      yield { type: "done" };
      return;
    }

    if (requestCount === 3) {
      // Execute phase
      const text = "Executed.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("stop", "Complete.");
      yield { type: "done" };
      return;
    }
  };

  await runAgentLoop({
    context: createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream,
    phases,
  });

  expect(requestCount).toBe(3);
  // Forced routing turn's system prompt should contain the original phase prompt + routing directive
  expect(capturedSystems[1]).toContain("You are in the planning phase. Create a task plan.");
  expect(capturedSystems[1]).toContain("Routing Required");
  expect(capturedSystems[1]).toContain("You MUST call the `route` tool now");
});

test("phase with tools restricted to exclude route returns stop gracefully", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({
      id: "plan",
      entry: true,
      tools: ["echo"], // route tool excluded
    }),
    buildTestPhase({ id: "execute" }),
  ]);

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
