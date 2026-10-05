import { expect, test } from "bun:test";
import Type from "typebox";
import type { StreamFn, ToolCallContent, ToolDefinitionSummary } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryStore,
  mergeToolCall,
  isValidPresentationOutput,
  type ToolCallPresentationInput,
  type ToolCallPresentationOutput,
} from "../../src/runtime";
import { InMemoryExtensionHost } from "../../src";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

test("Tool present function customizes title, locations, content, and kind in tool_state_changed across all states", async () => {
  const recordedStates: string[] = [];
  const tool = {
    name: "patch_file",
    kind: "edit" as const,
    annotations: {
      title: "Patch File Annotation",
    },
    description: "Applies a patch.",
    parameters: Type.Object({ path: Type.String(), patch: Type.String() }),
    present(call: ToolCallPresentationInput): ToolCallPresentationOutput {
      recordedStates.push(call.status + (call.progress ? ":progress" : ""));
      const args = call.args as { path?: string };
      if (call.status === "pending") {
        return {
          title: `Pending edit of ${args?.path}`,
          locations: [{ path: args?.path!, line: 1 }],
          _meta: { phase: "pending", hostCustom: 100 },
        };
      }
      if (call.status === "in_progress") {
        if (call.progress) {
          return {
            title: `Progress edit of ${args?.path} (${call.progress.progress}%)`,
            _meta: { progressPercent: call.progress.progress },
          };
        }
        return {
          title: `Starting edit of ${args?.path}`,
          locations: [{ path: args?.path!, line: 1 }],
          _meta: { phase: "starting", hostCustom: 123 },
        };
      }
      return {
        title: `Editing ${args?.path}`,
        locations: [{ path: args?.path!, line: 42 }],
        content: [
          {
            type: "diff" as const,
            path: args?.path!,
            oldText: "old code",
            newText: "new code",
          },
        ],
        _meta: { phase: "completed", hostCustom: 456 },
      };
    },
    async execute(_args: unknown, context: any) {
      context.reportProgress({ progress: 50 });
      return {
        content: [{ type: "text" as const, text: "patch applied successfully" }],
        structuredContent: { applied: true, linesChanged: 1 },
      };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_patch_123";
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const args = JSON.stringify({ path: "src/index.ts", patch: "+new" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "all done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "all done" }] } };
    yield { type: "done", response: stopResponse("all done") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-present-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-present-key" },
    });

    const run = await runtime.start(agentId, "patch the file", { idempotencyKey: "run-present-key" });
    const observed: any[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const collectPromise = (async () => {
      for await (const event of { [Symbol.asyncIterator]: () => iterator }) observed.push(event);
    })();

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await collectPromise;

    expect(recordedStates).toContain("pending");
    expect(recordedStates).toContain("in_progress");
    expect(recordedStates).toContain("in_progress:progress");
    expect(recordedStates).toContain("completed");

    const pendingToolEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "pending",
    );
    expect(pendingToolEvent).toBeDefined();
    if (pendingToolEvent && pendingToolEvent.kind === "tool_state_changed") {
      expect(pendingToolEvent.toolCall.title).toBe("Pending edit of src/index.ts");
      expect(pendingToolEvent.toolCall.kind).toBe("edit");
      expect(pendingToolEvent.toolCall.locations).toEqual([{ path: "src/index.ts", line: 1 }]);
      expect(pendingToolEvent.toolCall._meta).toEqual({ phase: "pending", hostCustom: 100 });
    }

    const inProgressToolEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.durability === "durable" && e.transition.to === "in_progress",
    );
    expect(inProgressToolEvent).toBeDefined();
    if (inProgressToolEvent && inProgressToolEvent.kind === "tool_state_changed") {
      expect(inProgressToolEvent.toolCall.title).toBe("Starting edit of src/index.ts");
      expect(inProgressToolEvent.toolCall.kind).toBe("edit");
      expect(inProgressToolEvent.toolCall.locations).toEqual([{ path: "src/index.ts", line: 1 }]);
      expect(inProgressToolEvent.toolCall._meta).toEqual({ phase: "starting", hostCustom: 123 });
    }

    const progressToolEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.durability === "transient" && e.toolCall.title?.includes("Progress edit"),
    );
    expect(progressToolEvent).toBeDefined();
    if (progressToolEvent && progressToolEvent.kind === "tool_state_changed") {
      expect(progressToolEvent.toolCall.title).toBe("Progress edit of src/index.ts (50%)");
      expect(progressToolEvent.toolCall._meta).toEqual({ phase: "starting", hostCustom: 123, progressPercent: 50 });
    }

    const completedToolEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "completed",
    );
    expect(completedToolEvent).toBeDefined();
    if (completedToolEvent && completedToolEvent.kind === "tool_state_changed") {
      expect(completedToolEvent.toolCall.title).toBe("Editing src/index.ts");
      expect(completedToolEvent.toolCall.kind).toBe("edit");
      expect(completedToolEvent.toolCall.locations).toEqual([{ path: "src/index.ts", line: 42 }]);
      expect(completedToolEvent.toolCall.content).toEqual([
        {
          type: "diff",
          path: "src/index.ts",
          oldText: "old code",
          newText: "new code",
        },
      ]);
      expect(completedToolEvent.toolCall.rawInput).toEqual({ path: "src/index.ts", patch: "+new" });
      expect(completedToolEvent.toolCall.rawOutput).toEqual({ applied: true, linesChanged: 1 });
      // _meta merges per top-level key: hostCustom replaced with 456, phase with completed, progressPercent retained
      expect(completedToolEvent.toolCall._meta).toEqual({ phase: "completed", hostCustom: 456, progressPercent: 50 });
    }
  } finally {
    await runtime.close();
  }
});

test("Tool without present function defaults title to annotations.title ?? name, content to MCP blocks, and progress produces no update", async () => {
  const tool = {
    name: "fetch_data",
    kind: "fetch" as const,
    annotations: {
      title: "Fetch Remote Data",
    },
    description: "Fetches remote data.",
    parameters: Type.Object({ url: Type.String() }),
    async execute(_args: unknown, context: any) {
      context.reportProgress({ progress: 50 });
      return {
        content: [
          { type: "text" as const, text: "remote payload" },
          { type: "resource_link" as const, uri: "https://example.com/data.json", name: "data.json" },
        ],
        structuredContent: { status: 200 },
      };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_fetch_456";
  let secondRequest: Parameters<StreamFn>[0] | undefined;
  const stream: StreamFn = async function* (req) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const args = JSON.stringify({ url: "https://example.com/data.json" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    secondRequest = req;
    yield { type: "text_delta", text: "finished", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "finished" }] } };
    yield { type: "done", response: stopResponse("finished") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-default-present-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-default-present-key" },
    });

    const run = await runtime.start(agentId, "fetch it", { idempotencyKey: "run-default-present-key" });
    const observed: any[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const collectPromise = (async () => {
      for await (const event of { [Symbol.asyncIterator]: () => iterator }) observed.push(event);
    })();

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await collectPromise;

    // Progress reports produce NO update when tool has no present
    const transientUpdates = observed.filter(
      (e) => e.kind === "tool_state_changed" && e.durability === "transient",
    );
    expect(transientUpdates.length).toBe(0);

    const completedEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "completed",
    );
    expect(completedEvent).toBeDefined();
    if (completedEvent && completedEvent.kind === "tool_state_changed") {
      expect(completedEvent.toolCall.title).toBe("Fetch Remote Data");
      expect(completedEvent.toolCall.kind).toBe("fetch");
      expect(completedEvent.toolCall.content).toEqual([
        { type: "content", content: { type: "text", text: "remote payload" } },
        { type: "content", content: { type: "resource_link", uri: "https://example.com/data.json", name: "data.json" } },
      ]);
      expect(completedEvent.toolCall.rawOutput).toEqual({ status: 200 });
    }

    // Verify unflattened content in model message
    expect(secondRequest).toBeDefined();
    const toolMsg = secondRequest?.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("Tool present function omitting content defaults to wrapped MCP content blocks while preserving _meta", async () => {
  const tool = {
    name: "read_resource",
    kind: "read" as const,
    description: "Reads a resource.",
    parameters: Type.Object({ id: Type.String() }),
    present(call: ToolCallPresentationInput) {
      const args = call.args as { id?: string };
      if (call.status === "pending" || call.status === "in_progress") {
        return {
          title: `Reading ${args?.id}`,
          _meta: { step: "reading", bytes: 0 },
        };
      }
      return {
        title: `Read ${args?.id}`,
        _meta: { step: "done", bytes: 42 },
      };
    },
    async execute(_args: unknown) {
      return {
        content: [
          { type: "text" as const, text: "resource content" },
        ],
        structuredContent: { bytes: 42 },
      };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_read_789";
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const args = JSON.stringify({ id: "res_1" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "finished", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "finished" }] } };
    yield { type: "done", response: stopResponse("finished") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-read-present-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-read-present-key" },
    });

    const run = await runtime.start(agentId, "read it", { idempotencyKey: "run-read-present-key" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const observed = [];
    for await (const event of run.observe()) observed.push(event);

    const inProgressEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "in_progress",
    );
    expect(inProgressEvent).toBeDefined();
    if (inProgressEvent && inProgressEvent.kind === "tool_state_changed") {
      expect(inProgressEvent.toolCall.title).toBe("Reading res_1");
      expect(inProgressEvent.toolCall._meta).toEqual({ step: "reading", bytes: 0 });
    }

    const completedEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "completed",
    );
    expect(completedEvent).toBeDefined();
    if (completedEvent && completedEvent.kind === "tool_state_changed") {
      expect(completedEvent.toolCall.title).toBe("Read res_1");
      expect(completedEvent.toolCall.kind).toBe("read");
      expect(completedEvent.toolCall._meta).toEqual({ step: "done", bytes: 42 });
      expect(completedEvent.toolCall.content).toEqual([
        { type: "content", content: { type: "text", text: "resource content" } },
      ]);
      expect(completedEvent.toolCall.rawOutput).toEqual({ bytes: 42 });
    }
  } finally {
    await runtime.close();
  }
});

test("Tool present function called on tool failure with status failed and result", async () => {
  let failureCallReceived: ToolCallPresentationInput | undefined;
  const tool = {
    name: "failing_tool",
    description: "A tool that fails.",
    parameters: Type.Object({ query: Type.String() }),
    present(call: ToolCallPresentationInput) {
      if (call.status === "failed") {
        failureCallReceived = call;
        return {
          title: `Failed to execute: ${(call.args as any)?.query}`,
          _meta: { failureRecorded: true },
        };
      }
      return { title: `Executing: ${(call.args as any)?.query}` };
    },
    async execute(_args: unknown) {
      return {
        ok: false as const,
        content: null,
        error: "Network timeout",
      };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_fail_001";
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const args = JSON.stringify({ query: "SELECT 1" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "handled error", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "handled error" }] } };
    yield { type: "done", response: stopResponse("handled error") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-fail-present-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-fail-present-key" },
    });

    const run = await runtime.start(agentId, "run failing query", { idempotencyKey: "run-fail-present-key" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(failureCallReceived).toBeDefined();
    expect(failureCallReceived?.status).toBe("failed");
    expect(failureCallReceived?.result?.ok).toBe(false);
    if (failureCallReceived?.result && !failureCallReceived.result.ok) {
      expect(failureCallReceived.result.error).toBe("Network timeout");
    }

    const observed = [];
    for await (const event of run.observe()) observed.push(event);

    const failedEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "failed",
    );
    expect(failedEvent).toBeDefined();
    if (failedEvent && failedEvent.kind === "tool_state_changed") {
      expect(failedEvent.toolCall.title).toBe("Failed to execute: SELECT 1");
      expect(failedEvent.toolCall._meta).toEqual({ failureRecorded: true });
    }
  } finally {
    await runtime.close();
  }
});

test("Tool definition _meta is preserved untouched in tools.list() summaries", async () => {
  const tool = {
    name: "meta_tool",
    description: "A tool with metadata.",
    parameters: Type.Object({}),
    _meta: {
      i18nKey: "tools.meta_tool.title",
      category: "database",
      features: ["async", "readOnly"],
    },
    async execute(): Promise<any> {
      return { ok: true, content: [{ type: "text", text: "ok" }] };
    },
  };

  let capturedTools: readonly ToolDefinitionSummary[] | undefined;
  const stream: StreamFn = async function* (req, ctx) {
    capturedTools = ctx?.tools?.list();
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-meta-tool-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-meta-tool-key" },
    });

    const run = await runtime.start(agentId, "test meta", { idempotencyKey: "run-meta-tool-key" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(capturedTools).toBeDefined();
    const metaToolSummary = capturedTools?.find((t) => t.name === "meta_tool");
    expect(metaToolSummary).toBeDefined();
    expect(metaToolSummary?._meta).toEqual({
      i18nKey: "tools.meta_tool.title",
      category: "database",
      features: ["async", "readOnly"],
    });
  } finally {
    await runtime.close();
  }
});

test("Throwing present or invalid shape falls back to default presenter without failing tool call", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.map(String).join(" "));
  };

  const tool = {
    name: "fragile_tool",
    annotations: { title: "Fragile Tool Default" },
    description: "A tool with broken presenter.",
    parameters: Type.Object({ val: Type.String() }),
    present(call: ToolCallPresentationInput) {
      if (call.status === "pending") {
        throw new Error("Simulated presentation crash on pending");
      }
      if (call.status === "in_progress") {
        return { locations: "not-an-array" as any }; // invalid shape
      }
      return { title: 999 as any }; // invalid shape on completion
    },
    async execute() {
      return { content: [{ type: "text" as const, text: "execution succeeded" }] };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_fragile_123";
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const args = JSON.stringify({ val: "hello" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "all good", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "all good" }] } };
    yield { type: "done", response: stopResponse("all good") };
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-fragile-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-fragile-key" },
    });

    const run = await runtime.start(agentId, "run fragile tool", { idempotencyKey: "run-fragile-key" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // Warnings logged
    expect(warnings.some((w) => w.includes("present() threw"))).toBe(true);
    expect(warnings.some((w) => w.includes("present() returned invalid shape"))).toBe(true);

    const observed = [];
    for await (const event of run.observe()) observed.push(event);

    const completedEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "completed",
    );
    expect(completedEvent).toBeDefined();
    if (completedEvent && completedEvent.kind === "tool_state_changed") {
      // Fell back to default title and content
      expect(completedEvent.toolCall.title).toBe("Fragile Tool Default");
      expect(completedEvent.toolCall.content).toEqual([
        { type: "content", content: { type: "text", text: "execution succeeded" } },
      ]);
    }
  } finally {
    console.warn = originalWarn;
    await runtime.close();
  }
});

test("mergeToolCall correctly implements merge semantics", () => {
  const target: Record<string, any> = {
    title: "Old Title",
    kind: "read" as const,
    locations: [{ path: "file.ts", line: 10 }],
    content: [{ type: "terminal" as const, terminalId: "term-1" }],
    _meta: {
      "ext/a": 1,
      "ext/b": "keep",
    },
  };

  const patch: Record<string, any> = {
    title: "New Title",
    locations: [{ path: "file.ts", line: 20 }],
    _meta: {
      "ext/a": 2,
      "ext/c": true,
    },
  };

  const result = mergeToolCall(target, patch);

  // Field replacement
  expect(result.title).toBe("New Title");
  expect(result.locations).toEqual([{ path: "file.ts", line: 20 }]);

  // Absent fields kept
  expect(result.kind).toBe("read");
  expect(result.content).toEqual([{ type: "terminal", terminalId: "term-1" }]);

  // _meta merged per top-level key
  expect(result._meta).toEqual({
    "ext/a": 2,
    "ext/b": "keep",
    "ext/c": true,
  });
});

test("isValidPresentationOutput validates presentation shape accurately", () => {
  expect(isValidPresentationOutput(null)).toBe(false);
  expect(isValidPresentationOutput([])).toBe(false);
  expect(isValidPresentationOutput("string")).toBe(false);
  expect(isValidPresentationOutput({})).toBe(true);
  expect(isValidPresentationOutput({ title: "ok" })).toBe(true);
  expect(isValidPresentationOutput({ title: 123 })).toBe(false);
  expect(isValidPresentationOutput({ locations: [{ path: "a.ts" }] })).toBe(true);
  expect(isValidPresentationOutput({ locations: [{ path: 123 }] })).toBe(false);
  expect(isValidPresentationOutput({ locations: "not-array" })).toBe(false);
  expect(isValidPresentationOutput({ content: [{ type: "terminal", terminalId: "1" }] })).toBe(true);
  expect(isValidPresentationOutput({ content: [{}] })).toBe(false);
  expect(isValidPresentationOutput({ _meta: { a: 1 } })).toBe(true);
  expect(isValidPresentationOutput({ _meta: "not-object" })).toBe(false);
});

test("InMemoryExtensionHost merges configurations across arbitrary multi-layer prefix chains", () => {
  const host = new InMemoryExtensionHost({
    configs: {
      global: {
        myext: { level: "global", base: "a", overridden: 1 },
      },
      "org:acme": {
        myext: { level: "org", orgProp: "b", overridden: 2 },
      },
      "org:acme/team:eng": {
        myext: { level: "team", teamProp: "c", overridden: 3 },
      },
      "org:acme/team:eng/project:core": {
        myext: { level: "project", projectProp: "d", overridden: 4 },
      },
    },
  });

  // Global only
  expect(host.getConfig("myext", [])).toEqual({
    level: "global",
    base: "a",
    overridden: 1,
  });

  // Org layer
  expect(host.getConfig("myext", [{ kind: "org", id: "acme" }])).toEqual({
    level: "org",
    base: "a",
    orgProp: "b",
    overridden: 2,
  });

  // Team layer
  expect(host.getConfig("myext", [
    { kind: "org", id: "acme" },
    { kind: "team", id: "eng" },
  ])).toEqual({
    level: "team",
    base: "a",
    orgProp: "b",
    teamProp: "c",
    overridden: 3,
  });

  // Project layer
  expect(host.getConfig("myext", [
    { kind: "org", id: "acme" },
    { kind: "team", id: "eng" },
    { kind: "project", id: "core" },
  ])).toEqual({
    level: "project",
    base: "a",
    orgProp: "b",
    teamProp: "c",
    projectProp: "d",
    overridden: 4,
  });
});

test("Transient progress vs persisted final and replay verification", async () => {
  const store = new InMemoryStore();
  const tool = {
    name: "step_tool",
    description: "Multi-step tool.",
    parameters: Type.Object({}),
    present(call: ToolCallPresentationInput): ToolCallPresentationOutput | undefined {
      if (call.status === "in_progress" && call.progress) {
        return {
          title: `Step ${call.progress.progress}`,
          _meta: { step: call.progress.progress },
        };
      }
      if (call.status === "completed") {
        return {
          title: "All Steps Completed",
          _meta: { completed: true },
        };
      }
      return undefined;
    },
    async execute(_args: unknown, context: any): Promise<any> {
      context.reportProgress({ progress: 1 });
      context.reportProgress({ progress: 2 });
      return { ok: true as const, content: [{ type: "text", text: "finished all steps" }] };
    },
  };

  let modelCalls = 0;
  const toolCallId = "call_steps_1";
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id: toolCallId, name: tool.name, args: "{}" }],
      };
      yield { type: "tool_call_start", id: toolCallId, name: tool.name, partial };
      yield { type: "tool_call_end", id: toolCallId, name: tool.name, arguments: "{}", partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const runtime = await AgentRuntime.init({ store, concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-replay-test",
      stream,
      tools: [tool],
      options: { idempotencyKey: "agent-replay-key" },
    });

    const run = await runtime.start(agentId, "run steps", { idempotencyKey: "run-replay-key" });
    const observed: any[] = [];
    const iterator = run.observe()[Symbol.asyncIterator]();
    const collectPromise = (async () => {
      for await (const event of { [Symbol.asyncIterator]: () => iterator }) observed.push(event);
    })();

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    await collectPromise;

    // Transient updates were observed live
    const liveProgressEvents = observed.filter(
      (e) => e.kind === "tool_state_changed" && e.durability === "transient",
    );
    expect(liveProgressEvents.length).toBeGreaterThanOrEqual(1);

    await runtime.close();

    // Now inspect durable events in store (simulating replay)
    const owner = await store.openOwner({ ownerId: "reader", leaseMs: 10_000 });
    const durableEvents = await owner.listEvents();
    const durableToolEvents = durableEvents.filter((e) => e.kind === "tool_state_changed");

    // All durable tool events have durability === "durable"
    expect(durableToolEvents.every((e) => e.durability === "durable")).toBe(true);

    // The intermediate steps are NOT persisted in durable storage
    const durableStepTitles = durableToolEvents.map((e: any) => e.toolCall.title);
    expect(durableStepTitles).not.toContain("Step 1");
    expect(durableStepTitles).not.toContain("Step 2");

    // The final state has the merged completed title & _meta
    const completedDurable = durableToolEvents.find((e: any) => e.transition.to === "completed") as any;
    expect(completedDurable).toBeDefined();
    expect(completedDurable.toolCall.title).toBe("All Steps Completed");
    expect(completedDurable.toolCall._meta).toEqual({
      step: 2,
      completed: true,
    });
  } finally {
    await runtime.close().catch(() => {});
  }
});

