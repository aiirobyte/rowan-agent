import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryStore } from "../../src/runtime";
import { loadExtensionFromFactory } from "../../src/extensions/loader";

const tool = (name: string) => ({
  name,
  description: name,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ ok: true as const, content: null }),
});

test("AgentRuntime does not become ready or start scheduling before bootstrap completes", async () => {
  const store = new InMemoryStore();
  let entered = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const init = AgentRuntime.init({
    store,
    bootstrap: async (registry) => {
      entered = true;
      await registry.loadTools({ sourceId: "bootstrap", values: [tool("ready")] });
      await gate;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(entered).toBe(true);
  const pending = await Promise.race([
    init.then(() => "ready" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 5)),
  ]);
  expect(pending).toBe("pending");

  release();
  const runtime = await init;
  await runtime.close();
});

test("a failed bootstrap releases Runtime ownership and does not return a half-ready Runtime", async () => {
  const store = new InMemoryStore();
  await expect(AgentRuntime.init({
    store,
    bootstrap: async () => {
      throw new Error("bootstrap failed");
    },
  })).rejects.toThrow("bootstrap failed");

  const runtime = await AgentRuntime.init({ store });
  await runtime.close();
});

test("bootstrap activates global Extensions before the ready Runtime and closes them", async () => {
  const disposed: string[] = [];
  const extension = loadExtensionFromFactory(() => () => { disposed.push("closed"); }, process.cwd(), "<global>");
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    bootstrap: async (registry) => {
      const result = await registry.loadExtensions([extension]);
      expect(result.active).toEqual(["<global>"]);
      expect(result.errors).toEqual([]);
    },
  });

  expect(disposed).toEqual([]);
  await runtime.close();
  expect(disposed).toEqual(["closed"]);
});
