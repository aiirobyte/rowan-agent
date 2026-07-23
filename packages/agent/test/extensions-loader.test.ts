import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import { clearModels, getModel } from "@rowan-agent/models";
import {
  createExtensionRunner,
  createEventBus,
} from "../src/extensions";
import { loadExtensionsFromPath, loadExtensionFromFactory } from "../src/extensions/loader";
import type { ExtensionAPI, LoadedExtension } from "../src/extensions";

test("loadExtensionFromFactory creates a LoadedExtension object", () => {
  const extension = loadExtensionFromFactory((ctx) => {
    ctx.registerPhase({
      name: "factory",
      description: "Factory registered phase.",
      async run() {
        return { message: "Factory loaded.", route: "stop" };
      },
    });
  }, process.cwd(), "<test:factory>");

  expect(extension.path).toBe("<test:factory>");
  expect(extension.name).toBe("<test:factory>");
});

test("ExtensionRunner loads extensions and registers phases", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test>",
    name: "test",
    factory: (ctx) => {
      ctx.registerPhase({
        name: "test-phase",
        description: "A test phase.",
        async run() {
          return { message: "Test loaded.", route: "stop" };
        },
      });
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  const phases = runner.getPhases();
  expect(phases.length).toBeGreaterThan(0);
  expect(phases.some(p => p.name === "test-phase")).toBe(true);
});

test("ExtensionAPI utils provide helper functions", async () => {
  let capturedCtx: ExtensionAPI | null = null;

  const runner = createExtensionRunner();
  const ext: LoadedExtension = {
    path: "<test>",
    name: "test",
    factory: (ctx) => {
      capturedCtx = ctx;
    },
  };

  await runner.loadExtensions([ext]);

  expect(capturedCtx).not.toBeNull();
  expect(capturedCtx!.utils.createId("test")).toMatch(/^test_/);
  expect(capturedCtx!.utils.formatJson({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
});

test("loadExtensionsFromPath loads TypeScript extensions from a directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-extension-loader-"));
  try {
    const extDir = join(root, ".rowan", "extensions", "echo");
    await mkdir(extDir, { recursive: true });
    await writeFile(join(extDir, "package.json"), JSON.stringify({
      name: "rowan-test-extension",
      rowan: { extensions: ["./index.ts"] },
    }));
    await writeFile(join(extDir, "index.ts"), `
      import type { ExtensionFactory } from "@rowan-agent/agent";
      const extension: ExtensionFactory = (ctx) => {
        ctx.registerPhase({
          name: "echo",
          description: "Echo test phase.",
          async run() {
            return { message: "Loaded extension", route: "stop" };
          },
        });
      };
      export default extension;
    `);

    const result = await loadExtensionsFromPath(join(root, ".rowan", "extensions"));

    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.name).toBe("echo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadExtensionsFromPath reports invalid extension factories", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-extension-loader-bad-"));
  try {
    const extensionsDir = join(root, ".rowan", "extensions");
    await mkdir(extensionsDir, { recursive: true });
    await writeFile(join(extensionsDir, "bad.ts"), "export default 123;");

    const result = await loadExtensionsFromPath(extensionsDir);

    expect(result.extensions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toContain("bad.ts");
    expect(result.errors[0]?.error).toContain("valid factory");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("before_tool_call hook can block tool execution", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test>",
    name: "test",
    factory: (ctx) => {
      ctx.on("before_tool_call", (event) => {
        if (event.tool.name === "blocked") {
          return { allow: false, reason: "Not allowed" };
        }
        return { allow: true };
      });
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  const tool = {
    name: "blocked",
    description: "Test tool",
    parameters: Type.Object({}),
    execute: async () => ({ toolCallId: "1", toolName: "blocked", ok: true, content: "ok" }),
  };

  const result = await runner.emitBeforeToolCall(tool, {});
  expect(result.allow).toBe(false);
  expect(result.reason).toBe("Not allowed");
});

test("ExtensionAPI registerTool registers LLM-callable tools", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test:tool>",
    name: "test-tool",
    factory: (ctx) => {
      ctx.registerTool({
        name: "search_docs",
        description: "Search documentation",
        parameters: { type: "object", properties: { query: { type: "string" } } },
        execute: async () => {
          return { content: [{ type: "text", text: "result" }] };
        },
      });
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  const tools = runner.getAllRegisteredTools();
  expect(tools).toHaveLength(1);
  expect(tools[0]!.definition.name).toBe("search_docs");
  expect(tools[0]!.definition.description).toBe("Search documentation");

  const toolDef = runner.getToolDefinition("search_docs");
  expect(toolDef).toBeDefined();
  expect(toolDef!.name).toBe("search_docs");

  expect(runner.getToolDefinition("nonexistent")).toBeUndefined();
});

test("ExtensionAPI registerProvider preserves model transport configuration", async () => {
  clearModels();
  const runner = createExtensionRunner();
  const ext: LoadedExtension = {
    path: "<test:provider>",
    name: "test-provider",
    factory: (ctx) => {
      ctx.registerProvider({
        id: "extension-provider",
        baseUrl: "https://provider.example/v1",
        apiKey: "extension-key",
        protocol: "openai-completions",
        headers: { "x-tenant": "tenant-1" },
        timeoutMs: 1_000,
        maxRetries: 4,
        retryDelayMs: 25,
        models: [{
          id: "extension-model",
          protocol: "openai-completions",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8_192,
          maxTokens: 1_024,
        }],
      });
    },
  };

  try {
    await runner.loadExtensions([ext]);
    runner.bind();

    expect(getModel("extension-provider", "extension-model")).toMatchObject({
      apiKey: "extension-key",
      headers: { "x-tenant": "tenant-1" },
      timeoutMs: 1_000,
      maxRetries: 4,
      retryDelayMs: 25,
    });
  } finally {
    clearModels();
  }
});

test("EventBus supports pub/sub communication", () => {
  const bus = createEventBus();
  const received: unknown[] = [];

  const unsub = bus.on("test:event", (data) => {
    received.push(data);
  });

  bus.emit("test:event", { value: 42 });
  bus.emit("test:event", "hello");

  expect(received).toEqual([{ value: 42 }, "hello"]);
  expect(bus.has("test:event")).toBe(true);
  expect(bus.count("test:event")).toBe(1);

  unsub();
  expect(bus.has("test:event")).toBe(false);
  expect(bus.count("test:event")).toBe(0);
});

test("EventBus is shared across extensions via api.events", async () => {
  const runner = createExtensionRunner();
  const received: string[] = [];

  const ext1: LoadedExtension = {
    path: "<test:ext1>",
    name: "ext1",
    factory: (ctx) => {
      ctx.events.on("custom:event", (msg) => {
        received.push(`ext1:${msg}`);
      });
    },
  };

  const ext2: LoadedExtension = {
    path: "<test:ext2>",
    name: "ext2",
    factory: (ctx) => {
      ctx.events.emit("custom:event", "hello");
    },
  };

  await runner.loadExtensions([ext1, ext2]);

  expect(received).toEqual(["ext1:hello"]);
});

test("ExtensionRunner.onError collects structured errors", async () => {
  const runner = createExtensionRunner();
  const errors: Array<{ extensionPath: string; event: string; error: string }> = [];

  runner.onError((err) => {
    errors.push({ extensionPath: err.extensionPath, event: err.event, error: err.error });
  });

  runner.emitError({
    extensionPath: "<test>",
    event: "test_event",
    error: "Something went wrong",
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]!.extensionPath).toBe("<test>");
  expect(errors[0]!.event).toBe("test_event");
  expect(errors[0]!.error).toBe("Something went wrong");
});
