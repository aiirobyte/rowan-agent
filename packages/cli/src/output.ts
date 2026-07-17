import type { AgentMessage, ToolResult } from "@rowan-agent/agent";

const TOOL_ARGS_PREVIEW_LIMIT = 60;

export function formatJsonOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatToolArgsPreview(toolName: string, args: unknown): string {
  const previewArgs =
    toolName === "bash" && isRecord(args) && typeof args.command === "string"
      ? { ...args, command: args.command.trimStart() }
      : args;
  const argsStr = JSON.stringify(previewArgs);
  return argsStr.length > TOOL_ARGS_PREVIEW_LIMIT
    ? `${argsStr.slice(0, TOOL_ARGS_PREVIEW_LIMIT)}...`
    : argsStr;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function messageContentText(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "tool_result") return part.content;
      if (part.type === "tool_use") return JSON.stringify(part.input);
      if (part.type === "image") return `[image:${part.mimeType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function formatToolResultOutput(result: ToolResult): string {
  const prefix = result.ok ? "" : `${result.toolName} failed${result.error ? `: ${result.error}` : ""}`;
  const content = result.content;

  if (typeof content === "string") {
    return [prefix, content].filter(Boolean).join("\n").trim();
  }

  if (isRecord(content)) {
    if (result.toolName === "bash") {
      const stdout = stringValue(content.stdout);
      const stderr = stringValue(content.stderr);
      const text = [stdout, stderr].filter(Boolean).join("\n").trim();
      return [prefix, text].filter(Boolean).join("\n").trim();
    }

    if (result.toolName === "read") {
      const path = stringValue(content.path);
      const text = stringValue(content.content);
      return [prefix, path, text].filter(Boolean).join("\n").trim();
    }

    const rendered = formatJsonOutput(content);
    return [prefix, rendered].filter(Boolean).join("\n").trim();
  }

  return prefix || String(content ?? "");
}

export function formatMessageContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  const parts: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push(part.text);
      continue;
    }
    if (part.type === "tool_result") {
      try {
        parts.push(formatToolResultOutput(JSON.parse(part.content) as ToolResult));
      } catch {
        parts.push(part.content);
      }
    }
  }

  return parts.join("\n").trim() || messageContentText(content);
}
