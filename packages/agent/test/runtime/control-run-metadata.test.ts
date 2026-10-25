import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import type { ExtensionAgentsAPI } from "../../src/extensions/api";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import type { Phase } from "../../src/harness/phases/types";
import { createPhaseAgent } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

test("runPhase stores host metadata beside rowan on the Control Run", async () => {
  const phase: Phase = {
    name: "metadata-phase",
    description: "Metadata phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Metadata phase",
    run: async () => ({ message: "done", route: "stop" }),
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "control-metadata-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "control-metadata-agent" },
    });
    const run = await runtime.runPhase(agentId, {
      phase: phase.name,
      metadata: { hostAuthority: "wide", scope: { id: "project-1" } },
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect((await run.snapshot()).metadata).toEqual({
      hostAuthority: "wide",
      scope: { id: "project-1" },
      rowan: {
        kind: "phase",
        phase: phase.name,
      },
    });
  } finally {
    await runtime.close();
  }
});

test("runPhase refuses host metadata that claims the rowan key", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "reserved-metadata-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: { phases: new Map(), entryPhaseId: "default" },
      options: { idempotencyKey: "reserved-metadata-agent" },
    });
    await expect(runtime.runPhase(agentId, {
      phase: "default",
      metadata: { rowan: { kind: "phase", phase: "host" } },
    })).rejects.toThrow(/metadata\.rowan.*reserved/i);
  } finally {
    await runtime.close();
  }
});

test("before_tool_call sees host metadata from its Control Run", async () => {
  let observedMetadata: Readonly<Record<string, unknown>> | undefined;
  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "control_metadata_tool",
      description: "Inspect Control Run metadata.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    api.hooks.on("before_tool_call", (event) => {
      observedMetadata = event.metadata;
      return { allow: true };
    });
  }, process.cwd(), "<control-run-metadata>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_control_metadata_tool";
      const args = "{}";
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "control_metadata_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "control_metadata_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "control_metadata_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const phase: Phase = {
    name: "metadata-probe",
    description: "Metadata probe",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Metadata probe",
    run: async (context, execution) => {
      await execution.runInternalModelLoop(context, {
        prompt: "Call the metadata probe tool.",
        tools: ["control_metadata_tool"],
      });
      return { message: "done", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "control-hook-metadata-agent",
      stream,
      phases: {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "control-hook-metadata-agent" },
    });
    const run = await runtime.runPhase(agentId, {
      phase: phase.name,
      metadata: { hostAuthority: "wide" },
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observedMetadata).toMatchObject({
      hostAuthority: "wide",
      rowan: {
        kind: "phase",
        phase: phase.name,
      },
    });
  } finally {
    await runtime.close();
  }
});

test("returning an active Control Run keeps its original metadata", async () => {
  const phase: Phase = {
    name: "suspend-metadata-phase",
    description: "Suspend metadata phase",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Suspend metadata phase",
    run: async (_context, execution) => {
      execution.interaction.request({ kind: "confirmation", prompt: "confirm?" });
      execution.interaction.suspend({ checkpoint: { step: 1 } });
      return { message: "done", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createPhaseAgent(runtime, {
      identity: "active-control-metadata-agent",
      stream: async function* () { yield { type: "done", response: stopResponse() }; },
      phases: {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: "default",
      },
      options: { idempotencyKey: "active-control-metadata-agent" },
    });
    const first = await runtime.runPhase(agentId, {
      phase: phase.name,
      metadata: { invocation: "first" },
      idempotencyKey: "first-control-metadata",
    });
    await expect(first.wait()).resolves.toMatchObject({ type: "input_required" });

    const second = await runtime.runPhase(agentId, {
      phase: phase.name,
      metadata: { invocation: "second" },
      idempotencyKey: "second-control-metadata",
    });
    expect(second.id).toBe(first.id);
    expect((await second.snapshot()).metadata).toMatchObject({ invocation: "first" });
  } finally {
    await runtime.close();
  }
});

test("ExtensionAgentsAPI.runPhase options expose no metadata", () => {
  type Options = Parameters<ExtensionAgentsAPI["runPhase"]>[1];
  const metadataIsPublic: "metadata" extends keyof Options ? true : false = false;
  expect(metadataIsPublic).toBe(false);
});
