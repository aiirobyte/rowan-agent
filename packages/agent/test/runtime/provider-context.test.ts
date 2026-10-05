import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelStream, type ProviderCallContext, type ProviderStreamFn, type StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

test("provider receives run-bound context (run id, agentId, scope, cwd, signal)", async () => {
  let capturedCtx: ProviderCallContext | undefined;

  const stream: StreamFn = async function* (_request, ctx) {
    capturedCtx = ctx as ProviderCallContext;
    yield {
      type: "text_delta",
      text: "hello",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "hello" }] },
    };
    yield { type: "done", response: stopResponse("hello") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-provider-ctx",
      stream,
      options: { idempotencyKey: "agent-provider-ctx-key" },
    });

    const testScope = [
      { kind: "team", id: "team-abc" },
      { kind: "project", id: "proj-123" },
    ];

    const run = await runtime.start(agentId, "test prompt", {
      idempotencyKey: "run-provider-ctx-key",
      cwd: "/custom/worktree/path",
      scope: testScope,
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.run.id).toBe(run.id);
    expect(capturedCtx!.run.agentId).toBe(agentId);
    expect(capturedCtx!.run.cwd).toBe("/custom/worktree/path");
    expect(capturedCtx!.run.scope).toEqual(testScope);
    expect(capturedCtx!.signal).toBeDefined();
    expect(capturedCtx!.signal.aborted).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("provider tools.list returns tool summaries and tools.call goes through before_tool_call and blocks or executes", async () => {
  let listSummaries: readonly any[] = [];
  let blockedOutcome: any;
  let allowedOutcome: any;
  let beforeHookCalls = 0;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "safe_calc",
      description: "Perform calculation",
      parameters: { type: "object", properties: { n: { type: "number" } } },
      execute: async (args: any) => ({ content: [{ type: "text", text: String((args?.n ?? 0) * 2) }] }),
    });

    api.hooks.on("before_tool_call", async (event) => {
      beforeHookCalls += 1;
      if (event.tool.name === "safe_calc" && (event.args as any)?.n === -1) {
        return { allow: false, reason: "Negative numbers forbidden" };
      }
      return { allow: true };
    });
  }, process.cwd(), "<test:tools-call-ext>");

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    listSummaries = ctx.tools.list();

    // 1. Call tool with negative number (should be blocked by before_tool_call hook)
    blockedOutcome = await ctx.tools.call("safe_calc", { n: -1 });

    // 2. Call tool with valid number (should be allowed and executed)
    allowedOutcome = await ctx.tools.call("safe_calc", { n: 21 });

    yield {
      type: "text_delta",
      text: "done",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] },
    };
    yield { type: "done", response: stopResponse("done") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-tools-call",
      stream,
      options: { idempotencyKey: "agent-tools-call-key" },
    });

    const run = await runtime.start(agentId, "calculate", {
      idempotencyKey: "run-tools-call-key",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // Check tools.list()
    expect(listSummaries.some((t) => t.name === "safe_calc")).toBe(true);

    // Check before_tool_call hook ran for both calls
    expect(beforeHookCalls).toBe(2);

    // Check blocked call
    expect(blockedOutcome).toEqual({
      ok: false,
      content: null,
      error: "Negative numbers forbidden",
    });

    // Check allowed call
    expect(allowedOutcome).toEqual({
      ok: true,
      content: [{ type: "text", text: "42" }],
    });
  } finally {
    await runtime.close();
  }
});

test("provider interact resolves when answered and live interaction is visible on snapshot", async () => {
  let interactionResolvedAnswer: any;

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    interactionResolvedAnswer = await ctx.interact({
      kind: "confirmation",
      prompt: "Do you confirm deployment?",
    });

    yield {
      type: "text_delta",
      text: "deployment confirmed",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "deployment confirmed" }] },
    };
    yield { type: "done", response: stopResponse("deployment confirmed") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-interact",
      stream,
      options: { idempotencyKey: "agent-interact-key" },
    });

    const run = await runtime.start(agentId, "deploy", {
      idempotencyKey: "run-interact-key",
    });

    // Wait until snapshot shows the live interaction while run is running
    let interactionId: string | undefined;
    for (let i = 0; i < 50; i++) {
      const snap = await runtime.snapshot(run.id);
      if ("interactions" in snap && snap.interactions && snap.interactions.length > 0) {
        interactionId = snap.interactions[0]!.id;
        expect(snap.interactions[0]!.prompt).toBe("Do you confirm deployment?");
        expect(snap.interactions[0]!.kind).toBe("confirmation");
        break;
      }
      await Bun.sleep(20);
    }

    expect(interactionId).toBeDefined();

    // Respond to the live interaction
    await runtime.respondInteraction(run.id, {
      interactionId: interactionId!,
      input: "confirmed_by_user",
    });

    const boundary = await run.wait();
    expect(boundary.type).toBe("completed");
    expect(interactionResolvedAnswer).toBe("confirmed_by_user");
  } finally {
    await runtime.close();
  }
});

test("provider interact rejects when cancelled or run is aborted", async () => {
  let interactionError: any;

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    try {
      await ctx.interact({
        kind: "permission",
        prompt: "Allow database wipe?",
      });
    } catch (err) {
      interactionError = err;
      throw err;
    }
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-interact-cancel",
      stream,
      options: { idempotencyKey: "agent-interact-cancel-key" },
    });

    const run = await runtime.start(agentId, "wipe", {
      idempotencyKey: "run-interact-cancel-key",
    });

    // Wait until interaction is pending
    for (let i = 0; i < 50; i++) {
      const snap = await runtime.snapshot(run.id);
      if ("interactions" in snap && snap.interactions && snap.interactions.length > 0) break;
      await Bun.sleep(20);
    }

    // Cancel the run
    await run.cancel("Cancelled by test");

    await run.wait().catch(() => {});
    expect(interactionError).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("provider tools.report produces tool_state_changed event with tool_call replacement/merge by toolCallId", async () => {
  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    ctx.tools.report({
      toolCallId: "call-1",
      title: "Compiling code",
      kind: "execute",
      status: "in_progress",
    });

    // Updated tool call with same ID replaces earlier one
    ctx.tools.report({
      toolCallId: "call-1",
      title: "Compilation finished",
      status: "completed",
    });

    yield {
      type: "text_delta",
      text: "all done",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "all done" }] },
    };
    yield { type: "done", response: stopResponse("all done") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-report-activity",
      stream,
      options: { idempotencyKey: "agent-report-activity-key" },
    });

    const run = await runtime.start(agentId, "build project", {
      idempotencyKey: "run-report-activity-key",
    });

    const observedEvents: any[] = [];
    const observer = (async () => {
      for await (const event of runtime.observe(run.id)) {
        observedEvents.push(event);
      }
    })();

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await observer;

    const toolEvents = observedEvents.filter((e) => e.kind === "tool_state_changed");
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);
    expect(toolEvents.map((e) => e.toolCall)).toContainEqual(expect.objectContaining({
      toolCallId: "call-1",
      title: "Compilation finished",
      status: "completed",
    }));

    // Verify external tool calls never appear in transcript/history as tool messages
    expect(observedEvents.some((e) => e.kind === "message_committed" && e.message.role === "tool")).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("durable provider tool reporting survives runtime reload / SQLite persistence and merges by toolCallId", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-durable-tool-"));
  const dbPath = join(directory, "store.sqlite");

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    // Tool call 1 initial
    ctx.tools.report({
      toolCallId: "call-1",
      title: "Tool 1 running",
      kind: "execute",
      status: "in_progress",
    });

    // Tool call 1 updated (same id -> merges/updates earlier tool call)
    ctx.tools.report({
      toolCallId: "call-1",
      title: "Tool 1 finished",
      status: "completed",
      rawOutput: { success: true },
    });

    // Tool call 2
    ctx.tools.report({
      toolCallId: "call-2",
      title: "Tool 2 finished",
      kind: "read",
      status: "completed",
    });

    yield {
      type: "text_delta",
      text: "Turn 1 finished",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "Turn 1 finished" }] },
    };
    yield { type: "done", response: stopResponse("Turn 1 finished") };
  };

  try {
    const store1 = new SqliteStore(dbPath);
    const runtime1 = await AgentRuntime.init({
      store: store1,
      concurrency: 1,
    });

    const agentId = await createAgentWith(runtime1, {
      identity: "agent-durable-tool",
      stream,
      options: { idempotencyKey: "agent-durable-tool-key" },
    });

    const run = await runtime1.start(agentId, "do something", {
      idempotencyKey: "run-durable-tool-key",
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await runtime1.close();

    // Reload with a completely new store instance and runtime instance reading the same SQLite DB
    const store2 = new SqliteStore(dbPath);
    const runtime2 = await AgentRuntime.init({
      store: store2,
      concurrency: 1,
    });

    try {
      // Replay via runtime.observe after reload
      const observedEvents: any[] = [];
      for await (const event of runtime2.observe(run.id)) {
        observedEvents.push(event);
      }
      const observedToolEvents = observedEvents.filter((e) => e.kind === "tool_state_changed");
      expect(observedToolEvents.length).toBeGreaterThanOrEqual(2);
      expect(observedToolEvents.some((e) => e.toolCall.toolCallId === "call-1" && e.toolCall.status === "completed")).toBe(true);
      expect(observedToolEvents.some((e) => e.toolCall.toolCallId === "call-2" && e.toolCall.status === "completed")).toBe(true);

      // Verify external tool calls never appear in messages
      expect(observedEvents.some((e) => e.kind === "message_committed" && e.message.role === "tool")).toBe(false);
    } finally {
      await runtime2.close();
    }

    // 2. Replay events via owner.listEvents
    const owner = await store2.openOwner({ ownerId: "test-verifier", leaseMs: 30_000 });
    const events = await owner.listEvents();
    await owner.sealAndReleaseOwner();

    const runEvents = events.filter((e) => e.runId === run.id);
    const toolEvents = runEvents.filter((e): e is Extract<typeof e, { kind: "tool_state_changed" }> => e.kind === "tool_state_changed");

    expect(toolEvents.length).toBeGreaterThanOrEqual(2);
    expect(toolEvents.every((e) => e.durability === "durable")).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("providers.register with existing id replaces earlier provider configuration", async () => {
  let activeVersion = 1;

  const streamV1: ProviderStreamFn = async function* () {
    yield { type: "text_delta", text: "v1", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "v1" }] } };
    yield { type: "done", response: stopResponse("v1") };
  };

  const streamV2: ProviderStreamFn = async function* () {
    yield { type: "text_delta", text: "v2", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "v2" }] } };
    yield { type: "done", response: stopResponse("v2") };
  };

  let registeredApi: any;
  const extension = loadExtensionFromFactory((api) => {
    registeredApi = api;
    api.providers.register({
      id: "dynamic-provider",
      displayName: "Dynamic Provider V1",
      baseUrl: "https://dynamic.example.com",
      apiKey: "dyn-key",
      protocol: "openai-completions",
      models: [
        {
          id: "dyn-model-1",
          protocol: "openai-completions",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 4096,
          maxTokens: 1024,
        },
      ],
      stream: streamV1,
    });
  }, process.cwd(), "<test:dynamic-provider-ext>");

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });

  try {
    // Replace with V2
    registeredApi.providers.register({
      id: "dynamic-provider",
      displayName: "Dynamic Provider V2",
      baseUrl: "https://dynamic.example.com",
      apiKey: "dyn-key",
      protocol: "openai-completions",
      models: [
        {
          id: "dyn-model-2",
          protocol: "openai-completions",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192,
          maxTokens: 2048,
        },
      ],
      stream: streamV2,
    });

    const agentId = await createAgentWith(runtime, {
      identity: "agent-replaced-provider",
      stream: createModelStream(),
      model: { provider: "dynamic-provider", id: "dyn-model-2" },
      options: { idempotencyKey: "agent-replaced-provider-key" },
    });

    const run = await runtime.start(agentId, "test replaced provider", {
      idempotencyKey: "run-replaced-provider-key",
    });

    const boundary = await run.wait();
    expect(boundary.type).toBe("completed");
    if (boundary.type === "completed") {
      expect(boundary.output?.content).toBe("v2");
    }
  } finally {
    await runtime.close();
  }
});

test("ui contributions list, change notification, dispose, and triggerUiAction", async () => {
  let changeCount = 0;
  let receivedUiAction: any;

  let capturedApi: any;
  let disposeSettings: (() => void) | undefined;

  const extension = loadExtensionFromFactory((api) => {
    capturedApi = api;
    disposeSettings = api.ui.contribute({
      slot: "settings",
      id: "ext-settings",
      title: "Extension Settings",
      settings: {
        sections: [
          {
            id: "main",
            title: "Main Settings",
            controls: [{ type: "boolean", path: "enabled", label: "Enable Feature" }],
          },
        ],
      },
    });

    api.ui.contribute({
      slot: "model-picker",
      id: "mp-contrib",
      provider: "acp-agent",
      status: { kind: "ready", message: "Ready to use" },
      actions: [{ id: "install", label: "Install Agent" }],
    });

    api.events.on("ui.action", (event) => {
      receivedUiAction = event;
    });
  }, process.cwd(), "<test:ui-contribute-ext>");

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });

  try {
    runtime.onUiContributionsChanged(() => {
      changeCount += 1;
    });

    const contributions = runtime.listUiContributions();
    expect(contributions).toHaveLength(2);
    expect(contributions.some((c) => c.slot === "settings" && c.id === "ext-settings")).toBe(true);
    expect(contributions.some((c) => c.slot === "model-picker" && c.id === "mp-contrib")).toBe(true);

    // Trigger UI action
    runtime.triggerUiAction({
      contributionId: "mp-contrib",
      actionId: "install",
      scope: [],
    });

    expect(receivedUiAction).toEqual({
      contributionId: "mp-contrib",
      actionId: "install",
      scope: [],
    });

    // Dispose the settings contribution
    expect(disposeSettings).toBeDefined();
    disposeSettings!();

    expect(changeCount).toBeGreaterThanOrEqual(1);

    const remaining = runtime.listUiContributions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("mp-contrib");
  } finally {
    await runtime.close();
  }
});
