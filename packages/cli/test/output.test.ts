import { expect, test } from "bun:test";
import { formatToolArgsPreview, formatToolResultOutput } from "../src/output";

test("formatToolResultOutput renders common tool results for humans", () => {
  expect(formatToolResultOutput({
    toolCallId: "call_1",
    toolName: "bash",
    ok: true,
    content: {
      command: "printf ok",
      cwd: ".",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    },
  })).toBe("ok");

  expect(formatToolResultOutput({
    toolCallId: "call_2",
    toolName: "read",
    ok: true,
    content: {
      path: "README.md",
      content: "hello",
      sizeBytes: 5,
      truncated: false,
    },
  })).toBe("README.md\nhello");
});

test("formatToolArgsPreview trims bash command leading whitespace for display only", () => {
  const args = { command: "\ngit show HEAD~4:packages/agent/src/loop/phases.ts" };
  const preview = formatToolArgsPreview("bash", args);

  expect(preview.startsWith('{"command":"git show HEAD~4')).toBe(true);
  expect(preview).not.toContain("\\n");
  expect(preview).toEndWith("...");
  expect(args.command).toBe("\ngit show HEAD~4:packages/agent/src/loop/phases.ts");
});
