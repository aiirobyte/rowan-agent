import { expect, test } from "bun:test";
import {
  escapeXml,
  escapeXmlText,
  formatResourceOutput,
  detectResourceType,
  buildPhaseDirectiveMessage,
  buildStructuredSection,
  buildSkillsDescription,
  buildContextDescription,
  jsonToXml,
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

test("buildPhaseDirectiveMessage preserves direct-route instructions without a payload", () => {
  const output = buildPhaseDirectiveMessage(
    { name: "review", content: "Review the change." },
    { instruction: "Check the current result." },
  );

  expect(output).toContain("<prev_phase_outputs>");
  expect(output).toContain("<instruction>Check the current result.</instruction>");
});

test("escapeXml escapes all five XML entities", () => {
  expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
});

test("escapeXmlText escapes only &, <, and >, keeping quotes literal", () => {
  expect(escapeXmlText(`<&>"'`)).toBe("&lt;&amp;&gt;\"'");
  expect(escapeXmlText('He said "it\'s fine" & left <now>')).toBe(
    'He said "it\'s fine" &amp; left &lt;now&gt;',
  );
});

test("jsonToXml preserves quotes and escapes &, <, > in element text", () => {
  const result = jsonToXml(
    {
      scalar: 'He said "hello" & \'goodbye\' <now>',
      array: ['"quoted"', "'single'", "a & b <tag>"],
      nested: {
        msg: 'Rock & Roll: "classic"',
      },
    },
    0,
  );

  expect(result).toContain('<scalar>He said "hello" &amp; \'goodbye\' &lt;now&gt;</scalar>');
  expect(result).toContain('<item>"quoted"</item>');
  expect(result).toContain("<item>'single'</item>");
  expect(result).toContain("<item>a &amp; b &lt;tag&gt;</item>");
  expect(result).toContain('<msg>Rock &amp; Roll: "classic"</msg>');
  expect(result).not.toContain("&quot;");
  expect(result).not.toContain("&apos;");
});

test("buildStructuredSection preserves quotes and escapes &, <, > in element text", () => {
  const section = buildStructuredSection("entry", [
    {
      summary: 'He said "ok" & smiled',
      detail: "<tag> and 'quotes'",
    },
  ]);

  expect(section).toContain('<summary>He said "ok" &amp; smiled</summary>');
  expect(section).toContain("<detail>&lt;tag&gt; and 'quotes'</detail>");
  expect(section).not.toContain("&quot;");
  expect(section).not.toContain("&apos;");
});

test("buildSkillsDescription preserves quotes and escapes &, <, > in element text", () => {
  const skills = [
    {
      name: 'skill "alpha"',
      description: "It's <great> & fast",
      filePath: '/path/"dir"/\'file\'/<name>.md',
    },
  ];
  const output = buildSkillsDescription(skills);

  expect(output).toContain('<name>skill "alpha"</name>');
  expect(output).toContain("<description>It's &lt;great&gt; &amp; fast</description>");
  expect(output).toContain('<location>/path/"dir"/\'file\'/&lt;name&gt;.md</location>');
  expect(output).not.toContain("&quot;");
  expect(output).not.toContain("&apos;");
});

test("buildContextDescription keeps attribute quotes escaped while body preserves quotes", () => {
  const output = buildContextDescription([
    {
      name: 'ctx"1"',
      value: { note: 'It\'s "fine" & <ok>' },
    },
  ]);

  expect(output).toContain('<context name="ctx&quot;1&quot;">');
  expect(output).toContain('<note>It\'s "fine" &amp; &lt;ok&gt;</note>');
  expect(output).not.toContain("&apos;");
});

test("buildPhaseDirectiveMessage keeps quotes literal in instruction element text and escapes attributes", () => {
  const output = buildPhaseDirectiveMessage(
    { name: 'phase"1"', content: "Phase content." },
    {
      instruction: 'Do "task" & don\'t <fail>',
      results: [
        {
          name: 'source"phase"',
          output: { response: 'Output with "quotes" & <tag>' },
        },
      ],
    },
  );

  expect(output).toContain('<phase_content name="phase&quot;1&quot;">');
  expect(output).toContain('<instruction>Do "task" &amp; don\'t &lt;fail&gt;</instruction>');
  expect(output).toContain('<phase name="source&quot;phase&quot;">');
  expect(output).toContain('<response>Output with "quotes" &amp; &lt;tag&gt;</response>');
});
