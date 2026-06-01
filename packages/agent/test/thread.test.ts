import { expect, test } from "bun:test";
import Type from "typebox";
import { createSession } from "@rowan-agent/agent";
import { Agent } from "../src/agent";
import { runAgentLoop } from "../src/agent-loop";
import type { AgentEvent, LlmRequest, StreamFn, Tool } from "../src/types";
import { createId } from "../src/utils";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { echoTool } from "./support/echo-tool";
import { scriptedStream, buildTestPartial, buildToolCallPartial } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}

function isThreadRun(messages: LlmRequest["messages"]): boolean {
  return messages.some((m) => (m.content as string).includes("nested request"));
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
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "turn_start",
        parentSessionId: "ses_parent",
      }),
      expect.objectContaining({
        type: "turn_end",
        parentSessionId: "ses_parent",
      }),
    ]),
  );
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
  expect(withoutTools.outcome.message).toContain("missing required echo evidence");
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
      });

      return {
        toolCallId: context.toolCallId,
        toolName: "delegate",
        ok: nested?.outcome != null,
        content: nested?.outcome ?? null,
        ...(nested?.outcome ? {} : { error: nested?.outcome?.message ?? "Nested thread did not run." }),
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
      const text = JSON.stringify({ route: "plan", message: "Start a nested thread." });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    if (phase === "plan") {
      const text = JSON.stringify({
        id: createId("task"),
        title: "Delegate thread work",
        instruction: "Ask a nested thread to use echo.",
        acceptanceCriteria: ["Nested thread outcome must pass."],
        toolNames: ["delegate"],
        skillIds: [],
        status: "pending",
        attempts: 0,
      });
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
      return;
    }

    if (phase === "execute") {
      const toolId = createId("call");
      const toolName = "delegate";
      const toolArgs = JSON.stringify({ prompt: "use echo tool" });
      const partial = buildToolCallPartial(toolId, toolName, toolArgs);
      yield { type: "tool_call_start", id: toolId, name: toolName, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_delta", id: toolId, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "tool_call_end", id: toolId, name: toolName, arguments: toolArgs, partial: { ...partial, contentBlocks: [...partial.contentBlocks] } };
      yield { type: "done" };
      return;
    }

    // verify phase - assume passed since delegate tool returns nested outcome
    const text = JSON.stringify({ passed: true, message: "Nested thread outcome was returned.", route: "stop" });
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const events: AgentEvent[] = [];
  const session = createSession<AgentEvent>({
    systemPrompt: "Test system",
    input: "call helper tool",
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
        "id" in event.result.content,
    ),
  ).toBe(true);
  expect(events.some((event) => event.type === "turn_start" && "parentSessionId" in event)).toBe(true);
  expect(events.some((event) => event.type === "turn_end" && "parentSessionId" in event)).toBe(true);
});
