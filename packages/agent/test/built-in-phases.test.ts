import { expect, test } from "bun:test";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentEvent, LlmRequest, StreamFn } from "../src/types";
import { createAgentState as createBaseAgentState, createId, createMessage } from "../src/types";
import { echoTool } from "./support/echo-tool";
import { scriptedStream, buildTestPartial, buildToolCallPartial } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}
import {
  chatPhaseDefinition,
  createPhaseConfig,
  definePhase,
  definePhasePlugin,
  planPhaseDefinition,
  executePhaseDefinition,
} from "../src/loop/phases";

function createState(input: Parameters<typeof createBaseAgentState>[0]) {
  return createBaseAgentState(input);
}

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

  expect(outcome.outcome.passed).toBe(true);
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

  expect(outcome.outcome.passed).toBe(true);
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
    phaseConfig: createPhaseConfig({
      entryPhaseId: "chat",
      plugins: [
        definePhasePlugin({
          id: "no-verify",
          phases: [
            chatPhaseDefinition,
            planPhaseDefinition,
            executePhaseDefinition,
          ],
        }),
      ],
    }),
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.outcome.passed).toBe(true);
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
    phaseConfig: createPhaseConfig({
      plugins: [
        definePhasePlugin({
          id: "custom-plugin",
          entryPhaseId: "custom",
          phases: [customPhase],
        }),
      ],
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
      const text = JSON.stringify({ route: "plan", message: "Create task." });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const text = JSON.stringify(task);
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
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
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield { type: "model_requested", model: request.model, usage: { inputMessages: 1 } };
    if (verifyCalls === 1) {
      const text = JSON.stringify({ passed: false, message: "Missing echo evidence.", route: "execute" });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
    } else {
      const text = JSON.stringify({ passed: true, message: "Verified. All acceptance criteria met.", route: "stop" });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
    }
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

  expect(outcome.outcome.passed).toBe(true);
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
      const text = JSON.stringify({ route: "plan", message: "Create task." });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }
    if (phase === "plan") {
      const text = JSON.stringify(task);
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
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
      yield { type: "done" };
      return;
    }

    const text = "Always fails. Error in verification.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
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

  expect(outcome.outcome.passed).toBe(false);
  expect(outcome.outcome.message).toContain("fails");
});
