import type { TaskRoutingDecision, Tool } from "./types";

export type TaskRoutingScheduleInput = {
  input: string;
  tools: Tool[];
  decision: TaskRoutingDecision;
  defaultNeedsTaskRoute?: "task" | "thread";
  allowThreadRoute?: boolean;
};

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function hasExplicitThreadRequest(input: string): boolean {
  return /\b(thread|child thread|sub-agent|subagent|delegate|delegated)\b/i.test(input) ||
    /(创建|开|启动|派|委派).*(thread|线程|子线程|子任务|子agent|子代理)/i.test(input) ||
    /(thread|线程|子线程|子任务|子agent|子代理).*(创建|开|启动|派|委派)/i.test(input);
}

export function hasExplicitToolRequest(input: string, tools: Tool[] = []): boolean {
  const text = input.toLowerCase();
  const compact = text.replace(/\s+/g, "");
  const availableToolNames = tools.flatMap((tool) => {
    const lower = tool.name.toLowerCase();
    const suffix = lower.split(".").at(-1);
    return suffix && suffix !== lower ? [lower, suffix] : [lower];
  });
  const mentionsAvailableTool = availableToolNames.some((name) => {
    const compactName = name.replace(/\s+/g, "");
    if (!compactName) {
      return false;
    }
    return compact.includes(compactName) || text.includes(name);
  });

  if (
    mentionsAvailableTool &&
    includesAny(compact, ["use", "call", "run", "execute", "使用", "调用", "运行", "执行", "查看"])
  ) {
    return true;
  }

  return [
    /\b(use|run|execute|call)\b.*\b(bash|shell|terminal|command|cmd)\b/i,
    /\b(bash|shell|terminal|command|cmd)\b.*\b(use|run|execute|call)\b/i,
    /(使用|用|调用|运行|执行|查看).*(bash|shell|终端|命令)/i,
    /(bash|shell|终端|命令).*(使用|调用|运行|执行|查看)/i,
    /\b(use|call)\b.*\b(tool|tools)\b/i,
    /(使用|调用).*(工具)/i,
    /(列出|读取|搜索|修改|写入|替换|查看).*(workspace|工作区|项目|仓库|文件|目录)/i,
    /\b(list|read|search|modify|write|edit|patch|diff|inspect)\b.*\b(workspace|repo|project|file|directory)\b/i,
    /(workspace|工作区|项目|工程|仓库|代码库|repo|repository|codebase).*(程序|代码|语言|框架|依赖|配置|结构|版本|文件|目录|图片|资源).*(是|是否|是不是|有|有没有|包含|包括|使用|采用|写|写的)/i,
    /(我的|当前|这个|本地).*(workspace|工作区|项目|工程|仓库|代码库|repo|repository|codebase).*(是|是否|是不是|有|有没有|包含|包括|使用|采用|写|写的)/i,
    /\b(workspace|repo|repository|project|codebase)\b.*\b(is|are|does|do|has|have|use|uses|using|written|language|framework|dependency|dependencies|config|version|contain|include|file|directory|asset)\b/i,
    /(当前|现在|系统).*(时间|日期)/i,
    /(时间|日期).*(当前|现在|系统)/i,
    /\b(current|system|local|today'?s?)\b.*\b(time|date)\b/i,
    /\b(time|date)\b.*\b(current|system|local|today'?s?)\b/i,
  ].some((pattern) => pattern.test(input));
}

export function scheduleTaskRouting(input: TaskRoutingScheduleInput): TaskRoutingDecision {
  const defaultRoute = input.defaultNeedsTaskRoute ?? "task";
  if (input.decision.route === "thread" && input.allowThreadRoute === false) {
    return {
      route: "task",
      message: "Creating a task because the thread depth limit was reached.",
    };
  }

  if (
    input.decision.route === "thread" &&
    hasExplicitToolRequest(input.input, input.tools) &&
    !hasExplicitThreadRequest(input.input)
  ) {
    return {
      route: "task",
      message: "Creating a task for this request.",
    };
  }

  if (input.decision.route !== "direct") {
    if (
      defaultRoute === "thread" &&
      input.decision.route === "task" &&
      hasExplicitThreadRequest(input.input)
    ) {
      return {
        ...input.decision,
        route: "thread",
      };
    }
    return input.decision;
  }

  if (!hasExplicitToolRequest(input.input, input.tools)) {
    return input.decision;
  }

  const route = defaultRoute === "thread" && !hasExplicitThreadRequest(input.input) ? "task" : defaultRoute;
  return {
    route,
    message: "Creating a task for this request.",
  };
}
