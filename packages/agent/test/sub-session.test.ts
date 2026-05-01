import { expect, test } from "bun:test";
import Type from "typebox";
import { Agent } from "../src/agent";
import { runSubSession } from "../src/session";
import { createDefaultCriteria } from "../src/task";
import type { AgentEvent, StreamFn, Tool } from "../src/types";
import { createId } from "../src/types";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

test("runSubSession creates a session with explicit tools and skills", async () => {
  const events: AgentEvent[] = [];
  const skill = {
    id: "session-skill",
    path: "skills/session/SKILL.md",
    content: "Use the echo tool when asked for evidence.",
    toolNames: ["echo"],
  };

  const result = await runSubSession({
    parentSessionId: "ses_parent",
    prompt: "use echo tool",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    skills: [skill],
    emit: (event) => {
      events.push(event);
    },
  });

  expect(result.parentSessionId).toBe("ses_parent");
  expect(result.session.parentSessionId).toBe("ses_parent");
  expect(result.session.skills).toEqual([skill]);
  expect(result.outcome.passed).toBe(true);
  expect(result.budgetUsage.toolCalls).toBe(1);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "sub_session_start",
        parentSessionId: "ses_parent",
        sessionId: result.session.id,
      }),
      expect.objectContaining({
        type: "session_created",
        session: expect.objectContaining({
          id: result.session.id,
          parentSessionId: "ses_parent",
        }),
      }),
      expect.objectContaining({
        type: "sub_session_end",
        parentSessionId: "ses_parent",
        sessionId: result.session.id,
      }),
    ]),
  );
  expect(
    events.some(
      (event) =>
        event.type === "task_created" &&
        event.task.skillIds.includes("session-skill") &&
        event.task.toolNames.includes("echo"),
    ),
  ).toBe(true);
});

test("Agent.startSubSession defaults to the current parent session and does not inherit tools implicitly", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
  });

  await agent.prompt("hello");
  const parentSessionId = agent.state.session?.id;
  if (!parentSessionId) {
    throw new Error("Expected parent session id.");
  }

  const withoutTools = await agent.startSubSession({
    prompt: "use echo tool",
    tools: [],
  });
  const withTools = await agent.startSubSession({
    prompt: "use echo tool",
    tools: [echoTool],
  });

  expect(withoutTools.parentSessionId).toBe(parentSessionId);
  expect(withoutTools.session.skills).toEqual([]);
  expect(withoutTools.outcome.passed).toBe(false);
  expect(withoutTools.outcome.message).toContain("missing required echo evidence");
  expect(withTools.outcome.passed).toBe(true);
});

test("sub-session model budget returns a structured failed outcome", async () => {
  const result = await runSubSession({
    parentSessionId: "ses_parent",
    prompt: "hello",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    budget: { maxModelCalls: 0 },
  });

  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toBeUndefined();
  expect(result.outcome.message).toContain("model calls budget");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.budgetUsage).toEqual({ modelCalls: 1, toolCalls: 0 });
  expect(result.session.log.some((event) => event.type === "budget_exceeded")).toBe(true);
  expect(
    result.session.log.some(
      (event) =>
        event.type === "budget_exceeded" &&
        event.resource === "modelCalls" &&
        event.limit === 0 &&
        event.usage.modelCalls === 1 &&
        event.usage.toolCalls === 0,
    ),
  ).toBe(true);
});

test("sub-session tool budget stops before executing extra tools", async () => {
  let executed = false;
  const trackedEcho: typeof echoTool = {
    ...echoTool,
    async execute(args, context, signal) {
      executed = true;
      return echoTool.execute(args, context, signal);
    },
  };

  const result = await runSubSession({
    parentSessionId: "ses_parent",
    prompt: "use echo tool",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [trackedEcho],
    budget: { maxToolCalls: 0 },
  });

  expect(executed).toBe(false);
  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toEqual(expect.any(String));
  expect(result.outcome.message).toContain("tool calls budget");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.budgetUsage).toEqual({ modelCalls: 1, toolCalls: 1 });
  expect(
    result.session.log.some(
      (event) =>
        event.type === "budget_exceeded" &&
        event.resource === "toolCalls" &&
        event.limit === 0 &&
        event.usage.modelCalls === 1 &&
        event.usage.toolCalls === 1,
    ),
  ).toBe(true);
  expect(result.session.log.some((event) => event.type === "tool_call_start")).toBe(false);
});

test("tools can launch sub-sessions and return outcomes as tool evidence", async () => {
  const delegateTool: Tool<{ prompt: string }> = {
    name: "delegate",
    description: "Starts a nested session for a request.",
    parameters: Type.Object({ prompt: Type.String() }),
    async execute(args, context) {
      const nested = await context.runSubSession?.({
        prompt: args.prompt,
        tools: [echoTool],
        budget: { maxToolCalls: 1 },
      });

      return {
        toolCallId: context.toolCallId,
        toolName: "delegate",
        ok: nested?.outcome.passed ?? false,
        content: nested?.outcome ?? null,
        ...(nested?.outcome.passed ? {} : { error: nested?.outcome.message ?? "Nested session did not run." }),
      };
    },
  };
  const parentStream: StreamFn = async function* parentStream(model, context, options) {
    if (context.session.parentSessionId) {
      yield* scriptedStream(model, context, options);
      return;
    }

    if (context.phase === "route") {
      yield {
        type: "structured_output",
        content: {
          needsTask: true,
          message: "Start a nested session.",
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      yield {
        type: "structured_output",
        content: {
          id: createId("task"),
          title: "Delegate session work",
          instruction: "Ask a nested session to use echo.",
          acceptanceCriteria: createDefaultCriteria("Nested session outcome must pass."),
          toolNames: ["delegate"],
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
          name: "delegate",
          args: { prompt: "use echo tool" },
        },
      };
      yield { type: "done" };
      return;
    }

    const nestedOutcome = context.toolResults.find((result) => result.toolName === "delegate")?.content as
      | { passed?: boolean }
      | undefined;
    const passed = nestedOutcome?.passed === true;
    yield {
      type: "structured_output",
      content: {
        passed,
        message: passed ? "Nested session outcome was returned." : "Missing nested outcome.",
      },
    };
    yield { type: "done" };
  };
  const events: AgentEvent[] = [];
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "parent" },
    stream: parentStream,
    tools: [delegateTool],
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await agent.prompt("delegate echo to a nested session");

  expect(outcome.passed).toBe(true);
  expect(outcome).not.toHaveProperty("evidence");
  expect(outcome).not.toHaveProperty("failedCriteria");
  expect(
    events.some(
      (event) =>
        event.type === "tool_call_end" &&
        event.result.toolName === "delegate" &&
        event.result.ok &&
        typeof event.result.content === "object" &&
        event.result.content !== null &&
        "passed" in event.result.content &&
        event.result.content.passed === true,
    ),
  ).toBe(true);
  expect(events.some((event) => event.type === "sub_session_start")).toBe(true);
  expect(events.some((event) => event.type === "sub_session_end")).toBe(true);
});
