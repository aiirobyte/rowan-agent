import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPhase } from "../../src/harness/phases";

async function createPhase(source: string, dirName = "review-phase"): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "rowan-phase-meta-"));
  const path = join(root, dirName, "PHASE.md");
  await mkdir(join(root, dirName), { recursive: true });
  await writeFile(path, source);
  return { root, path };
}

test("loader: unknown JSON-safe keys land in metadata, nested object and list preserved, known keys never do", async () => {
  const phase = await createPhase(`---
name: review-phase
description: Review code.
target: stop
input:
  task: test
prompt-guidelines:
  - Preserve behavior.
tools: [read]
model: openai/gpt-5
isolated: true
disable-auto-invocation: true
disable-implicit-invocation: true
permission:
  mode: strict
  allowedPaths:
    - /src
    - /docs
count: 42
active: true
empty: null
---
Review the code.
`);
  try {
    const loaded = await loadPhase(phase.path);
    expect(loaded.metadata).toBeDefined();
    expect(loaded.metadata).toEqual({
      permission: {
        mode: "strict",
        allowedPaths: ["/src", "/docs"],
      },
      count: 42,
      active: true,
      empty: null,
    });

    // Known keys must never appear in metadata
    for (const known of [
      "name",
      "description",
      "target",
      "input",
      "prompt-guidelines",
      "tools",
      "model",
      "isolated",
      "disable-auto-invocation",
      "disable-implicit-invocation",
    ]) {
      expect(known in (loaded.metadata ?? {})).toBe(false);
    }
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("loader: non-JSON-safe value is dropped with a diagnostic naming the key", async () => {
  const phase = await createPhase(`---
name: review-phase
description: Review code.
validKey: ok
invalidDate: !!timestamp 2026-10-18
---
Review the code.
`);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const loaded = await loadPhase(phase.path);
    expect(loaded.metadata).toEqual({
      validKey: "ok",
    });
    expect("invalidDate" in (loaded.metadata ?? {})).toBe(false);
    const diagnostic = warnings.find((w) => w.includes("invalidDate"));
    expect(diagnostic).toBeDefined();
  } finally {
    console.warn = originalWarn;
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("loader: no extra keys -> metadata undefined", async () => {
  const phase = await createPhase(`---
name: review-phase
description: Review code.
tools: [read]
---
Review the code.
`);
  try {
    const loaded = await loadPhase(phase.path);
    expect(loaded.metadata).toBeUndefined();
    expect("metadata" in loaded).toBe(false);
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});
