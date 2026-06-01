import { expect, test } from "bun:test";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentEvent, LlmRequest, StreamFn } from "../src/types";
import { createAgentState as createBaseAgentState, createMessage } from "../src/types";
import { createId } from "../src/utils";
import { echoTool } from "./support/echo-tool";
import { scriptedStream, buildTestPartial, buildToolCallPartial } from "./support/scripted-stream";
import chatPackage from "../src/loop/phases/built-in/chat/package.json";
import { createBuiltinPhaseRegistry } from "../src/extensions";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}
import {
  createPhaseRegistry,
  definePhase,
  resolvePhaseEntry,
} from "../src/loop/phases";

function createState(input: Parameters<typeof createBaseAgentState>[0]) {
  return createBaseAgentState(input);
}

function requireBuiltinPhase(id: string) {
  const registry = createBuiltinPhaseRegistry();
  const phase = resolvePhaseEntry(registry, id);
  return phase;
}

function builtinPhaseRegistryFor(ids: string[]) {
  const builtinRegistry = createBuiltinPhaseRegistry();
  const phases = ids.map((id) => {
    return resolvePhaseEntry(builtinRegistry, id);
  });

  return createPhaseRegistry({
    entryPhaseId: ids[0],
    phases,
  });
}

test("built-in phase metadata uses package.json rowan phase manifest", () => {
  const chatPhase = requireBuiltinPhase("chat");

  expect(chatPackage.rowan.extensions).toEqual(["./index.ts"]);
  expect(chatPackage.rowan.phase).toMatchObject({
    id: "chat",
    name: "Chat",
  });
  expect(chatPhase).toMatchObject({
    id: "chat",
    name: "Chat",
    description: "Decide whether to answer directly or transition to another available phase.",
  });
  expect(chatPhase.buildPrompt).toBeFunction();
});

test("default config preserves direct answer behavior", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "hello",
  });

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
  });

  expect(outcome.outcome.taskId).toBeUndefined();
  expect(outcome.outcome.message).toBe("Direct response: hello");
});

test("default config preserves task plan/execute/verify behavior", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(events).toContain("tool_execution_end");
  expect(events).toContain("phase_end");
});

test("custom phase config without verify phase skips verification", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    phaseConfig: builtinPhaseRegistryFor(["chat", "plan", "execute"]),
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(events).toContain("tool_execution_end");
});

test("custom phase plugin can replace the builtin phase machine", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "plug me in",
  });
  const events: AgentEvent[] = [];
  const customPhase = definePhase({
    id: "custom",
    name: "Custom",
    description: "Handle the run outside of the builtin phase chain.",
    async run(_context, _input) {
      return { message: "Handled by plugin: plug me in", route: "stop" };
    },
  });

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "unused" },
    stream: async function* () {},
    tools: [],
    phaseConfig: createPhaseRegistry({
      entryPhaseId: "custom",
      phases: [customPhase],
    }),
    emit: (event) => {
      events.push(event);
    },
  });

  // Non-extension phases use default behavior: run executes, then stops
  expect(events.some((event) => event.type === "phase_start" && event.phase === "custom")).toBe(true);
  expect(events.some((event) => event.type === "phase_end" && event.phase === "custom")).toBe(true);
});

test("default config preserves execute/verify retry behavior", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const task = {
    id: createId("task"),
    title: "Retry verify",
    instruction: "use echo tool",
    acceptanceCriteria: ["Echo evidence is present."],
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryVerifyStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const text = "Create task.";
      const toolId = createId("route");
      const toolArgs = JSON.stringify({ route: "plan", reason: text });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const text = JSON.stringify(task);
      const toolId = createId("route");
      const toolArgs = JSON.stringify({ route: "execute", reason: "Task planned." });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "done" };
      return;
    }
    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "echo";
      const toolArgs = JSON.stringify({ message: "retry" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial };
      // Route to verify
      const routeId = createId("route");
      const routeArgs = JSON.stringify({ route: "verify", reason: "Execution complete." });
      yield { type: "tool_call_start", id: routeId, name: "route", partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "tool_call_delta", id: routeId, arguments: routeArgs, partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "tool_call_end", id: routeId, name: "route", arguments: routeArgs, partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield { type: "model_requested", model: request.model, usage: { inputMessages: 1 } };
    const reason = verifyCalls === 1
      ? "Missing echo evidence."
      : "Verified. All acceptance criteria met.";
    const route = verifyCalls === 1 ? "execute" : "stop";
    const text = reason;
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ route, reason });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "retry-verify" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.outcome.message).toContain("Verified");
  expect(verifyCalls).toBe(2);
});

test("default config preserves max attempt exhaustion", async () => {
  const session = createState({
    systemPrompt: "Test system",
    input: "use echo tool",
  });
  const task = {
    id: createId("task"),
    title: "Fail task",
    instruction: "use echo tool",
    acceptanceCriteria: ["Echo evidence is present."],
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  const stream: StreamFn = async function* failingStream(request) {
    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      const text = "Create task.";
      const toolId = createId("route");
      const toolArgs = JSON.stringify({ route: "plan", reason: text });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const text = JSON.stringify(task);
      const toolId = createId("route");
      const toolArgs = JSON.stringify({ route: "execute", reason: "Task planned." });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
      yield { type: "done" };
      return;
    }
    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "echo";
      const toolArgs = JSON.stringify({ message: "fail" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial };
      // Route to verify
      const routeId = createId("route");
      const routeArgs = JSON.stringify({ route: "verify", reason: "Execution complete." });
      yield { type: "tool_call_start", id: routeId, name: "route", partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "tool_call_delta", id: routeId, arguments: routeArgs, partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "tool_call_end", id: routeId, name: "route", arguments: routeArgs, partial: buildToolCallPartial(routeId, "route", routeArgs) };
      yield { type: "done" };
      return;
    }

    const reason = "Always fails. Error in verification.";
    const text = reason;
    const toolId = createId("route");
    const toolArgs = JSON.stringify({ route: "stop", reason });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "tool_call_start", id: toolId, name: "route", partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: toolArgs, partial: buildToolCallPartial(toolId, "route", toolArgs) };
    yield { type: "done" };
  };

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "failing" },
    stream,
    tools: [echoTool],
    maxAttempts: 2,
  });

  expect(outcome.outcome.message).toContain("fails");
});
