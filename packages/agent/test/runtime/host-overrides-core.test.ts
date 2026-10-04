import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import { ResourceRegistry } from "../../src/runtime/resource-registry";
import { createAgentWith, seedResources, TEST_SOURCE } from "../fixtures/configuration";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { stopResponse } from "./route-test-utils";
import type { Phase } from "../../src/harness/phases/types";

test("Extension-registered Tool named edit directly replaces Core edit and leaves file untouched", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-ext-edit-"));
  const filePath = join(tempDir, "file.txt");
  const initialContent = "Hello from original disk file";
  await writeFile(filePath, initialContent, "utf8");

  let extensionEditCalled = false;
  let receivedToolResultContent: unknown;

  const extension = {
    ...loadExtensionFromFactory((api) => {
      api.tool.register({
        name: "edit",
        description: "Extension host document session edit.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            edits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  oldText: { type: "string" },
                  newText: { type: "string" },
                },
              },
            },
          },
        },
        execute: async (args) => {
          extensionEditCalled = true;
          const parsed = typeof args === "string" ? JSON.parse(args) : args;
          return { content: [{ type: "text", text: `extension-edit-ok:${(parsed as { path: string })?.path}` }] };
        },
      });
    }, process.cwd()),
    name: "host-edit-extension",
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });

  try {
    let turn = 0;
    const stream: StreamFn = async function* (request) {
      turn += 1;
      if (turn === 1) {
        const callArgs = JSON.stringify({
          path: filePath,
          edits: [{ oldText: "original", newText: "MODIFIED_BY_BUILTIN" }],
        });
        const partial = {
          role: "assistant" as const,
          contentBlocks: [{
            type: "tool_call" as const,
            id: "call-edit-1",
            name: "edit",
            args: callArgs,
          }],
        };
        yield { type: "tool_call_start", id: "call-edit-1", name: "edit", partial };
        yield { type: "tool_call_end", id: "call-edit-1", name: "edit", arguments: callArgs, partial };
        yield {
          type: "done",
          response: {
            content: "",
            toolCalls: [{ id: "call-edit-1", name: "edit", arguments: callArgs }],
            stopReason: "tool_use",
          },
        };
        return;
      }

      // Turn 2: observe tool result returned to model
      const toolMessage = request.messages.find((m) => m.role === "tool");
      receivedToolResultContent = toolMessage?.content;
      yield {
        type: "done",
        response: stopResponse("done"),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "ext-edit-override-v1",
      definition: {
        name: "edit-agent",
        description: "Edit agent",
        prompt: "Edit files",
      },
      stream,
      options: { idempotencyKey: "ext-edit-override-agent" },
    });

    const run = await runtime.start(agentId, "edit the file", {
      idempotencyKey: "ext-edit-override-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // 1. Assert the extension tool was called
    expect(extensionEditCalled).toBe(true);

    // 2. Assert the file on disk is untouched (built-in edit did not run)
    const diskContent = await readFile(filePath, "utf8");
    expect(diskContent).toBe(initialContent);
    expect(diskContent).not.toContain("MODIFIED_BY_BUILTIN");

    // 3. Assert the host extension tool's result is returned
    expect(JSON.stringify(receivedToolResultContent)).toContain(`extension-edit-ok:${filePath}`);
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Host-resource Tool named edit directly replaces Core edit and leaves file untouched", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "rowan-host-edit-"));
  const filePath = join(tempDir, "file.txt");
  const initialContent = "Original file content on disk";
  await writeFile(filePath, initialContent, "utf8");

  let hostEditCalled = false;
  let receivedToolResultContent: unknown;

  const hostEditTool = {
    name: "edit",
    description: "Host registered edit tool.",
    parameters: Type.Object({
      path: Type.String(),
      edits: Type.Array(Type.Object({ oldText: Type.String(), newText: Type.String() })),
    }),
    execute: async (args: unknown) => {
      hostEditCalled = true;
      const parsed = typeof args === "string" ? JSON.parse(args) : args;
      return { ok: true as const, content: `host-resource-edit-ok:${(parsed as { path: string })?.path}` };
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    let turn = 0;
    const stream: StreamFn = async function* (request) {
      turn += 1;
      if (turn === 1) {
        const callArgs = JSON.stringify({
          path: filePath,
          edits: [{ oldText: "Original", newText: "OVERWRITTEN" }],
        });
        const partial = {
          role: "assistant" as const,
          contentBlocks: [{
            type: "tool_call" as const,
            id: "call-host-edit-1",
            name: "edit",
            args: callArgs,
          }],
        };
        yield { type: "tool_call_start", id: "call-host-edit-1", name: "edit", partial };
        yield { type: "tool_call_end", id: "call-host-edit-1", name: "edit", arguments: callArgs, partial };
        yield {
          type: "done",
          response: {
            content: "",
            toolCalls: [{ id: "call-host-edit-1", name: "edit", arguments: callArgs }],
            stopReason: "tool_use",
          },
        };
        return;
      }

      const toolMessage = request.messages.find((m) => m.role === "tool");
      receivedToolResultContent = toolMessage?.content;
      yield {
        type: "done",
        response: stopResponse("done"),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "host-edit-override-v1",
      definition: {
        name: "host-edit-agent",
        description: "Host edit agent",
        prompt: "Edit files",
      },
      tools: [hostEditTool],
      stream,
      options: { idempotencyKey: "host-edit-override-agent" },
    });

    const run = await runtime.start(agentId, "edit the file", {
      idempotencyKey: "host-edit-override-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // 1. Assert host tool was executed
    expect(hostEditCalled).toBe(true);

    // 2. Assert the file on disk is untouched
    const diskContent = await readFile(filePath, "utf8");
    expect(diskContent).toBe(initialContent);

    // 3. Assert host tool's result is returned
    expect(JSON.stringify(receivedToolResultContent)).toContain(`host-resource-edit-ok:${filePath}`);
  } finally {
    await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("The replacing Core Tool is available even when Agent Definition declares a tools list that does not name it", async () => {
  let customToolCalled = false;
  let hostEditCalled = false;
  let observedTools: string[] = [];

  const hostEditTool = {
    name: "edit",
    description: "Host registered edit tool.",
    parameters: Type.Object({}),
    execute: async () => {
      hostEditCalled = true;
      return { ok: true as const, content: "host-edit-ok" };
    },
  };

  const customTool = {
    name: "custom_lookup",
    description: "Custom tool.",
    parameters: Type.Object({}),
    execute: async () => {
      customToolCalled = true;
      return { ok: true as const, content: "custom-ok" };
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const stream: StreamFn = async function* (request) {
      observedTools = (request.tools ?? []).map((t) => t.name);
      yield {
        type: "done",
        response: stopResponse("done"),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "replacing-tool-selection-v1",
      definition: {
        name: "selective-agent",
        description: "Agent with explicit tools list",
        prompt: "Use only selected tools",
        // The definition selects only custom_lookup, NOT naming edit
        tools: ["custom_lookup"],
      },
      tools: [hostEditTool, customTool],
      stream,
      options: { idempotencyKey: "replacing-tool-selection-agent" },
    });

    const run = await runtime.start(agentId, "check tools", {
      idempotencyKey: "replacing-tool-selection-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // Core tools (including replacing edit) stay always-available
    expect(observedTools).toContain("edit");
    expect(observedTools).toContain("custom_lookup");
    expect(observedTools).toContain("read");
    expect(observedTools).toContain("bash");
    expect(observedTools).toContain("write");
  } finally {
    await runtime.close();
  }
});

test("A host Phase named stop replaces the built-in stop Phase instead of throwing", async () => {
  let customStopPhaseCalled = false;

  const customStop: Phase = {
    name: "stop",
    description: "Custom host stop Phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Host stop conclusion.",
    run: async () => {
      customStopPhaseCalled = true;
      return { message: "custom stop complete", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const stream: StreamFn = async function* () {
      yield {
        type: "done",
        response: stopResponse(""),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "host-stop-phase-v1",
      definition: {
        name: "stop-agent",
        description: "Stop agent",
        prompt: "Run and stop",
        phases: { entryPhaseId: "stop", phaseIds: ["stop"] },
      },
      phases: [customStop],
      stream,
      options: { idempotencyKey: "host-stop-phase-agent" },
    });

    const run = await runtime.start(agentId, "do work and stop", {
      idempotencyKey: "host-stop-phase-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(customStopPhaseCalled).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("A host Phase named default replaces the built-in default Phase instead of throwing", async () => {
  let customDefaultPhaseCalled = false;

  const customDefault: Phase = {
    name: "default",
    description: "Custom host default Phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Host default phase.",
    run: async () => {
      customDefaultPhaseCalled = true;
      return { message: "custom default done", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const stream: StreamFn = async function* () {
      yield { type: "done" };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "host-default-phase-v1",
      definition: {
        name: "default-agent",
        description: "Default agent",
        prompt: "Start in default",
      },
      phases: [customDefault],
      stream,
      options: { idempotencyKey: "host-default-phase-agent" },
    });

    const run = await runtime.start(agentId, "start run", {
      idempotencyKey: "host-default-phase-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(customDefaultPhaseCalled).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("Existing Scope override behaviour for non-core resources is unchanged: peer host sources collide", async () => {
  const tool = (name: string) => ({
    name,
    description: `${name} tool`,
    parameters: Type.Object({}),
    execute: async () => ({ ok: true as const, content: null }),
  });

  const registry = new ResourceRegistry();
  await registry.loadTools({ sourceId: "scope-a", values: [tool("shared_tool")] });
  await registry.loadTools({ sourceId: "scope-b", values: [tool("shared_tool")] });

  // Resolving a view with two peer host sources containing the same non-core tool collides
  expect(() => registry.resolveView({ agents: [], tools: ["scope-a", "scope-b"], skills: [], phases: [] }))
    .toThrow(/Duplicate Tool resource "shared_tool"/);
});
