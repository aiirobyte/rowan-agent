import { expect, test } from "bun:test";
import Type from "typebox";
import { createSession } from "@rowan-agent/agent";
import { Agent } from "../src/agent";
import { runAgentLoop } from "../src/agent-loop";
import { createDefaultCriteria } from "@rowan-agent/agent";
import type { AgentEvent, LlmRequest, StreamFn, Tool } from "../src/types";
import { createId } from "../src/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { echoTool } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}

function isThreadRun(messages: LlmRequest["messages"]): boolean {
  return messages.some((m) => (m.content as string).includes("Agent state task:"));
}

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
  const parentStream: StreamFn = async function* parentStream(request, options) {
    if (isThreadRun(request.messages)) {
      yield* scriptedStream(request, options);
      return;
    }

    const phase = detectPhase(request.messages);

    if (phase === "chat") {
      yield {
        type: "text_delta",
        text: JSON.stringify({
          route: "plan",
          message: "Start a nested thread.",
        }),
      };
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      yield {
        type: "text_delta",
        text: JSON.stringify({
          id: createId("task"),
          title: "Delegate thread work",
          instruction: "Ask a nested thread to use echo.",
          acceptanceCriteria: createDefaultCriteria("Nested thread outcome must pass."),
          toolNames: ["delegate"],
          skillIds: [],
          status: "pending",
          attempts: 0,
        }),
      };
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
      yield {
        type: "text_delta",
        text: JSON.stringify({
          message: "Calling delegate tool.",
          toolCalls: [
            {
              id: createId("call"),
              name: "delegate",
              args: { prompt: "use echo tool" },
            },
          ],
        }),
      };
      yield { type: "done" };
      return;
    }

    // verify phase - assume passed since delegate tool returns nested outcome
    yield {
      type: "text_delta",
      text: JSON.stringify({
        passed: true,
        message: "Nested thread outcome was returned.",
      }),
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
