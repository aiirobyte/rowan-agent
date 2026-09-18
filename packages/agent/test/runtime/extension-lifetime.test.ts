import { expect, test } from "bun:test";
import { RuntimeExtensionLifetime } from "../../src/runtime/extension-lifetime";
import type { LoadedExtension } from "../../src/extensions";

const extension = (
  path: string,
  factory: LoadedExtension["factory"],
): LoadedExtension => ({ path, name: path, factory });

test("global Extension activation skips one failure and keeps successful contributions", async () => {
  const lifetime = new RuntimeExtensionLifetime();
  const result = await lifetime.activate([
    extension("good", (api) => {
      api.tool.register({
        name: "good_tool",
        description: "Good",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "good" }] }),
      });
    }),
    extension("bad", (api) => {
      api.tool.register({
        name: "bad_tool",
        description: "Bad",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "bad" }] }),
      });
      throw new Error("bad activation");
    }),
  ]);

  expect(result.active).toEqual(["good"]);
  expect(result.errors).toMatchObject([{ path: "bad", error: "bad activation" }]);
  expect(lifetime.tools().map(({ definition }) => definition.name)).toEqual(["good_tool"]);
  await lifetime.close();
});

test("global Extension activation freezes after bootstrap and disposes in reverse order", async () => {
  const disposed: string[] = [];
  const lifetime = new RuntimeExtensionLifetime();
  await lifetime.activate([
    extension("first", () => () => { disposed.push("first"); }),
    extension("second", () => () => { disposed.push("second"); }),
  ]);

  await expect(lifetime.activate([])).rejects.toMatchObject({ code: "extensions_frozen" });
  await lifetime.close();
  expect(disposed).toEqual(["second", "first"]);
  await lifetime.close();
});
