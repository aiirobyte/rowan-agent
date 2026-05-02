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
      input: "使用bash查看当前日期",
      tools: [bashTool],
      decision: {
        route: "direct",
        message: "Use bash to check the current date: $(date)",
      },
    }),
  ).toEqual({
    route: "task",
    message: "Creating a task for this request.",
  });
});

test("scheduler upgrades model direct routing for workspace fact questions", () => {
  expect(
    scheduleTaskRouting({
      input: "我的workspace程序是js语言写的吗",
      tools: [bashTool],
      decision: {
        route: "direct",
        message: "我无法直接判断，需要查看文件内容或目录结构才能确认。",
      },
    }),
  ).toEqual({
    route: "task",
    message: "Creating a task for this request.",
  });
});

test("scheduler routes simple explicit tool requests to task even when threads are available", () => {
  expect(
    scheduleTaskRouting({
      input: "使用bash查看当前日期",
      tools: [bashTool],
      defaultNeedsTaskRoute: "thread",
      decision: {
        route: "direct",
        message: "Use bash to check the current date: $(date)",
      },
    }),
  ).toEqual({
    route: "task",
    message: "Creating a task for this request.",
  });
});

test("scheduler can upgrade explicit thread requests to thread routes", () => {
  expect(
    scheduleTaskRouting({
      input: "创建一个thread使用bash",
      tools: [bashTool],
      defaultNeedsTaskRoute: "thread",
      decision: {
        route: "direct",
        message: "Use bash to check the current date.",
      },
    }),
  ).toEqual({
    route: "thread",
    message: "Creating a task for this request.",
  });
});

test("scheduler promotes explicit thread task routes to thread routes", () => {
  expect(
    scheduleTaskRouting({
      input: "create a thread to use bash",
      tools: [bashTool],
      defaultNeedsTaskRoute: "thread",
      decision: {
        route: "task",
        message: "Creating a task.",
      },
    }),
  ).toEqual({
    route: "thread",
    message: "Creating a task.",
  });
});

test("scheduler preserves thread routes while thread depth allows it", () => {
  expect(
    scheduleTaskRouting({
      input: "create a thread to use bash",
      tools: [bashTool],
      defaultNeedsTaskRoute: "task",
      allowThreadRoute: true,
      decision: {
        route: "thread",
        message: "Creating another thread.",
        thread: {
          prompt: "use bash",
          task: "Run bash.",
          goal: "Return bash output.",
        },
      },
    }),
  ).toEqual({
    route: "thread",
    message: "Creating another thread.",
    thread: {
      prompt: "use bash",
      task: "Run bash.",
      goal: "Return bash output.",
    },
  });
});

test("scheduler downgrades simple tool thread routes to task routes", () => {
  expect(
    scheduleTaskRouting({
      input: "获取当前系统时间",
      tools: [bashTool],
      defaultNeedsTaskRoute: "task",
      allowThreadRoute: true,
      decision: {
        route: "thread",
        message: "Creating another thread.",
        thread: {
          prompt: "获取当前系统时间",
          task: "Run bash.",
          goal: "Return bash output.",
        },
      },
    }),
  ).toEqual({
    route: "task",
    message: "Creating a task for this request.",
  });
});

test("scheduler converts thread routes to task routes when depth limit is reached", () => {
  expect(
    scheduleTaskRouting({
      input: "use bash",
      tools: [bashTool],
      defaultNeedsTaskRoute: "task",
      allowThreadRoute: false,
      decision: {
        route: "thread",
        message: "Creating another thread.",
        thread: {
          prompt: "use bash",
          task: "Run bash.",
          goal: "Return bash output.",
        },
      },
    }),
  ).toEqual({
    route: "task",
    message: "Creating a task because the thread depth limit was reached.",
  });
});
