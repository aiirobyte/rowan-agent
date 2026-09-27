import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import {
  PhaseInteractionCancelledError,
  createPhaseInteractionDriver,
} from "../../src/harness/phases/interactions";
import type { Phase } from "../../src/harness/phases/types";
import type { ExecutionState } from "../../src/loop/types";
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
    expect(history.some((m) => m.role === "user" && m.content === "confirmed" && (m.metadata as any)?.kind === "phase_interaction")).toBe(true);
    expect(history.some((m) => m.role === "user" && m.content === "ready" && (m.metadata as any)?.kind === "phase_interaction")).toBe(true);
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
  const driver = createPhaseInteractionDriver(state, "cancelled", controller.signal);
  controller.abort();

  expect(() => driver.request({
    kind: "permission",
    prompt: "Allow?",
  })).toThrow(PhaseInteractionCancelledError);
});

function stateWith(requests: NonNullable<ExecutionState["phaseInteractions"]>["requests"], answers: Record<string, string> = {}): ExecutionState {
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
    phaseInteractions: { requests, answers },
  } satisfies ExecutionState;
}

const storedRequest = (id: string, status: "pending" | "answered" | "cancelled" | "expired", toolCallId: string) => ({
  id,
  phase: "default",
  kind: "permission" as const,
  prompt: "Execute command: seq 1 100",
  origin: "tool_call" as const,
  toolCallId,
  createdAt: new Date().toISOString(),
  status,
});

test("a new tool call asks again instead of reusing a closed or foreign interaction", () => {
  for (const [status, toolCallId] of [["cancelled", "tool_1"], ["expired", "tool_1"], ["answered", "tool_1"]] as const) {
    const driver = createPhaseInteractionDriver(
      stateWith([storedRequest("interaction_old", status, toolCallId)], status === "answered" ? { interaction_old: "allow_once" } : {}),
      "default",
    );
    const request = driver.request({ kind: "permission", prompt: "Execute command: seq 1 100", origin: "tool_call", toolCallId: "tool_2" });

    expect(request.id).not.toBe("interaction_old");
    expect(request.status).toBe("pending");
    expect(driver.pending().map(({ id }) => id)).toEqual([request.id]);
  }
});

test("the same tool call resumes its answered interaction", () => {
  const driver = createPhaseInteractionDriver(
    stateWith([storedRequest("interaction_1", "answered", "tool_1")], { interaction_1: "allow_once" }),
    "default",
  );
  const request = driver.request({ kind: "permission", prompt: "Execute command: seq 1 100", origin: "tool_call", toolCallId: "tool_1" });

  expect(request).toMatchObject({ id: "interaction_1", status: "answered" });
});
