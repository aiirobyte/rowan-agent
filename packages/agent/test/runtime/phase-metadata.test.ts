import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { createPhaseAgent } from "../fixtures/configuration";
import type { Phase } from "../../src/harness/phases/types";
import { stopResponse } from "./route-test-utils";

test("integration: model Phase with frontmatter-style metadata calling a Tool -> before_tool_call sees event.phase", async () => {
  let beforeEvent: any;
  let afterEvent: any;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "test_tool",
      description: "A test tool",
      parameters: { type: "object", properties: { input: { type: "string" } } },
      execute: async (args: any) => ({ content: [{ type: "text", text: `ok: ${args.input}` }] }),
    });
    api.hooks.on("before_tool_call", (event) => {
      beforeEvent = event;
      return { allow: true };
    });
    api.hooks.on("after_tool_call", (event) => {
      afterEvent = event;
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_test_tool";
      const args = JSON.stringify({ input: "hello" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "test_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "test_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "test_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const phase: Phase = {
    name: "review-phase",
    description: "Review phase",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Review phase body",
    metadata: {
      permission: "admin",
      audit: { enabled: true },
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
      identity: "agent-phase-metadata",
      stream,
      phases: {
        phases: new Map([[phase.name, phase]]),
        entryPhaseId: phase.name,
      },
      options: { idempotencyKey: "agent-phase-metadata-key" },
    });

    const run = await runtime.start(agentId, "start task", {
      idempotencyKey: "run-phase-metadata-key",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(beforeEvent).toBeDefined();
    expect(beforeEvent.phase).toEqual({
      name: "review-phase",
      metadata: {
        permission: "admin",
        audit: { enabled: true },
      },
    });

    expect(afterEvent).toBeDefined();
    expect(afterEvent.phase).toEqual({
      name: "review-phase",
      metadata: {
        permission: "admin",
        audit: { enabled: true },
      },
    });
  } finally {
    await runtime.close();
  }
});

test("integration: Tool call issued by a code Phase's runInternalModelLoop sees event.phase with name and metadata", async () => {
  let beforeEvent: any;
  let afterEvent: any;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "loop_tool",
      description: "Loop tool",
      parameters: { type: "object", properties: { query: { type: "string" } } },
      execute: async (args: any) => ({ content: [{ type: "text", text: `loop-ok: ${args.query}` }] }),
    });
    api.hooks.on("before_tool_call", (event) => {
      beforeEvent = event;
      return { allow: true };
    });
    api.hooks.on("after_tool_call", (event) => {
      afterEvent = event;
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_loop_tool";
      const args = JSON.stringify({ query: "search" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "loop_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "loop_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "loop_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "loop done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "loop done" }] } };
    yield { type: "done", response: stopResponse("loop done") };
  };

  const codePhase: Phase = {
    name: "code-phase",
    description: "Code phase with run()",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Code phase body",
    metadata: {
      permission: "internal",
      flags: [1, 2],
    },
    run: async (context, execution) => {
      await execution.runInternalModelLoop(context, {
        prompt: "internal prompt",
        tools: ["loop_tool"],
      });
      return { route: "stop", message: "finished" };
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
      identity: "agent-code-phase-metadata",
      stream,
      phases: {
        phases: new Map([[codePhase.name, codePhase]]),
        entryPhaseId: codePhase.name,
      },
      options: { idempotencyKey: "agent-code-phase-metadata-key" },
    });

    const run = await runtime.start(agentId, "start code task", {
      idempotencyKey: "run-code-phase-metadata-key",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(beforeEvent).toBeDefined();
    expect(beforeEvent.phase).toEqual({
      name: "code-phase",
      metadata: {
        permission: "internal",
        flags: [1, 2],
      },
    });

    expect(afterEvent).toBeDefined();
    expect(afterEvent.phase).toEqual({
      name: "code-phase",
      metadata: {
        permission: "internal",
        flags: [1, 2],
      },
    });
  } finally {
    await runtime.close();
  }
});
