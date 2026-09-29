import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import {
  RunInteractionCancelledError,
  createRunInteractionDriver,
} from "../../src/harness/phases/interactions";
import type { Phase } from "../../src/harness/phases/types";
import type { ExecutionState } from "../../src/loop/types";
import type { Message } from "../../src/runtime-events";
import { createPhaseAgent } from "../fixtures/configuration";

function agent(
  runtime: AgentRuntime,
  stream: StreamFn,
  phases: { phases: Map<string, Phase>; entryPhaseId: string },
  options: { idempotencyKey?: string } = {},
) {
  return createPhaseAgent(runtime, { identity: "phase-interactions-v1", stream, phases, options });
}

test("a Phase can suspend on multiple interactions and resume after each answer", async () => {
  const stream: StreamFn = async function* () {
    throw new Error("the model should not be called");
  };
  const phase: Phase = {
    name: "approval",
    description: "Approval",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Approval",
    isolated: false,
    run: async (_context, execution) => {
      execution.interaction.request({ id: "first", kind: "user_input", prompt: "First answer" });
      execution.interaction.request({ id: "second", kind: "confirmation", prompt: "Second answer" });
      if (execution.interaction.answers().size < 2) {
        execution.interaction.suspend({ checkpoint: { step: "awaiting-answers" } });
      }
      return {
        message: "approved",
        route: "stop",
        payload: {
          first: execution.interaction.answers().get("first"),
          second: execution.interaction.answers().get("second"),
        },
      };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agent(
      runtime,
      stream, { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
      { idempotencyKey: "phase-interactions-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-interactions-run" });

    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [
        { id: "first", kind: "user_input", prompt: "First answer", status: "pending" },
        { id: "second", kind: "confirmation", prompt: "Second answer", status: "pending" },
      ],
    });

    await run.respondInteraction({ interactionId: "second", input: "confirmed" });
    await expect(run.snapshot()).resolves.toMatchObject({
      state: "input_required",
      interactions: [{ id: "first", status: "pending" }],
    });

    await run.respondInteraction({ interactionId: "first", input: "ready" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await expect(run.snapshot()).resolves.toMatchObject({
      state: "completed",
      outcome: { payload: { first: "ready", second: "confirmed" } },
    });

    const history = await runtime.history(agentId);
    expect(history.some((m) => m.role === "interaction" && m.interactionId === "second" && m.status === "answered" && m.answer === "confirmed")).toBe(true);
    expect(history.some((m) => m.role === "interaction" && m.interactionId === "first" && m.status === "answered" && m.answer === "ready")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("an auto-identified interaction keeps its identity across resume", async () => {
  const stream: StreamFn = async function* () {
    throw new Error("the model should not be called");
  };
  const phase: Phase = {
    name: "auto-id",
    description: "Auto ID",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Auto ID",
    run: async (_context, execution) => {
      const request = execution.interaction.request({
        kind: "user_input",
        prompt: "Continue?",
      });
      if (!execution.interaction.answers().has(request.id)) {
        execution.interaction.suspend();
      }
      return {
        message: "continued",
        route: "stop",
        payload: execution.interaction.answers().get(request.id),
      };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agent(
      runtime,
      stream, { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
      { idempotencyKey: "phase-interactions-auto-id-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "phase-interactions-auto-id-run" });
    const boundary = await run.wait();
    if (boundary.type !== "input_required") throw new Error("Expected an interaction boundary.");
    const interactionId = boundary.interactions[0]?.id;
    if (!interactionId) throw new Error("Expected an auto-generated interaction ID.");

    await run.respondInteraction({ interactionId, input: "yes" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { payload: "yes" },
    });
  } finally {
    await runtime.close();
  }
});

test("a cancelled Phase interaction driver refuses new requests", () => {
  const controller = new AbortController();
  const state = {
    currentPhase: "cancelled",
    attempt: 0,
    status: "running",
    metrics: {
      iterations: 0,
      phaseTransitions: [],
      compactionCount: 0,
      retryCount: 0,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now(),
    },
  } satisfies ExecutionState;
  const driver = createRunInteractionDriver(state, "cancelled", controller.signal);
  controller.abort();

  expect(() => driver.request({
    kind: "permission",
    prompt: "Allow?",
  })).toThrow(RunInteractionCancelledError);
});

function stateWith(requests: NonNullable<ExecutionState["runInteractions"]>["requests"], answers: Record<string, string> = {}): ExecutionState {
  return {
    currentPhase: "default",
    attempt: 0,
    status: "running",
    metrics: {
      iterations: 0,
      phaseTransitions: [],
      compactionCount: 0,
      retryCount: 0,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now(),
    },
    runInteractions: { requests, answers },
  } satisfies ExecutionState;
}

const storedRequest = (id: string, status: "pending" | "answered" | "cancelled" | "replied", toolCallId: string) => ({
  id,
  phase: "default",
  kind: "permission" as const,
  prompt: "Execute command: seq 1 100",
  toolCallId,
  createdAt: new Date().toISOString(),
  status,
});

test("a new tool call asks again instead of reusing a closed or foreign interaction", () => {
  for (const [status, toolCallId] of [["cancelled", "tool_1"], ["replied", "tool_1"], ["answered", "tool_1"]] as const) {
    const driver = createRunInteractionDriver(
      stateWith([storedRequest("interaction_old", status, toolCallId)], status === "answered" ? { interaction_old: "allow_once" } : {}),
      "default",
    );
    const request = driver.request({ kind: "permission", prompt: "Execute command: seq 1 100", toolCallId: "tool_2" });

    expect(request.id).not.toBe("interaction_old");
    expect(request.status).toBe("pending");
    expect(driver.pending().map(({ id }) => id)).toEqual([request.id]);
  }
});

test("the same tool call resumes its answered interaction", () => {
  const driver = createRunInteractionDriver(
    stateWith([storedRequest("interaction_1", "answered", "tool_1")], { interaction_1: "allow_once" }),
    "default",
  );
  const request = driver.request({ kind: "permission", prompt: "Execute command: seq 1 100", toolCallId: "tool_1" });

  expect(request).toMatchObject({ id: "interaction_1", status: "answered" });
});

test("one of two interactions answered keeps waiting and cancelling the second resumes", async () => {
  const stream: StreamFn = async function* () {
    throw new Error("the model should not be called");
  };
  const phase: Phase = {
    name: "two-questions",
    description: "Two questions",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Two questions",
    run: async (_context, execution) => {
      execution.interaction.request({ id: "q1", kind: "user_input", prompt: "Question 1" });
      execution.interaction.request({ id: "q2", kind: "permission", prompt: "Question 2" });
      if (execution.interaction.pending().length > 0) {
        execution.interaction.suspend();
      }
      return {
        message: "done",
        route: "stop",
        payload: {
          q1: execution.interaction.answers().get("q1") ?? null,
          q2: execution.interaction.answers().get("q2") ?? null,
        },
      };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agent(
      runtime,
      stream, { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
      { idempotencyKey: "two-q-agent" },
    );
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "two-q-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [{ id: "q1" }, { id: "q2" }],
    });

    // Answer first: run keeps waiting
    await run.respondInteraction({ interactionId: "q1", input: "my answer" });
    const snap = await run.snapshot();
    expect(snap.state).toBe("input_required");
    if (snap.state === "input_required") {
      expect(snap.interactions).toHaveLength(1);
      expect(snap.interactions[0]!.id).toBe("q2");
    }

    // Cancel second: run resumes and completes
    await run.respondInteraction({ interactionId: "q2", cancel: true });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const history = await runtime.history(agentId);
    const r1 = history.find((m) => m.role === "interaction" && m.interactionId === "q1");
    const r2 = history.find((m) => m.role === "interaction" && m.interactionId === "q2");
    expect(r1).toMatchObject({ status: "answered", answer: "my answer" });
    expect(r2).toMatchObject({ status: "cancelled" });
  } finally {
    await runtime.close();
  }
});

test("new Agent Input marks all pending interactions replied, commits user message after records, and resumes", async () => {
  const stream: StreamFn = async function* () {
    throw new Error("the model should not be called");
  };
  const phase: Phase = {
    name: "replied-phase",
    description: "Replied phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Replied phase",
    run: async (_context, execution) => {
      execution.interaction.request({ id: "q1", kind: "user_input", prompt: "Tell me something" });
      execution.interaction.request({ id: "q2", kind: "confirmation", prompt: "Are you sure?" });
      if (execution.interaction.pending().length > 0) {
        execution.interaction.suspend();
      }
      return {
        message: "done",
        route: "stop",
      };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agent(
      runtime,
      stream, { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
      { idempotencyKey: "reply-agent" },
    );
    const run = await runtime.start(agentId, "first prompt", { idempotencyKey: "reply-run-1" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "input_required",
      interactions: [{ id: "q1" }, { id: "q2" }],
    });

    // Person sends new Agent Input instead of answering
    const resumed = await runtime.start(agentId, "I changed my mind", { idempotencyKey: "reply-run-2" });
    expect(resumed.id).toBe(run.id);

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const history = await runtime.history(agentId);
    const interactions = history.filter((m) => m.role === "interaction");
    expect(interactions).toHaveLength(2);
    expect(interactions[0]!).toMatchObject({ interactionId: "q1", status: "replied", reply: "I changed my mind" });
    expect(interactions[1]!).toMatchObject({ interactionId: "q2", status: "replied", reply: "I changed my mind" });

    const userMessages = history.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
    expect(userMessages[1]!.content).toBe("I changed my mind");
    expect(interactions[0]!.sequenceWithinRun).toBeLessThan(userMessages[1]!.sequenceWithinRun);
    expect(interactions[1]!.sequenceWithinRun).toBeLessThan(userMessages[1]!.sequenceWithinRun);
  } finally {
    await runtime.close();
  }
});
