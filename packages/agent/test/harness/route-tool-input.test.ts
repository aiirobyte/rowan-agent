import { expect, test } from "bun:test";
import Schema from "typebox/schema";
import { createRouteTool } from "../../src/harness/tools/route-tool";
import type { Phase } from "../../src/harness/phases/types";

function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    name: "review",
    description: "Review the change.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Review.",
    ...overrides,
  };
}

test("route exposes and enforces a target Phase's inferred input shape", () => {
  const tool = createRouteTool([phase({
    input: {
      provider: "codex",
      timeout: 15,
      options: { includeTests: true },
      paths: [],
      metadata: {},
      nullable: null,
    },
  })]);
  const validator = Schema.Compile(tool.parameters);

  expect(validator.Check({ decision: [{ phase: "review" }] })).toBe(true);
  expect(validator.Check({
    decision: [{
      phase: "review",
      payload: {
        provider: "anthropic",
        options: {},
        paths: ["src"],
        metadata: { source: true },
        nullable: { accepted: true },
      },
    }],
  })).toBe(true);
  expect(validator.Check({
    decision: [{ phase: "review", payload: { timeout: "fast" } }],
  })).toBe(false);
  expect(validator.Check({
    decision: [{ phase: "review", payload: { unexpected: true } }],
  })).toBe(false);
  expect(tool.description).toContain("payload_schema");
  expect(tool.description).toContain("&quot;provider&quot;:{&quot;type&quot;:&quot;string&quot;");
});

test("route keeps payload unrestricted for a Phase without input", () => {
  const tool = createRouteTool([phase()]);
  const validator = Schema.Compile(tool.parameters);

  expect(validator.Check({
    decision: [{ phase: "review", payload: { any: ["json", 1, true] } }],
  })).toBe(true);
});
