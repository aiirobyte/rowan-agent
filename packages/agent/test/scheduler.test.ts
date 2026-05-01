import { expect, test } from "bun:test";
import Type from "typebox";
import { hasExplicitToolRequest, scheduleTaskRouting } from "../src/scheduler";
import type { Tool } from "../src/types";

const bashTool: Tool<{ command: string }> = {
  name: "workspace.bash",
  description: "Runs a bash command.",
  parameters: Type.Object({ command: Type.String() }),
  async execute(args, context) {
    return {
      toolCallId: context.toolCallId,
      toolName: "workspace.bash",
      ok: true,
      content: args.command,
    };
  },
};

test("scheduler detects explicit tool requests", () => {
  expect(hasExplicitToolRequest("使用bash查看当前日期", [bashTool])).toBe(true);
  expect(hasExplicitToolRequest("hello", [bashTool])).toBe(false);
});

test("scheduler upgrades model direct routing when user explicitly asks for a tool", () => {
  expect(
    scheduleTaskRouting({
      userInput: "使用bash查看当前日期",
      tools: [bashTool],
      decision: {
        needsTask: false,
        message: "Use bash to check the current date: $(date)",
      },
    }),
  ).toEqual({
    needsTask: true,
    message: "Creating a task for this request.",
  });
});
