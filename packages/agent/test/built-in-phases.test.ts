import { expect, test } from "bun:test";
import { runAgentLoop } from "../src/loop";
import { createDefaultCriteria } from "@rowan-agent/agent";
import type { AgentEvent, StreamFn } from "../src/types";
import { createAgentState as createBaseAgentState, createId, createMessage } from "../src/types";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";
import {
  chatPhaseDefinition,
  createAgentPhaseConfig,
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
    phaseConfig: createAgentPhaseConfig({
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
  const customPhase = definePhase<{ input: string }, { message: string }>({
    id: "custom",
    name: "Custom",
    description: "Handle the run outside of the builtin phase chain.",
    buildInput(runtime) {
      return { input: runtime.agentState.input };
    },
    async run(_context, input) {
      return { message: `Handled by plugin: ${input.input}` };
    },
    async apply(_runtime, output) {
      return {
        type: "stop",
        outcome: {
          id: createId("out"),
          passed: true,
          message: output.message,
        },
      };
    },
  });

  const outcome = await runAgentLoop({
    kind: "run",
    state: session,
    model: { provider: "test", name: "unused" },
    stream: async function* () {},
    tools: [],
    phaseConfig: createAgentPhaseConfig({
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

  expect(outcome.outcome.message).toBe("Handled by plugin: plug me in");
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
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  let verifyCalls = 0;
  const stream: StreamFn = async function* retryVerifyStream(model, context) {
    if (context.phase === "chat") {
      yield { type: "structured_output", content: { route: "plan", message: "Create task." } };
      yield { type: "done" };
      return;
    }
    if (context.phase === "plan") {
      yield { type: "structured_output", content: task };
      yield { type: "done" };
      return;
    }
    if (context.phase === "execute") {
      yield {
        type: "tool_call",
        toolCall: { id: createId("call"), name: "echo", args: { message: "retry" } },
      };
      yield { type: "done" };
      return;
    }

    verifyCalls += 1;
    yield { type: "model_requested", phase: "verify", model, usage: { inputMessages: 1 } };
    if (verifyCalls === 1) {
      yield {
        type: "structured_output",
        content: { passed: false, message: "Missing echo evidence." },
      };
    } else {
      yield {
        type: "structured_output",
        content: { passed: true, message: "Verified after retry." },
      };
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
  expect(outcome.outcome.message).toBe("Verified after retry.");
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
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending" as const,
    attempts: 0,
  };
  const stream: StreamFn = async function* failingStream(_model, context) {
    if (context.phase === "chat") {
      yield { type: "structured_output", content: { route: "plan", message: "Create task." } };
      yield { type: "done" };
      return;
    }
    if (context.phase === "plan") {
      yield { type: "structured_output", content: task };
      yield { type: "done" };
      return;
    }
    if (context.phase === "execute") {
      yield {
        type: "tool_call",
        toolCall: { id: createId("call"), name: "echo", args: { message: "fail" } },
      };
      yield { type: "done" };
      return;
    }

    yield {
      type: "structured_output",
      content: { passed: false, message: "Always fails." },
    };
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
  expect(outcome.outcome.message).toBe("Always fails.");
});
