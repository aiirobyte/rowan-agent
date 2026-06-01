import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import {
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadExtensionFromFactory,
} from "../src/extensions";
import { createMessage } from "../src/types";

const testRuntime = createExtensionRuntime();

test("loadExtensionFromFactory creates an Extension object with registered phases", async () => {
  const extension = await loadExtensionFromFactory((rowan) => {
    rowan.registerPhase({
      id: "factory",
      name: "Factory",
      description: "Factory registered phase.",
      async run() {
        return { message: "Factory loaded.", route: "stop" };
      },
    });
  }, testRuntime, process.cwd(), "<test:factory>");

  expect(extension.path).toBe("<test:factory>");
  expect(extension.resolvedPath).toBe("<test:factory>");
  expect(extension.phases.get("factory")?.definition).toMatchObject({
    id: "factory",
    name: "Factory",
  });
});

test("loadExtensionFromFactory exposes host utilities on the Rowan API", async () => {
  const extension = await loadExtensionFromFactory((rowan) => {
    rowan.registerPhase({
      id: "utilities",
      name: "Utilities",
      description: "Uses host utility helpers.",
      buildPrompt(input) {
        return {
          model: { provider: "test", name: "test" },
          system: input.systemPrompt,
          messages: [
            { role: "user" as const, content: rowan.input.latestUserMessage(input) },
          ],
        };
      },
      async run() {
        return { message: "Utilities loaded.", route: "stop" };
      },
    });
  }, testRuntime, process.cwd(), "<test:utilities>");

  const handler = extension.phases.get("utilities")?.handler;
  const request = handler?.buildPrompt?.({
    phase: "utilities",
    systemPrompt: "system",
    messages: [createMessage("user", "hello from user", { scope: "conversation" })],
    tools: [{
      name: "echo",
      description: "Echoes input.",
      parameters: Type.Object({ message: Type.String() }),
      async execute() {
        return { toolCallId: "call_echo", toolName: "echo", ok: true, content: "ok" };
      },
    }],
    skills: [{
      id: "writer",
      path: "/skills/writer/SKILL.md",
      content: "Write concise plans.",
      toolNames: ["echo"],
    }],
  });

  expect(request?.messages.some(m => m.content === "hello from user")).toBe(true);
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
      const extension: ExtensionFactory = (rowan) => {
        rowan.registerPhase({
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

    const result = await discoverAndLoadExtensions(testRuntime, root);

    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.phases.has("echo")).toBe(true);
    expect(result.extensions[0]?.phases.get("echo")?.source.extensionPath).toContain("index.ts");
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

    const result = await discoverAndLoadExtensions(testRuntime, root);

    expect(result.extensions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toContain("bad.ts");
    expect(result.errors[0]?.error).toContain("valid factory");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
