import { expect, test } from "bun:test";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import { MissingRouteToolCallError } from "../src";
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
  const toolArgs = JSON.stringify({ decision: [{ phase: route, reason }], instruction: undefined });
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
    context: { ...createContext({ systemPrompt: "Test", input: "do something", tools: [echoTool] }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
  });

  expect(requestCount).toBe(2);
  expect(result.metrics.phaseTransitions).toEqual([
    expect.objectContaining({ from: "plan", to: "execute" }),
  ]);
});


test("phase tool_result message is cleaned up on route transition", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan", content: "You are planning." }),
    buildTestPhase({ id: "execute", content: "You are executing." }),
  ], "plan");

  let requestCount = 0;
  const stream: StreamFn = async function* (request) {
    requestCount++;
    if (requestCount === 1) {
      yield { type: "text_delta", text: "Done.", partial: buildTestPartial("Done.") };
      yield* yieldRouteToolCall("execute", "Move to execute.");
      yield { type: "done" };
      return;
    }
    if (requestCount === 2) {
      yield { type: "text_delta", text: "Executed.", partial: buildTestPartial("Executed.") };
      yield* yieldRouteToolCall("stop", "All done.");
      yield { type: "done" };
      return;
    }
  };

  const result = await runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "do something" }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
  });

  // Both phase transitions happened
  expect(result.metrics.phaseTransitions).toEqual([
    expect.objectContaining({ from: "plan", to: "execute" }),
  ]);

  // Synthetic phase tool_result messages should NOT be in the final messages
  const phaseMessages = result.messages.filter(
    m => m.role === "tool" && Array.isArray(m.content) &&
      m.content.some((c: any) => c.toolUseId?.startsWith("phase_")),
  );
  expect(phaseMessages).toHaveLength(0);
});


test("LLM phase errors when route tool is available but not called", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({
      id: "plan",
      tools: ["echo"],
    }),
    buildTestPhase({ id: "execute" }),
  ], "plan");

  let requestCount = 0;
  const stream: StreamFn = async function* () {
    requestCount++;
    const text = "Planning done.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await expect(
    runAgentLoop({
      context: { ...createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }), phases },
      model: { provider: "test", id: "scripted" },
      stream,
    }),
  ).rejects.toThrow(MissingRouteToolCallError);
  expect(requestCount).toBe(1);
});

test("LLM phase with forced target does not require route tool call", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan", target: "execute" }),
    buildTestPhase({ id: "execute", target: "stop" }),
  ], "plan");

  const events: string[] = [];
  const stream: StreamFn = async function* () {
    const text = "Phase done.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };

  await runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "plan this" }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
    emit: event => {
      events.push(event.type);
    },
  });

  expect(events).toContain("phase_end");
});
