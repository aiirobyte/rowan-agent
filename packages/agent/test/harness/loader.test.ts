import { expect, test } from "bun:test";
import { inferResourceName, isExplicitPath, parseFrontmatter } from "../../src/harness/loader";

// --- parseFrontmatter ---

test("returns empty frontmatter when no --- delimiters", () => {
  const result = parseFrontmatter("just some text");
  expect(result.frontmatter).toEqual({});
  expect(result.body).toBe("just some text");
});

test("parses simple key: value pairs", () => {
  const result = parseFrontmatter("---\nname: Plan\ndescription: desc\n---\nbody");
  expect(result.frontmatter).toEqual({ name: "Plan", description: "desc" });
  expect(result.body).toBe("body");
});

test("parses numbers, booleans, and arrays", () => {
  const result = parseFrontmatter("---\ncount: 42\nactive: true\ntags: [a, b]\n---\n");
  expect(result.frontmatter).toEqual({ count: 42, active: true, tags: ["a", "b"] });
});

test("strips quotes from string values", () => {
  const result = parseFrontmatter('---\nname: "quoted"\nother: \'single\'\n---\n');
  expect(result.frontmatter).toEqual({ name: "quoted", other: "single" });
});

test("handles CRLF line endings", () => {
  const result = parseFrontmatter("---\r\nname: Test\r\n---\r\nbody");
  expect(result.frontmatter).toEqual({ name: "Test" });
  expect(result.body).toBe("body");
});

// --- nested maps ---

test("parses single-level nested map", () => {
  const input = "---\ninput:\n  task: do something\n  context: extra info\n---\n";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({
    input: { task: "do something", context: "extra info" },
  });
});

test("parses nested map mixed with flat keys", () => {
  const input = "---\nname: Plan\ninput:\n  task: do something\n  context: extra\ndescription: desc\n---\nbody";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({
    name: "Plan",
    input: { task: "do something", context: "extra" },
    description: "desc",
  });
});

test("skips key with empty value and no indented lines", () => {
  const input = "---\ntop:\nnext: value\n---\n";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({ next: "value" });
  expect((result.frontmatter as any).top).toBeUndefined();
});

test("skips key with empty value followed by blank line", () => {
  const input = "---\ntop:\n\nnext: value\n---\n";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({ next: "value" });
});

test("parses nested map with single entry", () => {
  const input = "---\nconfig:\n  key: val\n---\n";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({ config: { key: "val" } });
});

test("stops nested parsing at non-indented line", () => {
  const input = "---\nnested:\n  a: 1\nnotnested: 2\n---\n";
  const result = parseFrontmatter(input);
  expect(result.frontmatter).toEqual({
    nested: { a: "1" },
    notnested: 2,
  });
});

// --- isExplicitPath ---

test("isExplicitPath returns false for bare name", () => {
  expect(isExplicitPath("plan")).toBe(false);
});

test("isExplicitPath returns true for path with slash", () => {
  expect(isExplicitPath("phases/plan")).toBe(true);
});

test("isExplicitPath returns true for file with extension", () => {
  expect(isExplicitPath("plan.md")).toBe(true);
});

// --- inferResourceName ---

test("inferResourceName uses parent dir for marker file", () => {
  expect(inferResourceName("/foo/bar/PHASE.md", "PHASE.md")).toBe("bar");
});

test("inferResourceName uses filename for non-marker file", () => {
  expect(inferResourceName("/foo/bar/SKILL.md", "PHASE.md")).toBe("SKILL");
});

test("inferResourceName is case-insensitive for marker match", () => {
  expect(inferResourceName("/foo/bar/phase.md", "PHASE.md")).toBe("bar");
});
