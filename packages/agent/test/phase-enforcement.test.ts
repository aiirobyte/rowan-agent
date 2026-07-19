import { expect, test } from "bun:test";
import type { AssistantMessagePartial, LlmRequest } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentContext, AgentMessage, StreamFn, Tool } from "../src/types";
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

function createInputWaiter() {
  let resume: ((messages: AgentMessage[]) => void) | undefined;
  return {
    waitForInput() {
      return new Promise<AgentMessage[]>((resolve) => {
        resume = resolve;
      });
    },
    deliver(messages: AgentMessage[]) {
      const fn = resume;
      resume = undefined;
      fn?.(messages);
    },
    isPending() {
      return resume !== undefined;
    },
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

test("route to stop records a matching tool result before completing", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan" }),
  ], "plan");

  const stream: StreamFn = async function* () {
    yield* yieldRouteToolCall("stop", "Done.");
    yield { type: "done" };
  };

  const result = await runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "finish" }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
  });

  const routeCall = result.messages
    .flatMap((message) => typeof message.content === "string" ? [] : message.content)
    .find((part) => part.type === "tool_use" && part.name === "route");
  const routeCallId = routeCall?.type === "tool_use" ? routeCall.id : undefined;
  if (!routeCallId) throw new Error("Expected a route tool call in the result transcript.");

  const routeResult = result.messages
    .flatMap((message) => typeof message.content === "string" ? [] : message.content)
    .find((part) => part.type === "tool_result" && part.toolUseId === routeCallId);
  expect(routeResult).toEqual({
    type: "tool_result",
    toolUseId: routeCallId,
    content: '{"ok": true}',
  });
});


test("phase content is injected as a user context message and replaced on transition", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan", content: "You are planning." }),
    buildTestPhase({ id: "execute", content: "You are executing." }),
  ], "plan");

  let requestCount = 0;
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
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

  expect(requests).toHaveLength(2);
  expect(requests[0].messages).toContainEqual(expect.objectContaining({
    role: "user",
    content: expect.stringContaining('<phase_content name="plan">'),
  }));
  const initialPhaseContentIndex = requests[0].messages.findIndex((message) =>
    message.role === "user"
      && typeof message.content === "string"
      && message.content.includes('<phase_content name="plan">'),
  );
  const initialInputIndex = requests[0].messages.findIndex((message) =>
    message.role === "user" && message.content === "do something",
  );
  expect(initialPhaseContentIndex).toBeLessThan(initialInputIndex);
  expect(requests[1].messages).toContainEqual(expect.objectContaining({
    role: "user",
    content: expect.stringContaining('<phase_content name="execute">'),
  }));
  expect(requests[1].messages.some((message) =>
    typeof message.content === "string" && message.content.includes('<phase_content name="plan">'),
  )).toBe(false);
  const transitionPhaseContentIndex = requests[1].messages.findIndex((message) =>
    message.role === "user"
      && typeof message.content === "string"
      && message.content.includes('<phase_content name="execute">'),
  );
  const reverseTransitionInputIndex = [...requests[1].messages].reverse().findIndex((message) =>
    message.role === "user" && message.content === "do something",
  );
  const transitionInputIndex = reverseTransitionInputIndex === -1
    ? -1
    : requests[1].messages.length - 1 - reverseTransitionInputIndex;
  expect(transitionPhaseContentIndex).toBeLessThan(transitionInputIndex);

  // Phase context stays a user message; the tool message only acknowledges the
  // real route call that entered the next phase.
  const routeCall = requests[1].messages
    .flatMap((message) => typeof message.content === "string" ? [] : message.content)
    .find((part) => part.type === "tool_use" && part.name === "route");
  const routeCallId = routeCall?.type === "tool_use" ? routeCall.id : undefined;
  if (!routeCallId) throw new Error("Expected the transition request to include a route tool call.");
  const routeResult = requests[1].messages
    .flatMap((message) => typeof message.content === "string" ? [] : message.content)
    .find((part) => part.type === "tool_result" && part.toolUseId === routeCallId);
  expect(routeResult).toEqual({
    type: "tool_result",
    toolUseId: routeCallId,
    content: '{"ok": true}',
  });
  expect(requests.flatMap((request) => request.messages).some((message) =>
    message.role === "tool"
      && typeof message.content !== "string"
      && message.content.some((part) => part.type === "tool_result" && part.content.includes("<phase_content")),
  )).toBe(false);
  expect(result.messages.some((message) => message.metadata?.kind === "phase_prompt")).toBe(false);
});


test("LLM phase without a route call completes via default stop when no input channel", async () => {
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

  const result = await runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "plan this", tools: [echoTool] }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
  });

  expect(requestCount).toBe(1);
  expect(result.outcome.message).toBe("Planning done.");
});

test("missing route pauses via waitForInput and resumes the SAME phase until route:stop", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan" }),
    buildTestPhase({ id: "execute" }),
  ], "plan");
  const input = createInputWaiter();

  let requestCount = 0;
  const seenUserInputs: string[] = [];
  const seenPhasePrompts: string[] = [];
  const stream: StreamFn = async function* (request) {
    requestCount++;
    // Record user messages visible to the model this turn.
    for (const m of request.messages) {
      if (m.role === "user" && typeof m.content === "string" && !m.content.startsWith("Phase:")) {
        seenUserInputs.push(m.content);
      }
      if (m.role === "user" && typeof m.content === "string" && m.content.includes("<phase_content")) {
        seenPhasePrompts.push(m.content);
      }
    }
    const text = requestCount === 1 ? "need more info" : requestCount === 2 ? "still thinking" : "done";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    if (requestCount === 3) {
      // Only the third turn explicitly routes to stop → run() resolves.
      yield* yieldRouteToolCall("stop", "finished");
    }
    yield { type: "done" };
  };

  const runPromise = runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "plan this" }), phases },
    model: { provider: "test", id: "scripted" },
    stream,
    waitForInput: input.waitForInput,
  });

  // Turn 1 paused (missing route). Feed user message → resume same phase.
  for (let i = 0; i < 100 && !input.isPending(); i++) await Promise.resolve();
  expect(input.isPending()).toBe(true);
  input.deliver([createMessage("user", "first followup")]);

  // Turn 2 paused again. Feed another user message → resume same phase.
  for (let i = 0; i < 100 && !input.isPending(); i++) await Promise.resolve();
  input.deliver([createMessage("user", "second followup")]);

  const result = await runPromise;

  // Three model turns, all within "plan" — no phase transitions.
  expect(requestCount).toBe(3);
  expect(seenPhasePrompts).toHaveLength(3);
  expect(new Set(seenPhasePrompts).size).toBe(1);
  expect(result.metrics.phaseTransitions).toEqual([]);
  // The model saw both followups across turns (transcript is cumulative).
  expect(seenUserInputs).toEqual(expect.arrayContaining(["plan this", "first followup", "second followup"]));
  // run() resolved only via the explicit route:stop on turn 3.
  expect(result.outcome.message).toBe("finished");
});

test("aborting while paused removes the phase directive before completion", async () => {
  const phases = buildPhaseRegistry([
    buildTestPhase({ id: "plan" }),
    buildTestPhase({ id: "execute" }),
  ], "plan");
  const abortController = new AbortController();
  const input = createInputWaiter();
  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "need input", partial: buildTestPartial("need input") };
    yield { type: "done" };
  };

  const runPromise = runAgentLoop({
    context: { ...createContext({ systemPrompt: "Test", input: "plan this" }), phases },
    model: { provider: "test", id: "abort-paused" },
    stream,
    waitForInput: input.waitForInput,
    signal: abortController.signal,
  });

  for (let i = 0; i < 100 && !input.isPending(); i++) await Promise.resolve();
  abortController.abort();
  input.deliver([]);
  const result = await runPromise;

  expect(result.outcome.message).toBe("Agent run aborted.");
  expect(result.messages.some((message) => message.metadata?.kind === "phase_prompt")).toBe(false);
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
