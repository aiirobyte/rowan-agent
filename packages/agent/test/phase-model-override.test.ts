import { expect, test } from "bun:test";
import { parseModelRef } from "../src/harness/config";
import type { PhaseFrontmatter } from "../src/harness/phases/types";

// parseModelRef is exported from config.ts
test("parseModelRef resolves bare id to wildcard provider", () => {
  expect(parseModelRef("gpt-4.1")).toEqual({ provider: "*", id: "gpt-4.1" });
});

test("parseModelRef resolves provider/id", () => {
  expect(parseModelRef("anthropic/claude-sonnet-4-20250514")).toEqual({
    provider: "anthropic",
    id: "claude-sonnet-4-20250514",
  });
});

// PhaseFrontmatter now has model field
test("PhaseFrontmatter accepts model string", () => {
  const fm: PhaseFrontmatter = {
    name: "Test",
    description: "A test phase",
    model: "anthropic/claude-sonnet-4-20250514",
  };
  const ref = parseModelRef(fm.model);
  expect(ref).toEqual({ provider: "anthropic", id: "claude-sonnet-4-20250514" });
});

test("PhaseFrontmatter model is optional", () => {
  const fm: PhaseFrontmatter = {
    name: "Test",
    description: "A test phase",
  };
  expect(fm.model).toBeUndefined();
});

test("PhaseFrontmatter model parses bare id as wildcard", () => {
  const fm: PhaseFrontmatter = {
    model: "gpt-4.1-mini",
  };
  const ref = parseModelRef(fm.model);
  expect(ref).toEqual({ provider: "*", id: "gpt-4.1-mini" });
});
