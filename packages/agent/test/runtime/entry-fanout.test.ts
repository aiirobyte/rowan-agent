import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime";
import type { Phase } from "../../src/harness/phases/types";
import { createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

function agentWithPhases(
  runtime: AgentRuntime,
  stream: StreamFn,
  phases: { phases: Map<string, Phase>; entryPhaseId: string },
  options: { idempotencyKey?: string } = {},
) {
  return createPhaseAgent(runtime, { identity: "entry-fanout-agent", stream, phases, options });
}

test("AgentRuntime.start validates entryPhases arguments", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 2 });
  try {
    const dummyPhase: Phase = {
      name: "entry",
      description: "Entry",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Entry phase",
      run: async () => ({ message: "done", route: "stop" }),
    };
    const agentId = await agentWithPhases(
      runtime,
      async function* () { yield { type: "done" }; },
      { phases: new Map([[dummyPhase.name, dummyPhase]]), entryPhaseId: dummyPhase.name },
      { idempotencyKey: "entry-fanout-validate-agent" },
    );

    // Mutually exclusive with phasePayload
    await expect(runtime.start(agentId, "hello", {
      idempotencyKey: "v1",
      phasePayload: { a: 1 },
      entryPhases: [{ phase: "entry" }],
    })).rejects.toThrow(TypeError);

    // Empty array
    await expect(runtime.start(agentId, "hello", {
      idempotencyKey: "v2",
      entryPhases: [],
    })).rejects.toThrow(TypeError);

    // Blank phase name
    await expect(runtime.start(agentId, "hello", {
      idempotencyKey: "v3",
      entryPhases: [{ phase: "" }],
    })).rejects.toThrow(TypeError);

    await expect(runtime.start(agentId, "hello", {
      idempotencyKey: "v4",
      entryPhases: [{ phase: "   " }],
    })).rejects.toThrow(TypeError);

    // Non-JSON payload
    await expect(runtime.start(agentId, "hello", {
      idempotencyKey: "v5",
      entryPhases: [{ phase: "entry", payload: (() => {}) as any }],
    })).rejects.toThrow(TypeError);
  } finally {
    await runtime.close();
  }
});

test("two entry phases run concurrently and join to entry phase with both outputs in previousResults", async () => {
  let activeWorkers = 0;
  let maxActiveWorkers = 0;
  const executionOrder: string[] = [];
  let joinInjectedContent = "";

  const workerA: Phase = {
    name: "worker-a",
    description: "Worker A",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Worker A content",
    input: { fallback: "a-default", custom: "a-default-custom" },
    run: async (context) => {
      activeWorkers++;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      executionOrder.push("worker-a-start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      executionOrder.push("worker-a-done");
      activeWorkers--;
      return {
        message: "Worker A finished",
        payload: { result: "result-a", inputPayload: context.state.payload },
      };
    },
  };

  const workerB: Phase = {
    name: "worker-b",
    description: "Worker B",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Worker B content",
    input: { fallback: "b-default" },
    run: async (context) => {
      activeWorkers++;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      executionOrder.push("worker-b-start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      executionOrder.push("worker-b-done");
      activeWorkers--;
      return {
        message: "Worker B finished",
        payload: { result: "result-b", inputPayload: context.state.payload },
      };
    },
  };

  const joinPhase: Phase = {
    name: "join-phase",
    description: "Join Phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Join Phase content",
    run: async (context) => {
      executionOrder.push("join-phase");
      joinInjectedContent = context.messages
        .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join("\n");
      return { message: "all joined", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 2 });
  try {
    const agentId = await agentWithPhases(
      runtime,
      async function* () { yield { type: "done", response: stopResponse() }; },
      {
        phases: new Map([
          [workerA.name, workerA],
          [workerB.name, workerB],
          [joinPhase.name, joinPhase],
        ]),
        entryPhaseId: joinPhase.name,
      },
      { idempotencyKey: "entry-fanout-2-agent" },
    );

    const run = await runtime.start(agentId, "do parallel tasks", {
      idempotencyKey: "entry-fanout-2-run",
      entryPhases: [
        { phase: "worker-a", payload: { custom: "custom-a" } },
        { phase: "worker-b" },
      ],
    });

    const boundary = await run.wait();
    expect(boundary.type).toBe("completed");
    expect(maxActiveWorkers).toBe(2);
    expect(executionOrder).toContain("worker-a-done");
    expect(executionOrder).toContain("worker-b-done");
    expect(executionOrder.at(-1)).toBe("join-phase");

    // Verify <prev_phase_outputs> contains both worker outputs in the join phase messages
    expect(joinInjectedContent).toContain("<prev_phase_outputs>");
    expect(joinInjectedContent).toContain("worker-a");
    expect(joinInjectedContent).toContain("result-a");
    expect(joinInjectedContent).toContain("custom-a");
    expect(joinInjectedContent).toContain("worker-b");
    expect(joinInjectedContent).toContain("result-b");
    expect(joinInjectedContent).toContain("b-default");
    expect(joinInjectedContent).toContain("</prev_phase_outputs>");

    // Check Run snapshot exposes entryPhases
    const snapshot = await run.snapshot();
    expect(snapshot.entryPhases).toEqual([
      { phase: "worker-a", payload: { custom: "custom-a" } },
      { phase: "worker-b" },
    ]);
  } finally {
    await runtime.close();
  }
});

test("exactly 1 entry behaves identically to entryPhaseId = that phase + phasePayload = its payload", async () => {
  let observedPayload: unknown;
  let executedPhase: string | undefined;

  const targetPhase: Phase = {
    name: "direct-target",
    description: "Direct Target",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Direct Target content",
    input: { mode: "default-mode", opt: 42 },
    run: async (context) => {
      executedPhase = context.state.current;
      observedPayload = context.state.payload;
      return { message: "direct done", route: "stop" };
    },
  };

  const defaultEntry: Phase = {
    name: "default-entry",
    description: "Default Entry",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Default Entry content",
    run: async () => ({ message: "default entry done", route: "stop" }),
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await agentWithPhases(
      runtime,
      async function* () { yield { type: "done", response: stopResponse() }; },
      {
        phases: new Map([
          [targetPhase.name, targetPhase],
          [defaultEntry.name, defaultEntry],
        ]),
        entryPhaseId: defaultEntry.name,
      },
      { idempotencyKey: "entry-fanout-1-agent" },
    );

    const run = await runtime.start(agentId, "run direct target", {
      idempotencyKey: "entry-fanout-1-run",
      entryPhases: [
        { phase: "direct-target", payload: { mode: "explicit-mode" } },
      ],
    });

    const boundary = await run.wait();
    expect(boundary.type).toBe("completed");
    expect(executedPhase).toBe("direct-target");
    expect(observedPayload).toEqual({ mode: "explicit-mode", opt: 42 });
  } finally {
    await runtime.close();
  }
});

test("unknown phase names fail the Run clearly", async () => {
  const phase: Phase = {
    name: "known",
    description: "Known",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Known",
    run: async () => ({ message: "ok", route: "stop" }),
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 2 });
  try {
    const agentId = await agentWithPhases(
      runtime,
      async function* () { yield { type: "done" }; },
      { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name },
      { idempotencyKey: "entry-fanout-unknown-agent" },
    );

    // 1 unknown entry
    const runSingle = await runtime.start(agentId, "single unknown", {
      idempotencyKey: "unknown-run-single",
      entryPhases: [{ phase: "mystery" }],
    });
    const resultSingle = await runSingle.wait();
    expect(resultSingle.type).toBe("failed");
    if (resultSingle.type === "failed") {
      expect(resultSingle.failure.message).toContain('Phase "mystery" not found');
    }

    // 2 entries with one unknown
    const runMulti = await runtime.start(agentId, "multi unknown", {
      idempotencyKey: "unknown-run-multi",
      entryPhases: [{ phase: "known" }, { phase: "mystery2" }],
    });
    const resultMulti = await runMulti.wait();
    expect(resultMulti.type).toBe("failed");
    if (resultMulti.type === "failed") {
      expect(resultMulti.failure.message).toContain('Phase "mystery2" not found');
    }
  } finally {
    await runtime.close();
  }
});

test("resume after suspension mid-run does not re-dispatch completed parallel entries", async () => {
  let workerACalls = 0;
  let workerBCalls = 0;
  let joinCalls = 0;

  const workerA: Phase = {
    name: "worker-a",
    description: "Worker A",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Worker A",
    run: async () => {
      workerACalls++;
      return { message: "A done", payload: { val: 1 } };
    },
  };

  const workerB: Phase = {
    name: "worker-b",
    description: "Worker B",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Worker B",
    run: async () => {
      workerBCalls++;
      return { message: "B done", payload: { val: 2 } };
    },
  };

  const joinPhase: Phase = {
    name: "join-phase",
    description: "Join Phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Join Phase",
    tools: ["ask_user"],
  };

  const directory = await mkdtemp(join(tmpdir(), "rowan-entry-fanout-resume-"));
  const filename = join(directory, "runtime.sqlite");

  try {
    const store = new SqliteStore(filename);
    let runId: string;

    const runtime1 = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const agentId = await agentWithPhases(
        runtime1,
        async function* () {
          // Model initiates an interaction in the join phase
          yield {
            type: "done",
            response: {
              content: "Please approve",
              toolCalls: [
                {
                  id: "call_ask",
                  name: "ask_user",
                  arguments: JSON.stringify({ prompt: "Please approve." }),
                },
              ],
              stopReason: "tool_use",
            },
          };
        },
        {
          phases: new Map([
            [workerA.name, workerA],
            [workerB.name, workerB],
            [joinPhase.name, joinPhase],
          ]),
          entryPhaseId: joinPhase.name,
        },
        { idempotencyKey: "resume-fanout-agent" },
      );

      const run = await runtime1.start(agentId, "start and suspend", {
        idempotencyKey: "resume-fanout-run",
        entryPhases: [{ phase: "worker-a" }, { phase: "worker-b" }],
      });
      runId = run.id;

      const boundary = await run.wait();
      expect(boundary.type).toBe("input_required");
      expect(workerACalls).toBe(1);
      expect(workerBCalls).toBe(1);
    } finally {
      await runtime1.close();
    }

    // Now resume the run
    const runtime2 = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const resumed = runtime2.run(runId as never);
      const snapshot = await resumed.snapshot();
      expect(snapshot.state).toBe("input_required");

      if (snapshot.state === "input_required") {
        await resumed.respondInteraction({
          interactionId: snapshot.interactions[0]!.id,
          input: "Approved!",
        });
      }

      // Resume execution
      const boundary = await resumed.wait();
      // Verify workers were not invoked again
      expect(workerACalls).toBe(1);
      expect(workerBCalls).toBe(1);
    } finally {
      await runtime2.close();
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
