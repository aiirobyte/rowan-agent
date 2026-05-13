import { expect, test } from "bun:test";
import Type from "typebox";
import { createSession } from "@rowan-agent/session";
import { Agent } from "../src/agent";
import { runAgentLoop } from "../src/loop";
import { createDefaultCriteria } from "../src/task";
import type { AgentEvent, ExecutionTurn, StreamFn, Tool } from "../src/types";
import { createId } from "../src/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

type ThreadResult = Extract<Awaited<ReturnType<typeof runAgentLoop>>, { kind: "thread" }>;

function asThreadResult(result: Awaited<ReturnType<typeof runAgentLoop>>): ThreadResult {
  if (result.kind !== "thread") {
    throw new Error("Expected thread result.");
  }
  return result;
}

test("runAgentLoop creates a thread session with explicit tools and skills", async () => {
  const events: AgentEvent[] = [];
  const skill = {
    id: "session-skill",
    path: "skills/session/SKILL.md",
    content: "Use the echo tool when asked for evidence.",
    toolNames: ["echo"],
  };

  const result = asThreadResult(await runAgentLoop({
    kind: "thread",
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
  }));

  expect(result.parentSessionId).toBe("ses_parent");
  expect(result.session.parentSessionId).toBe("ses_parent");
  expect(result.session.skills).toEqual([skill]);
  expect(result.outcome.passed).toBe(true);
  expect(result.limitUsage.toolCalls).toBe(1);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "thread_created",
        parentSessionId: "ses_parent",
        sessionId: result.session.id,
      }),
      expect.objectContaining({
        type: "session_created",
        session: expect.objectContaining({
          id: result.session.id,
          parentSessionId: "ses_parent",
          input: "use echo tool",
        }),
      }),
      expect.objectContaining({
        type: "thread_end",
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

test("Agent does not expose startThread; thread runs use explicit loop config", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: [echoTool] }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
  });

  await runAgentTurn(agent, "hello");
  expect("startThread" in agent).toBe(false);

  const withoutTools = asThreadResult(await runAgentLoop({
    kind: "thread",
    parentSessionId: "ses_parent",
    prompt: "use echo tool",
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [],
  }));
  const withTools = asThreadResult(await runAgentLoop({
    kind: "thread",
    parentSessionId: "ses_parent",
    prompt: "use echo tool",
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
  }));

  expect(withoutTools.parentSessionId).toBe("ses_parent");
  expect(withoutTools.session.skills).toEqual([]);
  expect(withoutTools.outcome.passed).toBe(false);
  expect(withoutTools.outcome.message).toContain("missing required echo evidence");
  expect(withTools.outcome.passed).toBe(true);
});

test("thread model limits returns a structured failed outcome", async () => {
  const result = asThreadResult(await runAgentLoop({
    kind: "thread",
    parentSessionId: "ses_parent",
    prompt: "hello",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    limits: { maxModelCalls: 0 },
  }));

  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toBeUndefined();
  expect(result.outcome.message).toContain("model calls limit");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.limitUsage).toEqual({ modelCalls: 1, toolCalls: 0 });
  expect(result.session.log.some((event) => event.type === "limit_exceeded")).toBe(true);
  expect(
    result.session.log.some(
      (event) =>
        event.type === "limit_exceeded" &&
        event.resource === "modelCalls" &&
        event.limit === 0 &&
        event.usage.modelCalls === 1 &&
        event.usage.toolCalls === 0,
    ),
  ).toBe(true);
});

test("thread tool limits stops before executing extra tools", async () => {
  let executed = false;
  const trackedEcho: typeof echoTool = {
    ...echoTool,
    async execute(args, context, signal) {
      executed = true;
      return echoTool.execute(args, context, signal);
    },
  };

  const result = asThreadResult(await runAgentLoop({
    kind: "thread",
    parentSessionId: "ses_parent",
    prompt: "use echo tool",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [trackedEcho],
    limits: { maxToolCalls: 0 },
  }));

  expect(executed).toBe(false);
  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toEqual(expect.any(String));
  expect(result.outcome.message).toContain("tool calls limit");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.limitUsage).toEqual({ modelCalls: 1, toolCalls: 1 });
  expect(
    result.session.log.some(
      (event) =>
        event.type === "limit_exceeded" &&
        event.resource === "toolCalls" &&
        event.limit === 0 &&
        event.usage.modelCalls === 1 &&
        event.usage.toolCalls === 1,
    ),
  ).toBe(true);
  expect(result.session.log.some((event) => event.type === "tool_start")).toBe(false);
});

test("worker thread smoke tests do not recursively route on bare thread wording", async () => {
  const events: AgentEvent[] = [];
  const recordedSteps: ExecutionTurn[] = [];
  let routeCalls = 0;
  let planCalls = 0;

  const smokeTestStream: StreamFn = async function* smokeTestStream(model, context) {
    if (context.phase === "route") {
      routeCalls += 1;
      yield {
        type: "model_requested",
        phase: "route",
        model,
        usage: { inputMessages: context.session.messages.length },
      };
      yield {
        type: "structured_output",
        content: {
          route: "thread",
          message: "Creating another thread.",
          thread: {
            prompt: "测试 thread",
            task: context.session.task ??
              "Execute a simple test within an isolated child runtime to verify thread creation and execution.",
            goal: context.session.goal ??
              "Return a confirmation that the thread executed successfully with a test result.",
          },
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      planCalls += 1;
      yield {
        type: "structured_output",
        content: {
          id: createId("task"),
          title: "Confirm worker thread runtime",
          instruction: context.session.task ?? "Confirm this worker thread is running.",
          acceptanceCriteria: createDefaultCriteria("The worker thread returns a success confirmation."),
          toolNames: [],
          skillIds: [],
          status: "pending",
          attempts: 0,
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "execute") {
      yield { type: "text_delta", text: "Thread test executed successfully: child runtime active." };
      yield { type: "done" };
      return;
    }

    const output = context.taskOutput;
    const passed =
      output.kind === "thread" &&
      output.outcome.passed &&
      output.outcome.message.includes("child runtime active");
    yield {
      type: "structured_output",
      content: {
        passed,
        message: passed ? "Thread test executed successfully: child runtime active." : "Thread test failed.",
      },
    };
    yield { type: "done" };
  };

  const agent = new Agent({
    context: createTestContext({ tools: [echoTool] }),
    model: { provider: "test", name: "thread-smoke-test" },
    stream: smokeTestStream,
    recordStep: async (step) => {
      recordedSteps.push(step);
    },
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "测试 thread");
  const threadCreatedEvents = events.filter((event) => event.type === "thread_created");

  expect(outcome.outcome.passed).toBe(true);
  expect(routeCalls).toBe(2);
  expect(planCalls).toBe(1);
  expect(threadCreatedEvents).toHaveLength(1);
  expect(
    events.some(
      (event) =>
        event.type === "message_delta" &&
        (Array.isArray(event.delta) ? event.delta : [event.delta]).some(
          (delta) =>
            delta.metadata?.kind === "routing_decision" &&
            delta.content.includes("\"route\":\"task\"") &&
            delta.content.includes("worker thread"),
        ),
    ),
  ).toBe(true);
  expect(
    recordedSteps.some(
      (step) =>
        step.sessionId === outcome.session.id &&
        step.phase === "execute" &&
        step.entries.some(
          (entry) =>
            entry.kind === "structured_output" &&
            typeof entry.content === "object" &&
            entry.content !== null &&
            "kind" in entry.content &&
            entry.content.kind === "thread",
        ),
    ),
  ).toBe(true);
});

test("worker threads can recursively route until the thread depth limit", async () => {
  const events: AgentEvent[] = [];
  let routeCalls = 0;
  let planCalls = 0;

  const recursiveThreadStream: StreamFn = async function* recursiveThreadStream(model, context) {
    if (context.phase === "route") {
      routeCalls += 1;
      if (routeCalls > 3) {
        throw new Error("Thread depth limit was not enforced.");
      }

      yield {
        type: "model_requested",
        phase: "route",
        model,
        usage: { inputMessages: context.session.messages.length },
      };
      yield {
        type: "structured_output",
        content: {
          route: "thread",
          message: "Creating another worker thread.",
          thread: {
            prompt: "create a thread to use echo tool",
            task: "Delegate echo evidence to a child thread.",
            goal: "Return echo evidence.",
          },
        },
      };
      yield { type: "done" };
      return;
    }

    if (context.phase === "plan") {
      planCalls += 1;
      yield {
        type: "structured_output",
        content: {
          id: createId("task"),
          title: "Use echo tool",
          instruction: context.session.task ?? "Use echo tool.",
          acceptanceCriteria: createDefaultCriteria("Echo evidence is returned."),
          toolNames: ["echo"],
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
          name: "echo",
          args: { message: context.task.instruction },
        },
      };
      yield { type: "done" };
      return;
    }

    const output = context.taskOutput;
    const hasPassingEvidence =
      output.kind === "thread" &&
      output.outcome.passed === true &&
      output.outcome.message.includes("Delegate echo evidence");
    yield {
      type: "structured_output",
      content: {
        passed: hasPassingEvidence,
        message: "Echo evidence returned.",
      },
    };
    yield { type: "done" };
  };

  const agent = new Agent({
    context: createTestContext({ tools: [echoTool] }),
    model: { provider: "test", name: "recursive-route" },
    stream: recursiveThreadStream,
    limits: { maxThreadDepth: 2 },
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "create a thread to use echo tool");
  const threadCreatedEvents = events.filter((event) => event.type === "thread_created");
  const verificationEvents = events.filter((event) => event.type === "verification_start");

  expect(outcome.outcome.passed).toBe(true);
  expect(routeCalls).toBe(3);
  expect(planCalls).toBe(1);
  expect(threadCreatedEvents).toHaveLength(2);
  expect(threadCreatedEvents.map((event) => event.threadDepth)).toEqual([1, 2]);
  expect(threadCreatedEvents.every((event) => event.maxThreadDepth === 2)).toBe(true);
  expect(verificationEvents).toHaveLength(1);
  expect(
    events.some(
      (event) =>
        event.type === "message_delta" &&
        (Array.isArray(event.delta) ? event.delta : [event.delta]).some(
          (delta) =>
            delta.metadata?.kind === "routing_decision" &&
            delta.content.includes("\"route\":\"task\""),
        ),
    ),
  ).toBe(true);
});

test("tools can launch threads and return outcomes as tool evidence", async () => {
  const delegateTool: Tool<{ prompt: string }> = {
    name: "delegate",
    description: "Starts a nested thread for a request.",
    parameters: Type.Object({ prompt: Type.String() }),
    async execute(args, context) {
      const nested = await context.runThread?.({
        prompt: args.prompt,
        tools: [echoTool],
        limits: { maxToolCalls: 1 },
      });

      return {
        toolCallId: context.toolCallId,
        toolName: "delegate",
        ok: nested?.outcome.passed ?? false,
        content: nested?.outcome ?? null,
        ...(nested?.outcome.passed ? {} : { error: nested?.outcome.message ?? "Nested thread did not run." }),
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
          route: "task",
          message: "Start a nested thread.",
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
          title: "Delegate thread work",
          instruction: "Ask a nested thread to use echo.",
          acceptanceCriteria: createDefaultCriteria("Nested thread outcome must pass."),
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

    const output = context.taskOutput;
    const toolResults = output.kind === "tools" ? output.toolResults : [];
    const nestedOutcome = toolResults.find((result) => result.toolName === "delegate")?.content as
      | { passed?: boolean }
      | undefined;
    const passed = nestedOutcome?.passed === true;
    yield {
      type: "structured_output",
      content: {
        passed,
        message: passed ? "Nested thread outcome was returned." : "Missing nested outcome.",
      },
    };
    yield { type: "done" };
  };
  const events: AgentEvent[] = [];
  const session = createSession<AgentEvent>({
    systemPrompt: "Test system",
    input: "delegate echo to a nested thread",
    task: "Delegate echo to a nested thread.",
    goal: "Nested thread outcome must be returned as delegate evidence.",
  });
  const agent = new Agent({
    context: createTestContext({
      tools: [delegateTool],
      messages: session.messages,
    }),
    model: { provider: "test", name: "parent" },
    stream: parentStream,
    session,
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "delegate echo to a nested thread");

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome).not.toHaveProperty("evidence");
  expect(outcome.outcome).not.toHaveProperty("failedCriteria");
  expect(
    events.some(
      (event) =>
        event.type === "tool_end" &&
        event.result.toolName === "delegate" &&
        event.result.ok &&
        typeof event.result.content === "object" &&
        event.result.content !== null &&
        "passed" in event.result.content &&
        event.result.content.passed === true,
    ),
  ).toBe(true);
  expect(events.some((event) => event.type === "thread_created")).toBe(true);
  expect(events.some((event) => event.type === "thread_end")).toBe(true);
});
