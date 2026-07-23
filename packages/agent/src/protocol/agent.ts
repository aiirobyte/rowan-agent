import type { LlmContentPart } from "@rowan-agent/models";

export type AgentMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmContentPart[];
  createdAt: string;
  metadata?: Record<string, unknown> & {
    phase?: string;
  };
};

export type Skill = {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file */
  filePath: string;
  /** Directory containing the SKILL.md file */
  baseDir: string;
  /** Full body content of the SKILL.md (after frontmatter) */
  content: string;
  disableModelInvocation: boolean;
};

export type Outcome = {
  id: string;
  message: string;
  /** Publish this outcome's message as an assistant message before completing the run. */
  display?: boolean;
  payload?: unknown;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    ok: boolean;
    content: unknown;
    error?: string;
  }>;
};

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type ToolResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  content: unknown;
  error?: string;
};
