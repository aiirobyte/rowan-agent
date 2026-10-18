import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import type { Phase } from "../../src/harness/phases/types";
import { createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

test("runPhase enters a host Phase with a payload: receives payload, no user message added, outcome not displayed", async () => {
  let observedPayload: unknown;
  const hostPhase: Phase = {
    name: "host-eval",
    description: "Evaluate something",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Host eval",
    input: { mode: "default", count: 1 },
    run: async (context) => {
      observedPayload = context.state.payload;
      return { message: "evaluation finished", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "control-phase-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[hostPhase.name, hostPhase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "control-phase-agent" },
    });

    const run = await runtime.runPhase(agentId, {
      phase: "host-eval",
      payload: { mode: "deep" },
    });

    const boundary = await run.wait();
    expect(boundary.type).toBe("completed");
    if (boundary.type === "completed") {
      expect(boundary.output).toBeUndefined();
    }
    expect(observedPayload).toEqual({ mode: "deep", count: 1 });

    const history = await runtime.history(agentId);
    expect(history).toHaveLength(0);

    const snapshot = await run.snapshot();
    expect("output" in snapshot ? snapshot.output : undefined).toBeUndefined();
  } finally {
    await runtime.close();
  }
});

test("yieldToInput: true Control Phase Run is cancelled when start creates an ordinary Run; without it, it is not", async () => {
  const suspendPhase: Phase = {
    name: "suspend-phase",
    description: "Suspend phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Suspend",
    run: async (context, execution) => {
      execution.interaction.request({ kind: "confirmation", prompt: "confirm?" });
      execution.interaction.suspend({ checkpoint: { step: 1 } });
      return { message: "done", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 2 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "yield-test-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[suspendPhase.name, suspendPhase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "yield-test-agent" },
    });

    // Case A: yieldToInput: true is cancelled when ordinary start creates a Run
    const runYield = await runtime.runPhase(agentId, {
      phase: "suspend-phase",
      yieldToInput: true,
      idempotencyKey: "yield-run-1",
    });
    await expect(runYield.wait()).resolves.toMatchObject({ type: "input_required" });
    expect((await runYield.snapshot()).state).toBe("input_required");

    const ordinary1 = await runtime.start(agentId, "ordinary message 1", {
      idempotencyKey: "ord-run-1",
    });
    expect((await runYield.snapshot()).state).toBe("cancelled");
    await expect(ordinary1.wait()).resolves.toMatchObject({ type: "completed" });

    // Case B: without yieldToInput, it is NOT cancelled when ordinary start creates a Run
    const runNoYield = await runtime.runPhase(agentId, {
      phase: "suspend-phase",
      idempotencyKey: "no-yield-run-2",
    });
    await expect(runNoYield.wait()).resolves.toMatchObject({ type: "input_required" });
    expect((await runNoYield.snapshot()).state).toBe("input_required");

    // An ordinary run creation does not cancel the non-yielding control run
    // (Instead, an input_required run can exist or be answered; start creates a new run or resumes)
    const ordinary2 = await runtime.start(agentId, "ordinary message 2", {
      idempotencyKey: "ord-run-2",
    });
    expect((await runNoYield.snapshot()).state).not.toBe("cancelled");
  } finally {
    await runtime.close();
  }
});

test("Unknown Phase fails the Run", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "unknown-phase-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map(),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "unknown-phase-agent" },
    });

    const run = await runtime.runPhase(agentId, {
      phase: "nonexistent-phase",
    });
    const result = await run.wait();
    expect(result.type).toBe("failed");
    if (result.type === "failed") {
      expect(result.failure.message).toContain('Phase "nonexistent-phase" not found');
    }
    expect((await run.snapshot()).state).toBe("failed");
  } finally {
    await runtime.close();
  }
});

test("runPhase returns existing Control Phase Run for the same phase", async () => {
  const suspendPhase: Phase = {
    name: "suspend-phase",
    description: "Suspend phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Suspend",
    run: async (context, execution) => {
      execution.interaction.request({ kind: "confirmation", prompt: "confirm?" });
      execution.interaction.suspend({ checkpoint: { step: 1 } });
      return { message: "done", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "dedup-phase-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[suspendPhase.name, suspendPhase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "dedup-phase-agent" },
    });

    const run1 = await runtime.runPhase(agentId, { phase: "suspend-phase", idempotencyKey: "first-phase-run" });
    await run1.wait();

    const run2 = await runtime.runPhase(agentId, { phase: "suspend-phase", idempotencyKey: "second-phase-run" });
    expect(run2.id).toBe(run1.id);
  } finally {
    await runtime.close();
  }
});

test("runPhase throws context_busy when an ordinary run is running or queued", async () => {
  const holdPhase: Phase = {
    name: "hold-phase",
    description: "Hold phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Hold",
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { message: "done", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "busy-phase-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[holdPhase.name, holdPhase]]),
        entryPhaseId: "hold-phase",
      },
      options: { idempotencyKey: "busy-phase-agent" },
    });

    const ordinary = await runtime.start(agentId, "blocking ordinary run", { idempotencyKey: "ord-busy" });
    await expect(runtime.runPhase(agentId, { phase: "default" })).rejects.toMatchObject({
      code: "context_busy",
    });
    await ordinary.wait();
  } finally {
    await runtime.close();
  }
});

test("compaction uses kind: 'phase' with phase: 'compact'", async () => {
  const store = new InMemoryStore();
  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "compact-kind-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map(),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "compact-kind-agent" },
    });

    const compactRun = await runtime.compactContext(agentId, {
      instructions: "Keep tests passing",
      idempotencyKey: "compact-kind-run",
    });
    await compactRun.wait();

    const page = await runtime.listRuns({ agentId });
    const compactRecord = page.items.find((r) => r.id === compactRun.id);
    expect(compactRecord?.metadata?.rowan).toMatchObject({
      kind: "phase",
      phase: "compact",
      payload: {
        instructions: "Keep tests passing",
      },
    });
  } finally {
    await runtime.close();
  }
});
