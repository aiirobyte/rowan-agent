import { expect, test } from "bun:test";
import Type from "typebox";
import { runAgentLoop } from "../src/agent-loop";
import { createSession } from "../src/session";
import { echoTool } from "../src/tools";
import { createDefaultCriteria } from "../src/task";
import type { StreamFn, Tool } from "../src/types";
import { createId } from "../src/types";
import { scriptedStream } from "./support/scripted-stream";

test("runAgentLoop completes task with echo tool and verification", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "use echo tool",
  });
  const events: string[] = [];

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    emit: (event) => {
      events.push(event.type);
    },
  });

  expect(outcome.passed).toBe(true);
  expect(outcome.evidence.length).toBeGreaterThan(0);
  expect(events).toContain("task_created");
  expect(events).toContain("tool_call_end");
  expect(events).toContain("verification_end");
  expect(events).toContain("outcome");
  expect(session.messages.some((message) => message.role === "tool")).toBe(true);
  expect(session.log.length).toBeGreaterThan(0);
});

test("runAgentLoop returns structured error for unknown tool without crashing", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "use echo tool",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [],
    maxAttempts: 1,
  });

  expect(outcome.passed).toBe(false);
  expect(session.log.some((event) => event.type === "tool_call_end")).toBe(true);
});

test("beforeToolCall hook can block execution", async () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "use echo tool",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    maxAttempts: 1,
    beforeToolCall: async () => ({ allow: false, reason: "blocked in test" }),
  });

  expect(outcome.passed).toBe(false);
  expect(session.log.some((event) => event.type === "tool_call_blocked")).toBe(true);
});

test("invalid tool args do not execute tool", async () => {
  let executed = false;
  const strictTool: Tool<{ value: string }> = {
    name: "strict",
    description: "Requires a string value.",
    parameters: Type.Object({ value: Type.String() }),
    async execute(args) {
      executed = true;
      return {
        toolCallId: createId("call"),
        toolName: "strict",
        ok: true,
        content: args.value,
      };
    },
  };
  const invalidArgsStream: StreamFn = async function* invalidArgsStream(_model, context) {
    if (context.phase === "plan") {
      yield {
        type: "structured_output",
        value: {
          id: createId("task"),
          title: "Invalid args task",
          instruction: "Call strict tool",
          acceptanceCriteria: createDefaultCriteria("Strict tool should pass"),
          toolNames: ["strict"],
          skillIds: [],
          status: "pending",
          attempts: 0,
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      yield {
        type: "tool_call",
        toolCall: {
          id: createId("call"),
          name: "strict",
          args: { value: 123 },
        },
      };
      yield { type: "done" };
      return;
    }

    yield {
      type: "structured_output",
      value: {
        passed: false,
        message: "Invalid args prevented execution.",
        evidence: [],
        failedCriteria: context.task.acceptanceCriteria.map((criterion) => criterion.id),
      },
    };
    yield { type: "done" };
  };
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "call strict",
  });

  const outcome = await runAgentLoop({
    session,
    model: { provider: "test", name: "scripted" },
    stream: invalidArgsStream,
    tools: [strictTool],
    maxAttempts: 1,
  });

  expect(outcome.passed).toBe(false);
  expect(executed).toBe(false);
  expect(session.log.some((event) => event.type === "tool_call_end")).toBe(true);
});
