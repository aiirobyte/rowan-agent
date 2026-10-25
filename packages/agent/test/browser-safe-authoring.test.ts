import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertBrowserSafeEntry } from "../scripts/browser-safe-entry";

test("browser-safe authoring check follows relative chunks and rejects Node built-ins", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-browser-entry-"));
  try {
    const entry = join(root, "index.js");
    const chunk = join(root, "chunk.js");
    await writeFile(entry, 'import { value } from "./chunk.js"; export { value };\n');
    await writeFile(chunk, 'import { readFile } from "node:fs/promises"; export const value = readFile;\n');
    await expect(assertBrowserSafeEntry(entry)).rejects.toThrow(/node:fs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser-safe authoring check rejects Node-only packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-browser-entry-"));
  try {
    const entry = join(root, "index.js");
    await writeFile(entry, 'import { parse } from "yaml"; export { parse };\n');
    await expect(assertBrowserSafeEntry(entry)).rejects.toThrow(/yaml/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser-safe authoring check accepts relative chunks and the models package", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-browser-entry-"));
  try {
    const entry = join(root, "index.js");
    const chunk = join(root, "chunk.js");
    await writeFile(entry, 'import { value } from "./chunk.js"; import * as models from "@rowan-agent/models"; export { value, models };\n');
    await writeFile(chunk, 'export const value = 1;\n');
    await expect(assertBrowserSafeEntry(entry)).resolves.toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
