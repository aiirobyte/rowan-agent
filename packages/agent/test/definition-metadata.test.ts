import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeDefinitionMetadata } from "../src/index";
import {
  InMemoryConfigProvider,
  ResourceRegistry,
  brandConfigToken,
  loadPhase,
  parseAgentDefinition,
  parseFrontmatter,
  resolveConfigurationSnapshot,
} from "../src/runtime";
import { assertAgentDefinition } from "../src/harness/definitions";
import type { AgentId } from "../src/runtime-events";

async function createPhase(source: string, dirName = "metadata-phase"): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "rowan-definition-metadata-"));
  const path = join(root, dirName, "PHASE.md");
  await mkdir(join(root, dirName), { recursive: true });
  await writeFile(path, source);
  return { root, path };
}

test("loadPhase flattens top-level and explicit metadata to the same Phase metadata", async () => {
  const topLevel = await createPhase(`---
name: metadata-phase
description: Metadata phase.
owner: docs
settings:
  enabled: true
---
Phase body.
`);
  const explicit = await createPhase(`---
name: metadata-phase
description: Metadata phase.
metadata:
  owner: docs
  settings:
    enabled: true
---
Phase body.
`);
  try {
    const topLevelPhase = await loadPhase(topLevel.path);
    const explicitPhase = await loadPhase(explicit.path);
    expect(topLevelPhase.metadata).toEqual({
      owner: "docs",
      settings: { enabled: true },
    });
    expect(explicitPhase.metadata).toEqual(topLevelPhase.metadata);
    expect("metadata" in (explicitPhase.metadata ?? {})).toBe(false);
  } finally {
    await rm(topLevel.root, { recursive: true, force: true });
    await rm(explicit.root, { recursive: true, force: true });
  }
});

test("loadPhase rejects invalid explicit Phase metadata", async () => {
  const cases = [
    {
      source: `---
name: metadata-phase
description: Metadata phase.
owner: top-level
metadata:
  owner: nested
---
Phase body.
`,
      message: /both.*metadata/i,
    },
    {
      source: `---
name: metadata-phase
description: Metadata phase.
metadata: [1]
---
Phase body.
`,
      message: /metadata.*mapping/i,
    },
    {
      source: `---
name: metadata-phase
description: Metadata phase.
metadata:
  tools: []
---
Phase body.
`,
      message: /known field.*tools|tools.*known field/i,
    },
    {
      source: `---
name: metadata-phase
description: Metadata phase.
metadata:
  metadata: {}
---
Phase body.
`,
      message: /both.*metadata/i,
    },
  ] as const;

  for (const item of cases) {
    const phase = await createPhase(item.source);
    try {
      await expect(loadPhase(phase.path)).rejects.toMatchObject({
        code: "invalid_metadata",
        message: expect.stringMatching(item.message),
      });
    } finally {
      await rm(phase.root, { recursive: true, force: true });
    }
  }
});

test("Phase-only host keys phases and contexts still land in flat metadata", async () => {
  const phase = await createPhase(`---
name: metadata-phase
description: Metadata phase.
phases:
  entryPhaseId: review
  phaseIds: [review]
contexts: [project]
---
Phase body.
`);
  try {
    const loaded = await loadPhase(phase.path);
    expect(loaded.metadata).toEqual({
      phases: {
        entryPhaseId: "review",
        phaseIds: ["review"],
      },
      contexts: ["project"],
    });
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("parseAgentDefinition keeps unknown top-level keys and flattens explicit metadata", () => {
  const topLevel = parseAgentDefinition(`---
name: top-level-metadata
description: Metadata definition.
owner: docs
settings:
  enabled: true
---
Definition body.
`);
  const explicit = parseAgentDefinition(`---
name: explicit-metadata
description: Metadata definition.
metadata:
  owner: docs
  settings:
    enabled: true
---
Definition body.
`);
  expect(topLevel.metadata).toEqual({
    owner: "docs",
    settings: { enabled: true },
  });
  expect(explicit.metadata).toEqual(topLevel.metadata);
  expect("metadata" in (explicit.metadata ?? {})).toBe(false);
});

test("old key names are ordinary metadata in Agent and Phase definitions", async () => {
  const definition = parseAgentDefinition(`---
name: legacy-looking-definition
description: Legacy-looking metadata.
content: Old body.
context: [workspace]
extensions: [quality]
entryPhase: verify
---
Current body.
`);
  expect(definition.prompt).toBe("Current body.");
  expect(definition.metadata).toEqual({
    content: "Old body.",
    context: ["workspace"],
    extensions: ["quality"],
    entryPhase: "verify",
  });

  const phase = await createPhase(`---
name: legacy-looking-phase
description: Legacy-looking metadata.
content: Old body.
context: [workspace]
extensions: [quality]
entryPhase: verify
skills: [legacy-selected]
---
Current body.
`, "legacy-looking-phase");
  try {
    const loaded = await loadPhase(phase.path);
    expect(loaded.content).toBe("Current body.");
    expect(loaded.skills).toEqual([]);
    expect(loaded.metadata).toEqual({
      content: "Old body.",
      context: ["workspace"],
      extensions: ["quality"],
      entryPhase: "verify",
      skills: ["legacy-selected"],
    });
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});

test("programmatic Definition validation does not special-case old key names", () => {
  const definition: unknown = {
    name: "legacy-looking-programmatic-definition",
    description: "Legacy-looking metadata.",
    prompt: "Current body.",
    content: "Old body.",
    context: ["workspace"],
    extensions: ["quality"],
    entryPhase: "verify",
  };
  expect(() => assertAgentDefinition(definition)).not.toThrow();
});

test("parseAgentDefinition rejects invalid explicit Agent Definition metadata", () => {
  const cases = [
    {
      source: `---
name: duplicate-metadata
description: Metadata definition.
owner: top-level
metadata:
  owner: nested
---
Definition body.
`,
      message: /both.*metadata/i,
    },
    {
      source: `---
name: non-mapping-metadata
description: Metadata definition.
metadata: [1]
---
Definition body.
`,
      message: /metadata.*mapping/i,
    },
    {
      source: `---
name: known-field-metadata
description: Metadata definition.
metadata:
  tools: []
---
Definition body.
`,
      message: /known field.*tools|tools.*known field/i,
    },
  ] as const;

  for (const item of cases) {
    expect(() => parseAgentDefinition(item.source)).toThrow(item.message);
  }
});

test("AgentDefinition metadata validates and survives a configuration snapshot round trip", async () => {
  const definition = parseAgentDefinition(`---
name: snapshot-metadata
description: Metadata definition.
metadata:
  owner: docs
  settings:
    enabled: true
---
Definition body.
`);
  expect(() => assertAgentDefinition(definition)).not.toThrow();
  expect(() => assertAgentDefinition({ ...definition, metadata: [] })).toThrow(/metadata/i);

  const registry = new ResourceRegistry();
  await registry.loadAgents({ sourceId: "definitions", values: [definition] });
  const snapshot = resolveConfigurationSnapshot(registry, {
    identity: "metadata-snapshot:v1",
    definition: { name: definition.name },
    resourceView: {
      agents: ["definitions"],
      tools: [],
      skills: [],
      phases: [],
    },
    model: { provider: "test", id: "model" },
  });
  expect(snapshot.definition.metadata).toEqual(definition.metadata);

  const provider = new InMemoryConfigProvider();
  const agentId = "metadata-agent" as AgentId;
  const stored = await provider.put({
    agentId,
    config: snapshot,
    operationId: "metadata-snapshot",
    signal: new AbortController().signal,
  });
  if (stored.kind !== "stored") throw new Error("Expected the Configuration Snapshot to be stored.");
  const restored = await provider.resolve({
    agentId,
    token: brandConfigToken(stored.token),
    signal: new AbortController().signal,
  });
  expect(restored.kind).toBe("available");
  if (restored.kind === "available" && !("resources" in restored.config)) {
    throw new Error("Expected a Configuration Snapshot.");
  }
  if (restored.kind === "available" && "resources" in restored.config) {
    expect(restored.config.definition.metadata).toEqual(definition.metadata);
  }
});

test("the exported definition metadata rule matches both loaders", async () => {
  const raw = `---
name: metadata-phase
description: Metadata phase.
tools: [read]
owner: docs
settings:
  enabled: true
---
Body.
`;
  const rule = normalizeDefinitionMetadata("agent-definition", parseFrontmatter(raw).frontmatter);
  const definition = parseAgentDefinition(raw);
  expect(definition.metadata).toEqual(rule.metadata);

  const phase = await createPhase(`---
name: metadata-phase
description: Metadata phase.
tools: [read]
owner: docs
settings:
  enabled: true
---
Body.
`);
  try {
    const loaded = await loadPhase(phase.path);
    const phaseRule = normalizeDefinitionMetadata("phase", parseFrontmatter(raw).frontmatter);
    expect(phaseRule.metadata).toEqual(loaded.metadata);
    expect(phaseRule.fields.tools).toEqual(["read"]);
  } finally {
    await rm(phase.root, { recursive: true, force: true });
  }
});
