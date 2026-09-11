import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPhase, preparePhasePayload } from "../../src/harness/phases";

async function createPhase(source: string): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "rowan-phase-input-"));
  const path = join(root, "structured", "PHASE.md");
  await mkdir(join(root, "structured"), { recursive: true });
  await writeFile(path, source);
  return { root, path };
}

test("Phase input keeps nested JSON-safe defaults", async () => {
  const phase = await createPhase(`---
name: structured
description: Structured input.
input:
  provider: codex
  timeout: 15
  options:
    includeTests: true
  paths: []
  metadata: {}
  nullable: null
---
Use the input.
`);
  try {
    await expect(loadPhase(phase.path)).resolves.toMatchObject({
      input: {
        provider: "codex",
        timeout: 15,
        options: { includeTests: true },
        paths: [],
        metadata: {},
        nullable: null,
      },
    });
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("Phase loading rejects a non-object input definition", async () => {
  const phase = await createPhase(`---
name: structured
description: Structured input.
input: [not, a, mapping]
---
Use the input.
`);
  try {
    await expect(loadPhase(phase.path)).rejects.toThrow("input must be a JSON-safe object");
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("Phase loading rejects non-JSON-safe input defaults", async () => {
  const phase = await createPhase(`---
name: structured
description: Structured input.
input:
  timeout: .nan
---
Use the input.
`);
  try {
    await expect(loadPhase(phase.path)).rejects.toThrow("input must be a JSON-safe object");
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("Phase payload preparation applies only omitted defaults", () => {
  const input = {
    provider: "codex",
    options: { includeTests: true, timeout: 15 },
    paths: [],
    nullable: null,
  } as const;

  expect(preparePhasePayload(input, {
    provider: "anthropic",
    options: { timeout: 30 },
    paths: ["src"],
    nullable: "provided",
  })).toEqual({
    provider: "anthropic",
    options: { includeTests: true, timeout: 30 },
    paths: ["src"],
    nullable: "provided",
  });
  expect(preparePhasePayload(input, undefined)).toEqual(input);
  expect(preparePhasePayload(undefined, { arbitrary: ["json"] })).toEqual({ arbitrary: ["json"] });
  expect(() => preparePhasePayload(input, { provider: 42 })).toThrow("does not match the Phase input");
});
