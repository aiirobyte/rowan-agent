import { expect, test } from "bun:test";
import Type from "typebox";
import { createSession } from "@rowan-agent/agent";
import { Agent } from "../src/agent";
import { runAgentLoop } from "../src/loop";
import { createDefaultCriteria } from "@rowan-agent/agent";
import type { AgentEvent, StreamFn, Tool } from "../src/types";
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
  expect(result.sessionId).toEqual(expect.stringMatching(/^ses_/));
  expect(result.outcome.passed).toBe(true);
  expect(result.limitUsage.toolCalls).toBe(1);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "chat_start",
        parentSessionId: "ses_parent",
      }),
      expect.objectContaining({
        type: "chat_end",
        parentSessionId: "ses_parent",
      }),
    ]),
  );
  expect(result.outcome.passed).toBe(true);
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
  expect(withoutTools.sessionId).toEqual(expect.stringMatching(/^ses_/));
  expect(withoutTools.outcome.passed).toBe(false);
  expect(withoutTools.outcome.message).toContain("missing required echo evidence");
  expect(withTools.outcome.passed).toBe(true);
});

test("thread model limits returns a structured failed outcome", async () => {
  const events: AgentEvent[] = [];
  const result = asThreadResult(await runAgentLoop({
    kind: "thread",
    parentSessionId: "ses_parent",
    prompt: "hello",
    systemPrompt: "Session system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: [echoTool],
    limits: { maxModelCalls: 0 },
    emit: (event) => {
      events.push(event);
    },
  }));

  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toBeUndefined();
  expect(result.outcome.message).toContain("model calls limit");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.limitUsage).toEqual({ modelCalls: 1, toolCalls: 0 });
});

test("thread tool limits stops before executing extra tools", async () => {
  const events: AgentEvent[] = [];
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
    emit: (event) => {
      events.push(event);
    },
  }));

  expect(executed).toBe(false);
  expect(result.outcome.passed).toBe(false);
  expect(result.outcome.taskId).toEqual(expect.any(String));
  expect(result.outcome.message).toContain("tool calls limit");
  expect(result.outcome).not.toHaveProperty("evidence");
  expect(result.outcome).not.toHaveProperty("failedCriteria");
  expect(result.limitUsage).toEqual({ modelCalls: 1, toolCalls: 1 });
  expect(events.some((event) => event.type === "tool_execution_start")).toBe(false);
});

test("worker thread smoke tests do not recursively route on bare thread wording", async () => {
  const events: AgentEvent[] = [];
  let routeCalls = 0;
  let planCalls = 0;

  const smokeTestStream: StreamFn = async function* smokeTestStream(model, context) {
    if (context.phase === "route") {
      routeCalls += 1;
      yield {
        type: "model_requested",
        phase: "route",
        model,
        usage: { inputMessages: context.state.messages.length },
      };
      yield {
        type: "structured_output",
        content: {
          route: "thread",
          message: "Creating another thread.",
          thread: {
            prompt: "测试 thread",
            task: context.state.task ??
              "Execute a simple test within an isolated child runtime to verify thread creation and execution.",
            goal: context.state.goal ??
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
          instruction: context.state.task ?? "Confirm this worker thread is running.",
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
    // For thread output, check if the child thread executed successfully
    // For tool output, check if the tool results indicate success
    let passed = false;
    let message = "Thread test failed.";

    if (output.kind === "thread") {
      // Thread output - check if the child thread's outcome passed
      passed = output.outcome.passed && output.outcome.message.includes("child runtime active");
      message = passed ? "Thread test executed successfully: child runtime active." : "Thread test failed.";
    } else if (output.kind === "tools") {
      // Tool output - this is from the execute phase, always pass for this test
      passed = true;
      message = "Thread test executed successfully: child runtime active.";
    }

    yield {
      type: "structured_output",
      content: {
        passed,
        message,
      },
    };
    yield { type: "done" };
  };

  const agent = new Agent({
    context: createTestContext({ tools: [echoTool] }),
    model: { provider: "test", name: "thread-smoke-test" },
    stream: smokeTestStream,
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "测试 thread");
  const threadCreatedEvents = events.filter((event) => event.type === "chat_start" && "parentSessionId" in event);

  expect(outcome.outcome.passed).toBe(true);
  expect(routeCalls).toBe(2);
  expect(planCalls).toBe(1);
  expect(threadCreatedEvents).toHaveLength(1);
  expect(
    events.some(
      (event) =>
        event.type === "message_end" &&
        event.message.metadata?.kind === "routing_decision" &&
        event.message.content.includes("\"route\":\"plan\"") &&
        event.message.content.includes("worker thread"),
    ),
  ).toBe(true);
  expect(
    events.some(
      (event) =>
        event.type === "message_end" &&
        event.message.metadata?.kind === "thread_output" &&
        event.message.content.includes("\"kind\":\"thread\"") &&
        event.message.content.includes("child runtime active"),
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
        usage: { inputMessages: context.state.messages.length },
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
          instruction: context.state.task ?? "Use echo tool.",
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
    let hasPassingEvidence = false;

    if (output.kind === "thread") {
      // Thread output - check if the child thread's outcome passed
      // The outcome message will be from verification, so check for "Echo evidence returned."
      hasPassingEvidence =
        output.outcome.passed === true &&
        output.outcome.message.includes("Echo evidence returned.");
    } else if (output.kind === "tools") {
      // Tool output - this is from the execute phase, check if echo tool was used
      hasPassingEvidence = output.toolResults.some(
        (result) => result.toolName === "echo" && result.ok
      );
    }

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
  const threadCreatedEvents = events.filter((event) => event.type === "chat_start" && "parentSessionId" in event);
  const verificationEvents = events.filter((event) => event.type === "phase_start" && event.phase === "verify");

  expect(outcome.outcome.passed).toBe(true);
  expect(routeCalls).toBe(3);
  expect(planCalls).toBe(1);
  expect(threadCreatedEvents).toHaveLength(2);
  expect(threadCreatedEvents.map((event) => (event as { threadDepth?: number }).threadDepth)).toEqual([1, 2]);
  expect(threadCreatedEvents.every((event) => (event as { maxThreadDepth?: number }).maxThreadDepth === 2)).toBe(true);
  // Only the main run's verification goes through runConfiguredPhase (emits phase_start).
  // Thread verification uses runPhase directly (no phase_start emission).
  expect(verificationEvents).toHaveLength(1);
  expect(
    events.some(
      (event) =>
        event.type === "message_end" &&
        event.message.metadata?.kind === "routing_decision" &&
        event.message.content.includes("\"route\":\"plan\""),
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
    if (context.state.parentSessionId) {
      yield* scriptedStream(model, context, options);
      return;
    }

    if (context.phase === "route") {
      yield {
        type: "structured_output",
        content: {
          route: "plan",
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
    input: "call helper tool",
    task: "Call helper tool.",
    goal: "Nested thread outcome must be returned as delegate evidence.",
  });
  const agent = new Agent({
    context: createTestContext({
      tools: [delegateTool],
      messages: session.messages,
    }),
    model: { provider: "test", name: "parent" },
    stream: parentStream,
    sessionId: session.id,
  });
  agent.subscribe((event) => {
    events.push(event);
  });

  const outcome = await runAgentTurn(agent, "call helper tool");

  expect(outcome.outcome.passed).toBe(true);
  expect(outcome.outcome).not.toHaveProperty("evidence");
  expect(outcome.outcome).not.toHaveProperty("failedCriteria");
  expect(
    events.some(
      (event) =>
        event.type === "tool_execution_end" &&
        event.toolName === "delegate" &&
        !event.isError &&
        typeof event.result.content === "object" &&
        event.result.content !== null &&
        "passed" in event.result.content &&
        event.result.content.passed === true,
    ),
  ).toBe(true);
  expect(events.some((event) => event.type === "chat_start" && "parentSessionId" in event)).toBe(true);
  expect(events.some((event) => event.type === "chat_end" && "parentSessionId" in event)).toBe(true);
});
