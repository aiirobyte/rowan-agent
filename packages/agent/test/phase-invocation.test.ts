import { expect, test } from "bun:test";
import type { AssistantMessagePartial } from "@rowan-agent/models";
import { runAgentLoop } from "../src/agent-loop";
import type { PhaseInvocation } from "../src";
import type { AgentContext, StreamFn } from "../src/types";
import { createMessage } from "../src/types";
import type { Phase, PhaseRegistry } from "../src/harness/phases/types";
import { createId } from "../src/utils";
import { buildTestPartial } from "./support/scripted-stream";

function buildTestPhase(overrides: Partial<Phase> & { name: string }): Phase {
  return {
    description: `${overrides.name} phase`,
    filePath: "",
    baseDir: "",
    content: "",
    ...overrides,
  };
}

function buildContext(phases: Phase[], entryPhaseId: string): AgentContext {
  const registry: PhaseRegistry = {
    phases: new Map(phases.map(phase => [phase.name, phase])),
    entryPhaseId,
  };
  return {
    systemPrompt: "Test system prompt",
    messages: [createMessage("user", "Run the phases")],
    tools: [],
    skills: [],
    phases: registry,
  };
}

const unusedStream: StreamFn = async function* () {
  throw new Error("The model should not be invoked by a run phase");
};

test("serial PhaseContext exposes its invocation contract", async () => {
  let invocation: PhaseInvocation | undefined;
  const serial = buildTestPhase({
    name: "serial-worker",
    run: async (context) => {
      invocation = context.invocation;
      return { message: "done", route: "stop" };
    },
  });

  await runAgentLoop({
    context: buildContext([serial], serial.name),
    model: { provider: "test", id: "unused" },
    stream: unusedStream,
  });

  expect(invocation).toEqual({
    mode: "serial",
    instanceId: "serial-worker",
  });
});

test("parallel PhaseContexts expose their shared invocation contract", async () => {
  const invocations: PhaseInvocation[] = [];
  const dispatcher = buildTestPhase({ name: "dispatcher", target: "stop" });
  const worker = buildTestPhase({
    name: "worker",
    isolated: true,
    content: "Worker instructions.",
    run: async (context) => {
      expect(context.systemPrompt).toBe("Test system prompt");
      expect(context.messages).toContainEqual(expect.objectContaining({
        role: "user",
        content: expect.stringContaining('<phase_content name="worker">'),
      }));
      expect(context.messages.some((message) => message.role === "tool")).toBe(false);
      invocations.push(context.invocation);
      return { message: "done", route: "stop" };
    },
  });

  const stream: StreamFn = async function* () {
    const text = "Dispatching workers.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };

    const toolId = createId("route");
    const args = JSON.stringify({
      decision: [
        { phase: "worker", payload: { task: "first" } },
        { phase: "worker", payload: { task: "second" } },
      ],
    });
    const partial: AssistantMessagePartial = {
      role: "assistant",
      contentBlocks: [
        { type: "text", text },
        { type: "tool_call", id: toolId, name: "route", args },
      ],
    };
    yield { type: "tool_call_start", id: toolId, name: "route", partial };
    yield { type: "tool_call_delta", id: toolId, arguments: args, partial };
    yield { type: "tool_call_end", id: toolId, name: "route", arguments: args, partial };
    yield { type: "done" };
  };

  await runAgentLoop({
    context: buildContext([dispatcher, worker], dispatcher.name),
    model: { provider: "test", id: "scripted" },
    stream,
  });

  const parallelInvocations = invocations
    .filter((invocation): invocation is Extract<PhaseInvocation, { mode: "parallel" }> => invocation.mode === "parallel")
    .sort((left, right) => left.index - right.index);

  expect(parallelInvocations).toHaveLength(2);
  expect(parallelInvocations.map(({ groupId: _, ...invocation }) => invocation)).toEqual([
    {
      mode: "parallel",
      instanceId: "worker#1",
      index: 0,
      count: 2,
      sourcePhaseId: "dispatcher",
    },
    {
      mode: "parallel",
      instanceId: "worker#2",
      index: 1,
      count: 2,
      sourcePhaseId: "dispatcher",
    },
  ]);
  expect(parallelInvocations[0]?.groupId).toMatch(/^phase-group_/);
  expect(parallelInvocations[1]?.groupId).toBe(parallelInvocations[0]?.groupId);
});
