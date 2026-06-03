import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import {
  createExtensionRunner,
  discoverAndLoadExtensions,
  loadExtensionFromFactory,
} from "../src/extensions";
import type { ExtensionContext, LoadedExtension } from "../src/extensions";
import { createMessage } from "../src/types";

test("loadExtensionFromFactory creates a LoadedExtension object", () => {
  const extension = loadExtensionFromFactory((ctx) => {
    ctx.registerPhase({
      id: "factory",
      name: "Factory",
      description: "Factory registered phase.",
      async run() {
        return { message: "Factory loaded.", route: "stop" };
      },
    });
  }, process.cwd(), "<test:factory>");

  expect(extension.path).toBe("<test:factory>");
  expect(extension.resolvedPath).toBe("<test:factory>");
  expect(extension.name).toBe("<test:factory>");
});

test("ExtensionRunner loads extensions and registers phases", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test>",
    resolvedPath: "<test>",
    name: "test",
    factory: (ctx) => {
      ctx.registerPhase({
        id: "test-phase",
        name: "Test Phase",
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
  expect(phases.some(p => p.id === "test-phase")).toBe(true);
});

test("ExtensionContext utils provide helper functions", async () => {
  let capturedCtx: ExtensionContext | null = null;

  const runner = createExtensionRunner();
  const ext: LoadedExtension = {
    path: "<test>",
    resolvedPath: "<test>",
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

test("discoverAndLoadExtensions loads TypeScript extensions from cwd .rowan", async () => {
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
          id: "echo",
          name: "Echo",
          description: "Echo test phase.",
          async run() {
            return { message: "Loaded extension", route: "stop" };
          },
        });
      };
      export default extension;
    `);

    const result = await discoverAndLoadExtensions(root);

    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.name).toBe("echo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discoverAndLoadExtensions reports invalid extension factories", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-extension-loader-bad-"));
  try {
    const extensionsDir = join(root, ".rowan", "extensions");
    await mkdir(extensionsDir, { recursive: true });
    await writeFile(join(extensionsDir, "bad.ts"), "export default 123;");

    const result = await discoverAndLoadExtensions(root);

    expect(result.extensions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toContain("bad.ts");
    expect(result.errors[0]?.error).toContain("valid factory");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HooksManager supports typed event registration", async () => {
  const runner = createExtensionRunner();
  const events: string[] = [];

  const ext: LoadedExtension = {
    path: "<test>",
    resolvedPath: "<test>",
    name: "test",
    factory: (ctx) => {
      ctx.on("agent_start", () => {
        events.push("agent_start");
      });
      ctx.on("before_tool_call", (event) => {
        events.push(`before_tool_call:${event.tool.name}`);
        return { allow: true };
      });
    },
  };

  await runner.loadExtensions([ext]);
  runner.bind();

  await runner.emit("agent_start", { type: "agent_start", sessionId: "test" });
  expect(events).toContain("agent_start");
});

test("before_tool_call hook can block tool execution", async () => {
  const runner = createExtensionRunner();

  const ext: LoadedExtension = {
    path: "<test>",
    resolvedPath: "<test>",
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
