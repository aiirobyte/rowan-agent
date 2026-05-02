import type { TaskRoutingDecision, Tool } from "./types";

export type TaskRoutingScheduleInput = {
  userInput: string;
  tools: Tool[];
  decision: TaskRoutingDecision;
  defaultNeedsTaskRoute?: "task" | "thread";
};

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

export function hasExplicitToolRequest(userInput: string, tools: Tool[] = []): boolean {
  const text = userInput.toLowerCase();
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
  ].some((pattern) => pattern.test(userInput));
}

export function scheduleTaskRouting(input: TaskRoutingScheduleInput): TaskRoutingDecision {
  const defaultRoute = input.defaultNeedsTaskRoute ?? "task";
  if (input.decision.needsTask) {
    return {
      ...input.decision,
      route: input.decision.route ?? defaultRoute,
    };
  }

  if (!hasExplicitToolRequest(input.userInput, input.tools)) {
    return {
      ...input.decision,
      route: input.decision.route ?? "direct",
    };
  }

  return {
    needsTask: true,
    route: defaultRoute,
    message: "Creating a task for this request.",
  };
}
