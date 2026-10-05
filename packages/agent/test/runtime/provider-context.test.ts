import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelStream, isValidToolProgress, type ProviderCallContext, type ProviderStreamFn, type StreamFn, type ToolCall, type ToolCallOutcome, type ToolProgress } from "@rowan-agent/models";
import Type from "typebox";
import { AgentRuntime, InMemoryStore, SqliteStore, type ToolCallPresentationInput, type ToolCallPresentationOutput } from "../../src";
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

test("ctx.tools.call options.onUpdate receives start, progress update with raw ToolProgress, and final state", async () => {
  const capturedPresentProgress: (ToolProgress | undefined)[] = [];
  const tool = {
    name: "progress_tool",
    description: "A tool that reports progress and provides presentation",
    parameters: Type.Object({ text: Type.String() }),
    kind: "execute" as const,
    _meta: { key: "initial_meta" },
    present(call: ToolCallPresentationInput): ToolCallPresentationOutput | void {
      capturedPresentProgress.push(call.progress);
      if (call.status === "in_progress") {
        if (call.progress) {
          return {
            title: `Progress: ${call.progress.progress}% (${call.progress.message})`,
            locations: [{ path: "file.txt", line: 42 }],
            _meta: {
              step: call.progress.progress,
              ...(call.progress.total !== undefined ? { total: call.progress.total } : {}),
              ...(call.progress._meta ?? {}),
            },
          };
        }
        return {
          title: "Starting tool...",
          locations: [{ path: "file.txt" }],
        };
      }
      if (call.status === "completed") {
        return {
          title: "Tool finished successfully",
          _meta: { done: true },
        };
      }
    },
    async execute(args: any, ctx: any) {
      ctx.reportProgress({
        progress: 50,
        total: 100,
        message: "halfway",
        _meta: { detail: "chunk-1" },
      });
      return { ok: true, content: [{ type: "text" as const, text: `Processed ${args.text}` }] };
    },
  };

  const updates: { toolCall: ToolCall; progress?: ToolProgress }[] = [];
  let callOutcome: ToolCallOutcome | undefined;

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    callOutcome = await ctx.tools.call(
      "progress_tool",
      { text: "hello" },
      { onUpdate: (tc, prog) => updates.push({ toolCall: { ...tc }, progress: prog ? { ...prog } : undefined }) },
    );

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
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-tools-call-onupdate",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-tools-call-onupdate-key" },
    });

    const run = await runtime.start(agentId, "test onUpdate", {
      idempotencyKey: "run-tools-call-onupdate-key",
    });

    // Capture live events (including transient progress events)
    const observedEvents: any[] = [];
    const observePromise = (async () => {
      for await (const event of run.observe()) {
        if (event.kind === "tool_state_changed") {
          observedEvents.push(event);
        }
      }
    })();

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await observePromise;

    expect(callOutcome).toEqual({
      ok: true,
      content: [{ type: "text", text: "Processed hello" }],
    });

    // onUpdate must have received start, progress, and final updates
    expect(updates.length).toBe(3);

    // 1. Start update: no progress parameter
    expect(updates[0]!.toolCall.status).toBe("in_progress");
    expect(updates[0]!.toolCall.title).toBe("Starting tool...");
    expect(updates[0]!.toolCall.locations).toEqual([{ path: "file.txt" }]);
    expect(updates[0]!.toolCall.kind).toBe("execute");
    expect(updates[0]!.progress).toBeUndefined();

    // 2. Progress update: raw ToolProgress passed
    expect(updates[1]!.toolCall.status).toBe("in_progress");
    expect(updates[1]!.toolCall.title).toBe("Progress: 50% (halfway)");
    expect(updates[1]!.toolCall.locations).toEqual([{ path: "file.txt", line: 42 }]);
    expect(updates[1]!.toolCall._meta).toEqual({ step: 50, total: 100, detail: "chunk-1" });
    expect(updates[1]!.progress).toEqual({
      progress: 50,
      total: 100,
      message: "halfway",
      _meta: { detail: "chunk-1" },
    });

    // 3. Final update: no progress parameter
    expect(updates[2]!.toolCall.status).toBe("completed");
    expect(updates[2]!.toolCall.title).toBe("Tool finished successfully");
    expect(updates[2]!.toolCall._meta).toEqual({ step: 50, total: 100, detail: "chunk-1", done: true });
    expect(updates[2]!.progress).toBeUndefined();

    // Verify present(call) received call.progress
    const progressPresentCall = capturedPresentProgress.find((p) => p !== undefined);
    expect(progressPresentCall).toEqual({
      progress: 50,
      total: 100,
      message: "halfway",
      _meta: { detail: "chunk-1" },
    });

    // Match observed tool_state_changed events with onUpdate updates
    const startEvent = observedEvents.find(
      (e) => e.transition.from === "pending" && e.transition.to === "in_progress",
    );
    const progressEvent = observedEvents.find(
      (e) => e.transition.from === "in_progress" && e.transition.to === "in_progress",
    );
    const completedEvent = observedEvents.find(
      (e) => e.transition.to === "completed",
    );

    expect(startEvent).toBeDefined();
    expect(progressEvent).toBeDefined();
    expect(completedEvent).toBeDefined();

    expect(startEvent!.toolCall.title).toBe(updates[0]!.toolCall.title);
    expect(progressEvent!.toolCall.title).toBe(updates[1]!.toolCall.title);
    expect(completedEvent!.toolCall.title).toBe(updates[2]!.toolCall.title);
  } finally {
    await runtime.close();
  }
});

test("ToolProgress shape validation and invalid report drop behavior", async () => {
  // 1. Validator unit checks
  expect(isValidToolProgress({ progress: 0 })).toBe(true);
  expect(isValidToolProgress({ progress: 42.5 })).toBe(true);
  expect(isValidToolProgress({ progress: 100, total: 200 })).toBe(true);
  expect(isValidToolProgress({ progress: 50, message: "downloading", _meta: { file: "a.zip" } })).toBe(true);

  // Invalid: non-finite or missing progress
  expect(isValidToolProgress(null)).toBe(false);
  expect(isValidToolProgress(undefined)).toBe(false);
  expect(isValidToolProgress("invalid")).toBe(false);
  expect(isValidToolProgress(123)).toBe(false);
  expect(isValidToolProgress([])).toBe(false);
  expect(isValidToolProgress({})).toBe(false);
  expect(isValidToolProgress({ progress: "50" })).toBe(false);
  expect(isValidToolProgress({ progress: NaN })).toBe(false);
  expect(isValidToolProgress({ progress: Infinity })).toBe(false);
  expect(isValidToolProgress({ progress: -Infinity })).toBe(false);

  // Invalid: non-finite total
  expect(isValidToolProgress({ progress: 50, total: "100" })).toBe(false);
  expect(isValidToolProgress({ progress: 50, total: NaN })).toBe(false);
  expect(isValidToolProgress({ progress: 50, total: Infinity })).toBe(false);

  // Invalid: message not string
  expect(isValidToolProgress({ progress: 50, message: 123 })).toBe(false);
  expect(isValidToolProgress({ progress: 50, message: {} })).toBe(false);

  // Invalid: _meta not object
  expect(isValidToolProgress({ progress: 50, _meta: "str" })).toBe(false);
  expect(isValidToolProgress({ progress: 50, _meta: [1, 2] })).toBe(false);

  // 2. Integration test: invalid reports dropped with warning, never failing the tool
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(" "));
  };

  const progressUpdates: ToolProgress[] = [];
  const testTool = {
    name: "validation_tool",
    description: "Tests progress validation",
    parameters: Type.Object({}),
    present(call: ToolCallPresentationInput): ToolCallPresentationOutput | void {
      if (call.status === "in_progress" && call.progress) {
        return { title: `Valid progress: ${call.progress.progress}` };
      }
    },
    async execute(_args: any, ctx: any) {
      // Invalid reports: should be dropped with warning, not failing the tool
      ctx.reportProgress({ percent: 50 } as any); // wrong key
      ctx.reportProgress({ progress: NaN } as any); // NaN
      ctx.reportProgress({ progress: Infinity } as any); // Infinity
      ctx.reportProgress("bad-string" as any); // non-object
      ctx.reportProgress({ progress: 10, total: NaN } as any); // NaN total
      ctx.reportProgress({ progress: 20, message: 404 } as any); // non-string message
      ctx.reportProgress({ progress: 30, _meta: "not-an-object" } as any); // non-object _meta

      // Valid report: should succeed and trigger update
      ctx.reportProgress({ progress: 99, message: "almost done" });

      return { ok: true, content: [{ type: "text" as const, text: "validation complete" }] };
    },
  };

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;
    await ctx.tools.call(
      "validation_tool",
      {},
      {
        onUpdate: (_tc, prog) => {
          if (prog) progressUpdates.push(prog);
        },
      },
    );
    yield { type: "done", response: stopResponse("done") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-progress-validation",
      stream,
      tools: [testTool],
      options: { idempotencyKey: "agent-progress-validation-key" },
    });

    const run = await runtime.start(agentId, "test validation", {
      idempotencyKey: "run-progress-validation-key",
    });

    const boundary = await run.wait();
    expect(boundary).toMatchObject({ type: "completed" });

    // Warnings logged for invalid reports
    expect(warnings.length).toBeGreaterThanOrEqual(7);
    expect(warnings.some((w) => w.includes("Invalid progress report"))).toBe(true);

    // Only the single valid report triggered an onUpdate progress notification
    expect(progressUpdates.length).toBe(1);
    expect(progressUpdates[0]).toEqual({ progress: 99, message: "almost done" });
  } finally {
    console.warn = originalWarn;
    await runtime.close();
  }
});

test("ctx.tools.call per-call abort cancels only that call while the Run continues", async () => {
  let cancellableToolStarted = false;
  let cancellableToolAborted = false;

  const cancellableTool = {
    name: "cancellable_tool",
    description: "A tool that waits to be aborted",
    parameters: Type.Object({}),
    async execute(_args: any, _ctx: any, signal: AbortSignal) {
      cancellableToolStarted = true;
      return new Promise<any>((_, reject) => {
        signal.addEventListener("abort", () => {
          cancellableToolAborted = true;
          reject(new DOMException("Cancelled by caller", "AbortError"));
        });
      });
    },
  };

  const secondTool = {
    name: "second_tool",
    description: "A second tool called after aborting the first",
    parameters: Type.Object({}),
    async execute() {
      return { ok: true, content: [{ type: "text" as const, text: "second tool output" }] };
    },
  };

  let firstCallOutcome: ToolCallOutcome | undefined;
  let secondCallOutcome: ToolCallOutcome | undefined;
  const updates: ToolCall[] = [];
  let providerSignalAbortedDuringExecution: boolean | undefined;

  const stream: StreamFn = async function* (_request, rawCtx) {
    const ctx = rawCtx as ProviderCallContext;

    const perCallController = new AbortController();
    const callPromise = ctx.tools.call("cancellable_tool", {}, {
      signal: perCallController.signal,
      onUpdate: (tc) => updates.push({ ...tc }),
    });

    // Wait until the tool starts executing
    while (!cancellableToolStarted) {
      await new Promise((r) => setTimeout(r, 10));
    }

    // Abort ONLY this single tool call
    perCallController.abort("User cancelled tool");

    firstCallOutcome = await callPromise;
    providerSignalAbortedDuringExecution = ctx.signal.aborted;

    // Call the second tool: it should succeed, showing the Run and provider context remain active
    secondCallOutcome = await ctx.tools.call("second_tool", {});

    yield {
      type: "text_delta",
      text: "all finished",
      partial: { role: "assistant", contentBlocks: [{ type: "text", text: "all finished" }] },
    };
    yield { type: "done", response: stopResponse("all finished") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-per-call-abort",
      stream,
      tools: [cancellableTool, secondTool],
      options: { idempotencyKey: "agent-per-call-abort-key" },
    });

    const run = await runtime.start(agentId, "test per-call abort", {
      idempotencyKey: "run-per-call-abort-key",
    });

    const boundary = await run.wait();
    expect(boundary).toMatchObject({ type: "completed" });

    // The tool actually received the abort
    expect(cancellableToolAborted).toBe(true);

    // The first tool call settled as failed
    expect(firstCallOutcome).toBeDefined();
    expect(firstCallOutcome?.ok).toBe(false);
    if (firstCallOutcome && !firstCallOutcome.ok) {
      expect(firstCallOutcome.error).toBeDefined();
    }

    // The provider's ctx.signal was NOT aborted
    expect(providerSignalAbortedDuringExecution).toBe(false);

    // The second tool call executed and succeeded
    expect(secondCallOutcome).toEqual({
      ok: true,
      content: [{ type: "text", text: "second tool output" }],
    });

    // onUpdate for the aborted call received start and failed state
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates[0]!.status).toBe("in_progress");
    expect(updates.at(-1)!.status).toBe("failed");
  } finally {
    await runtime.close();
  }
});

