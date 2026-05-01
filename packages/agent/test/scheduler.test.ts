import { expect, test } from "bun:test";
import Type from "typebox";
import { hasExplicitToolRequest, scheduleTaskRouting } from "../src/scheduler";
import type { Tool } from "../src/types";

const bashTool: Tool<{ command: string }> = {
  name: "bash",
  description: "Runs a bash command.",
  parameters: Type.Object({ command: Type.String() }),
  async execute(args, context) {
    return {
      toolCallId: context.toolCallId,
      toolName: "bash",
      ok: true,
      content: args.command,
    };
  },
};

test("scheduler detects explicit tool requests", () => {
  expect(hasExplicitToolRequest("使用bash查看当前日期", [bashTool])).toBe(true);
  expect(hasExplicitToolRequest("我的workspace程序是js语言写的吗", [bashTool])).toBe(true);
  expect(hasExplicitToolRequest("does this codebase use TypeScript", [bashTool])).toBe(true);
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

test("scheduler upgrades model direct routing for workspace fact questions", () => {
  expect(
    scheduleTaskRouting({
      userInput: "我的workspace程序是js语言写的吗",
      tools: [bashTool],
      decision: {
        needsTask: false,
        message: "我无法直接判断，需要查看文件内容或目录结构才能确认。",
      },
    }),
  ).toEqual({
    needsTask: true,
    message: "Creating a task for this request.",
  });
});
