import { expect, test } from "bun:test";
import { parseAgentDefinition } from "../src/index";

test("parseAgentDefinition parses the shared declarative fields", () => {
  const definition = parseAgentDefinition(`---
name: reviewer
description: Review the current change.
tools: [read, read, bash]
skills: [testing]
phases: [verify]
extensions: [quality]
entryPhase: verify
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
    phases: ["verify"],
    extensions: ["quality"],
    entryPhase: "verify",
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
phases: []
extensions: []
---
Use no candidates.
`)).toEqual({
    name: "empty",
    description: "Select no candidates.",
    content: "Use no candidates.",
    tools: [],
    skills: [],
    phases: [],
    extensions: [],
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
