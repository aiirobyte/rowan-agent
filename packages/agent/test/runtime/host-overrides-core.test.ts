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
  let observedModelRequest: import("@rowan-agent/models").LlmRequest | undefined;

  const hostEditTool = {
    name: "edit",
    description: "Host registered document session edit tool.",
    promptSnippet: "Edit files via document session.",
    parameters: Type.Object({
      sessionId: Type.String(),
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
        observedModelRequest = request;
        const callArgs = JSON.stringify({
          sessionId: "sess-123",
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

    // 4. Assert model request has host description, parameters, and system prompt has promptSnippet
    const modelEditTool = observedModelRequest?.tools?.find((t) => t.name === "edit");
    expect(modelEditTool).toBeDefined();
    expect(modelEditTool?.description).toBe("Host registered document session edit tool.");
    expect(modelEditTool?.description).not.toContain("Apply exact text replacements");
    expect(modelEditTool?.parameters).toEqual(hostEditTool.parameters);

    expect(observedModelRequest?.system).toContain("- edit: Edit files via document session.");
    expect(observedModelRequest?.system).not.toContain("Apply exact text replacements.");
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

test("A host Phase named stop replaces the built-in stop Phase instead of throwing and its content reaches the model", async () => {
  let observedStopRequest: import("@rowan-agent/models").LlmRequest | undefined;

  const customStop: Phase = {
    name: "stop",
    description: "Custom host stop Phase description.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Host stop conclusion instructions.",
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const stream: StreamFn = async function* (request) {
      observedStopRequest = request;
      yield {
        type: "done",
        response: stopResponse("Host stop executed"),
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

    // Assert that the host Phase's content is what the model sees instead of the built-in stop content
    const stopPromptMsg = observedStopRequest?.messages.find((m) =>
      typeof m.content === "string" && m.content.includes('<phase_content name="stop">')
    );
    expect(stopPromptMsg).toBeDefined();
    expect(stopPromptMsg?.content).toContain("Host stop conclusion instructions.");
    expect(stopPromptMsg?.content).not.toContain("Return only a brief normal-exit explanation");
  } finally {
    await runtime.close();
  }
});

test("A host Phase named default replaces the built-in default Phase instead of throwing and its content reaches the model", async () => {
  let observedDefaultRequest: import("@rowan-agent/models").LlmRequest | undefined;

  const customDefault: Phase = {
    name: "default",
    description: "Custom host default Phase description.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Host custom default instructions for model.",
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    const stream: StreamFn = async function* (request) {
      observedDefaultRequest = request;
      yield {
        type: "done",
        response: stopResponse("default done"),
      };
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

    // Assert that the host Phase's content is what the model sees instead of the built-in default content
    const defaultPromptMsg = observedDefaultRequest?.messages.find((m) =>
      typeof m.content === "string" && m.content.includes('<phase_content name="default">')
    );
    expect(defaultPromptMsg).toBeDefined();
    expect(defaultPromptMsg?.content).toContain("Host custom default instructions for model.");
    expect(defaultPromptMsg?.content).not.toContain("Execute the current user request using the current context.");

    // Assert that the host Phase's description is used in the route tool
    const routeTool = observedDefaultRequest?.tools?.find((t) => t.name === "route");
    expect(routeTool?.description).toContain("Custom host default Phase description.");
    expect(routeTool?.description).not.toContain("Execute the current user request using the current context.");
  } finally {
    await runtime.close();
  }
});

test("When a host replaces read, the compact Phase's summarizer is offered and executes the host read", async () => {
  let hostReadOffered = false;
  let hostReadExecuted = false;

  const hostReadTool = {
    name: "read",
    description: "Host custom session read tool.",
    parameters: Type.Object({
      path: Type.String(),
    }),
    execute: async (args: unknown) => {
      hostReadExecuted = true;
      const parsed = typeof args === "string" ? JSON.parse(args) : args;
      return { ok: true as const, content: `host-read-ok:${(parsed as { path: string })?.path}` };
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
      const readTool = request.tools?.find((t) => t.name === "read");
      if (readTool?.description === "Host custom session read tool.") {
        hostReadOffered = true;
      }

      if (turn === 1) {
        const callArgs = JSON.stringify({ path: "checkpoint.json" });
        const partial = {
          role: "assistant" as const,
          contentBlocks: [{
            type: "tool_call" as const,
            id: "call-read-1",
            name: "read",
            args: callArgs,
          }],
        };
        yield { type: "tool_call_start", id: "call-read-1", name: "read", partial };
        yield { type: "tool_call_end", id: "call-read-1", name: "read", arguments: callArgs, partial };
        yield {
          type: "done",
          response: {
            content: "",
            toolCalls: [{ id: "call-read-1", name: "read", arguments: callArgs }],
            stopReason: "tool_use",
          },
        };
        return;
      }

      yield {
        type: "done",
        response: stopResponse("Compacted conversation summary."),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "compact-host-read-v1",
      definition: {
        name: "compact-host-read-agent",
        description: "Compact agent with host read",
        prompt: "Summarize conversation",
        phases: { entryPhaseId: "compact", phaseIds: ["compact"] },
      },
      tools: [hostReadTool],
      stream,
      options: { idempotencyKey: "compact-host-read-agent" },
    });

    const run = await runtime.start(agentId, "Please compact history", {
      idempotencyKey: "compact-host-read-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(hostReadOffered).toBe(true);
    expect(hostReadExecuted).toBe(true);
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

test("Regression: with no host replacement, system prompt contains built-in Core Tools snippets, guidelines, and Extension tool promptSnippet", async () => {
  let observedRequest: import("@rowan-agent/models").LlmRequest | undefined;

  const extension = {
    ...loadExtensionFromFactory((api) => {
      api.tool.register({
        name: "custom_lookup",
        description: "Search project documents.",
        promptSnippet: "Search project documents.",
        promptGuidelines: ["Use specific keywords when looking up documentation."],
        parameters: { type: "object", properties: { query: { type: "string" } } },
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
      });
    }, process.cwd()),
    name: "lookup-extension",
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });

  try {
    const stream: StreamFn = async function* (request) {
      observedRequest = request;
      yield {
        type: "done",
        response: stopResponse("done"),
      };
    };

    const agentId = await createAgentWith(runtime, {
      identity: "regression-prompt-snippets-v1",
      definition: {
        name: "standard-agent",
        description: "Standard agent without host tool replacement",
        prompt: "You are a helpful assistant.",
      },
      stream,
      options: { idempotencyKey: "regression-prompt-snippets-agent" },
    });

    const run = await runtime.start(agentId, "hello", {
      idempotencyKey: "regression-prompt-snippets-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // Built-in Core Tools snippets reach system prompt
    expect(observedRequest?.system).toContain("- edit: Apply exact text replacements.");
    expect(observedRequest?.system).toContain("- read: Read file contents.");
    expect(observedRequest?.system).toContain("- write: Create or overwrite files.");
    expect(observedRequest?.system).toContain("- bash: Run shell commands.");

    // Built-in Core Tools guidelines reach system prompt
    expect(observedRequest?.system).toContain("- Read the file first; each oldText must match exactly once.");
    expect(observedRequest?.system).toContain("- Read files before editing them.");
    expect(observedRequest?.system).toContain("- Use edit for partial changes.");
    expect(observedRequest?.system).toContain("- Use read/write/edit for file operations.");

    // Extension-registered non-core Tool snippet and guideline reach system prompt
    expect(observedRequest?.system).toContain("- custom_lookup: Search project documents.");
    expect(observedRequest?.system).toContain("- Use specific keywords when looking up documentation.");
  } finally {
    await runtime.close();
  }
});
