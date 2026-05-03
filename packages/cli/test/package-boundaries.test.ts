import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_IMPORT_PATTERN = /from\s+["'](@rowan-agent\/[^"']+)["']/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

test("packages follow Rowan dependency direction", async () => {
  const rules: Record<string, Set<string>> = {
    protocol: new Set(),
    session: new Set(),
    store: new Set(["protocol", "session"]),
    context: new Set(["protocol", "session"]),
    runtime: new Set(["context", "protocol", "session", "store"]),
    agent: new Set(["protocol", "runtime", "session", "store"]),
    adapters: new Set(["context", "protocol"]),
    logging: new Set(["agent"]),
    cli: new Set(["agent", "adapters", "logging", "protocol", "runtime", "session", "store"]),
  };
  const violations: string[] = [];

  for (const [packageName, allowed] of Object.entries(rules)) {
    const files = await sourceFiles(join("packages", packageName, "src"));
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const match of content.matchAll(PACKAGE_IMPORT_PATTERN)) {
        const imported = match[1]?.split("/")[1];
        if (imported && !allowed.has(imported)) {
          violations.push(`${file} imports ${match[1]}`);
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
