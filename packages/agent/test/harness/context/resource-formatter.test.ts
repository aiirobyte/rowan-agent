import { expect, test } from "bun:test";
import {
  formatResourceOutput,
  detectResourceType,
  buildPhaseDirectiveMessage,
  type ResourceOutput,
} from "../../../src/harness/context/resource-formatter";

test("detectResourceType identifies skill files", () => {
  expect(detectResourceType("/project/.rowan/skills/my-skill/SKILL.md")).toBe("skill");
  expect(detectResourceType("/home/user/.rowan/skills/zoom-out/SKILL.md")).toBe("skill");
});

test("detectResourceType identifies phase files", () => {
  expect(detectResourceType("/project/.rowan/phases/plan/PHASE.md")).toBe("phase");
  expect(detectResourceType("/home/user/.rowan/phases/execute/PHASE.md")).toBe("phase");
});

test("detectResourceType identifies markdown files", () => {
  expect(detectResourceType("/project/README.md")).toBe("markdown");
  expect(detectResourceType("/project/docs/guide.md")).toBe("markdown");
});

test("detectResourceType identifies code files", () => {
  expect(detectResourceType("/project/src/index.ts")).toBe("code");
  expect(detectResourceType("/project/src/app.js")).toBe("code");
  expect(detectResourceType("/project/main.py")).toBe("code");
  expect(detectResourceType("/project/config.yaml")).toBe("code");
  expect(detectResourceType("/project/data.json")).toBe("code");
});

test("detectResourceType defaults to file for unknown extensions", () => {
  expect(detectResourceType("/project/image.png")).toBe("file");
  expect(detectResourceType("/project/data.bin")).toBe("file");
  expect(detectResourceType("/project/Makefile")).toBe("file");
});

test("formatResourceOutput wraps skill content with XML", () => {
  const output = formatResourceOutput({
    type: "skill",
    name: "my-skill",
    location: "/project/.rowan/skills/my-skill/SKILL.md",
    content: "Do the thing.",
    baseDir: "/project/.rowan/skills/my-skill",
  });

  expect(output).toContain('<skill name="my-skill"');
  expect(output).toContain('location="/project/.rowan/skills/my-skill/SKILL.md"');
  expect(output).toContain("References are relative to /project/.rowan/skills/my-skill.");
  expect(output).toContain("Do the thing.");
  expect(output).toContain("</skill>");
});

test("formatResourceOutput wraps phase content with XML", () => {
  const output = formatResourceOutput({
    type: "phase",
    name: "plan",
    location: "/project/.rowan/phases/plan/PHASE.md",
    content: "Analyze the request.",
    baseDir: "/project/.rowan/phases/plan",
  });

  expect(output).toContain('<phase name="plan"');
  expect(output).toContain("References are relative to");
  expect(output).toContain("Analyze the request.");
  expect(output).toContain("</phase>");
});

test("formatResourceOutput omits baseDir when not provided", () => {
  const output = formatResourceOutput({
    type: "markdown",
    name: "README",
    location: "/project/README.md",
    content: "# Hello",
  });

  expect(output).toContain('<markdown name="README"');
  expect(output).not.toContain("References are relative to");
  expect(output).toContain("# Hello");
  expect(output).toContain("</markdown>");
});

test("formatResourceOutput escapes XML special characters in attributes", () => {
  const output = formatResourceOutput({
    type: "file",
    name: 'test"file',
    location: "/path/with<special>",
    content: "content",
  });

  expect(output).toContain('name="test&quot;file"');
  expect(output).toContain('location="/path/with&lt;special&gt;"');
});

test("buildPhaseDirectiveMessage returns user context text", () => {
  const output = buildPhaseDirectiveMessage(
    { name: "review", content: "Review the change." },
    { instruction: "Check the output.", results: [{ name: "plan", output: { ok: true } }] },
  );

  expect(typeof output).toBe("string");
  expect(output).toContain('<phase_content name="review">');
  expect(output).toContain("Review the change.");
  expect(output).toContain("<prev_phase_outputs>");
  expect(output).toContain("<instruction>Check the output.</instruction>");
  expect(output).toContain("<ok>true</ok>");
  expect(output).toContain("</phase_content>");
});
