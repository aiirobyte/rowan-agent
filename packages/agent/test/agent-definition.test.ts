import { expect, test } from "bun:test";
import { parseAgentDefinition } from "../src/index";
import { assertAgentDefinition } from "../src/harness/definitions";

test("parseAgentDefinition parses the shared declarative fields", () => {
  expect(() => parseAgentDefinition(`---
name: reviewer
description: Review the current change.
tools: [read, read, bash]
skills: [testing]
phases:
  entryPhaseId: verify
  phaseIds: [verify, verify]
extensions: [quality]
context: [project_context]
model: openai/gpt-5
---
Review the change and report concrete findings.
`)).toThrow(/extensions.*Runtime-global/i);
  expect(() => assertAgentDefinition({
    name: "programmatic-legacy",
    description: "Legacy selector.",
    content: "Rejected.",
    extensions: ["quality"],
  } as never)).toThrow(/extensions.*Runtime-global/i);

  const definition = parseAgentDefinition(`---
name: reviewer
description: Review the current change.
tools: [read, read, bash]
skills: [testing]
phases:
  entryPhaseId: verify
  phaseIds: [verify, verify]
context: [project_context]
model: openai/gpt-5
---
Review the change and report concrete findings.
`);
  expect(definition).toEqual({
    name: "reviewer",
    description: "Review the current change.",
    content: "Review the change and report concrete findings.",
    tools: ["read", "bash"],
    skills: ["testing"],
    phases: { entryPhaseId: "verify", phaseIds: ["verify"] },
    context: ["project_context"],
    model: { provider: "openai", id: "gpt-5" },
  });
});

test("parseAgentDefinition distinguishes inherited and explicitly empty selections", () => {
  expect(parseAgentDefinition(`---
name: inherited
description: Inherit candidates.
---
Use inherited candidates.
`)).toEqual({
    name: "inherited",
    description: "Inherit candidates.",
    content: "Use inherited candidates.",
  });

  expect(parseAgentDefinition(`---
name: empty
description: Select no candidates.
tools: []
skills: []
phases:
  entryPhaseId: null
  phaseIds: []
context: []
---
Use no candidates.
`)).toEqual({
    name: "empty",
    description: "Select no candidates.",
    content: "Use no candidates.",
    tools: [],
    skills: [],
    phases: { entryPhaseId: null, phaseIds: [] },
    context: [],
  });
});

test("parseAgentDefinition rejects malformed common fields", () => {
  expect(() => parseAgentDefinition(`---
name: invalid-list
description: Invalid list.
tools: read
---
Content.
`)).toThrow(/tools must be an array of strings/i);
  expect(() => parseAgentDefinition(`---
name: invalid-model
description: Invalid model.
model: /
---
Content.
`)).toThrow(/valid model reference/i);
  expect(() => parseAgentDefinition(`---
name: legacy-entry
description: Legacy entry fields are rejected.
entryPhase: verify
---
Content.
`)).toThrow(/entryPhase/i);
  expect(() => parseAgentDefinition(`---
name: legacy-phases
description: Legacy phase lists are rejected.
phases: [verify]
---
Content.
`)).toThrow(/phases/i);
  expect(() => parseAgentDefinition(`---
description: Missing name.
---
Content.
`)).toThrow(/name is required/i);
  expect(() => parseAgentDefinition(`---
name: missing-content
description: Missing content.
---
`)).toThrow(/content is required/i);
  expect(() => parseAgentDefinition(`---
name: invalid-yaml
description: [
---
Content.
`)).toThrow();
});
