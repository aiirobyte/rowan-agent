import { expect, test } from "bun:test";
import Type from "typebox";
import type { StreamFn, ToolCallContent } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import { InMemoryExtensionHost } from "../../src";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

test("Tool present function customizes title, locations, content, and kind in tool_state_changed", async () => {
  const tool = {
    name: "patch_file",
    kind: "edit" as const,
    annotations: {
      title: "Patch File Annotation",
    },
    description: "Applies a patch.",
    parameters: Type.Object({ path: Type.String(), patch: Type.String() }),
    present(args: any, result?: any) {
      if (!result) {
        return {
          title: `Starting edit of ${args?.path}`,
          locations: [{ path: args?.path, line: 1 }],
          _meta: { phase: "starting", hostCustom: 123 },
        };
      }
      return {
        title: `Editing ${args?.path}`,
        locations: [{ path: args?.path, line: 42 }],
        content: [
          {
            type: "diff" as const,
            path: args?.path,
            oldText: "old code",
            newText: "new code",
          },
        ],
        _meta: { phase: "completed", hostCustom: 456 },
      };
    },
    async execute(_args: unknown) {
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
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const observed = [];
    for await (const event of run.observe()) observed.push(event);

    const inProgressToolEvent = observed.find(
      (e) => e.kind === "tool_state_changed" && e.transition.to === "in_progress",
    );
    expect(inProgressToolEvent).toBeDefined();
    if (inProgressToolEvent && inProgressToolEvent.kind === "tool_state_changed") {
      expect(inProgressToolEvent.toolCall.title).toBe("Starting edit of src/index.ts");
      expect(inProgressToolEvent.toolCall.kind).toBe("edit");
      expect(inProgressToolEvent.toolCall.locations).toEqual([{ path: "src/index.ts", line: 1 }]);
      expect(inProgressToolEvent.toolCall._meta).toEqual({ phase: "starting", hostCustom: 123 });
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
      expect(completedToolEvent.toolCall._meta).toEqual({ phase: "completed", hostCustom: 456 });
    }
  } finally {
    await runtime.close();
  }
});

test("Tool without present function defaults title to annotations.title ?? name and content to MCP blocks", async () => {
  const tool = {
    name: "fetch_data",
    kind: "fetch" as const,
    annotations: {
      title: "Fetch Remote Data",
    },
    description: "Fetches remote data.",
    parameters: Type.Object({ url: Type.String() }),
    async execute(_args: unknown) {
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
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    const observed = [];
    for await (const event of run.observe()) observed.push(event);

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
    present(args: any, result?: any) {
      if (!result) {
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
