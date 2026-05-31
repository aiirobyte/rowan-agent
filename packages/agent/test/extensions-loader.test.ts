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
      buildInput(context) {
        return {
          phase: "factory",
          systemPrompt: context.state.agentState.systemPrompt,
          messages: context.messages.visible(),
          tools: [],
          skills: context.skills,
        };
      },
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
      buildInput(context) {
        return {
          phase: "utilities",
          systemPrompt: context.state.agentState.systemPrompt,
          messages: context.messages.visible(),
          tools: [],
          skills: context.skills,
        };
      },
      buildPrompt(input) {
        return [
          rowan.input.latestUserMessage(input),
          rowan.format.json(rowan.format.tools(input.tools)),
          rowan.format.json(rowan.format.skills(input.skills)),
        ].join("\n");
      },
      createOutcome(output) {
        return { id: rowan.id.create("out"), passed: true, message: output.message };
      },
      async run() {
        return { message: "Utilities loaded.", route: "stop" };
      },
    });
  }, testRuntime, process.cwd(), "<test:utilities>");

  const handler = extension.phases.get("utilities")?.handler;
  const prompt = handler?.buildPrompt?.({
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
  const outcome = handler?.createOutcome?.({ message: "ok", route: "stop" });

  expect(prompt).toContain("hello from user");
  expect(prompt).toContain("\"name\": \"echo\"");
  expect(prompt).toContain("\"id\": \"writer\"");
  expect(outcome?.id).toEqual(expect.stringMatching(/^out_/));
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
          buildInput(context) {
            return {
              phase: "echo",
              systemPrompt: context.state.agentState.systemPrompt,
              messages: context.messages.visible(),
              tools: [],
              skills: context.skills,
            };
          },
          createOutcome(output) {
            return { id: "out_test", passed: true, message: output.message };
          },
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
