import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "./types";
import { createId } from "./types";

const EchoArgsSchema = Type.Object({
  message: Type.String(),
});

type EchoArgs = Type.Static<typeof EchoArgsSchema>;

const EchoArgsValidator = Schema.Compile(EchoArgsSchema);

export const echoTool: Tool<EchoArgs> = {
  name: "echo",
  description: "Returns the input message as evidence.",
  parameters: EchoArgsSchema,
  async execute(args: EchoArgs, context: ToolContext): Promise<ToolResult> {
    const parsed = EchoArgsValidator.Parse(args);
    return {
      toolCallId: context.toolCallId,
      toolName: "echo",
      ok: true,
      content: parsed.message,
    };
  },
};

export const nowTool: Tool = {
  name: "now",
  description: "Returns the current ISO timestamp.",
  parameters: Type.Object({}),
  async execute(_args: unknown, context: ToolContext): Promise<ToolResult> {
    return {
      toolCallId: context.toolCallId,
      toolName: "now",
      ok: true,
      content: new Date().toISOString(),
    };
  },
};

const ReadSkillArgsSchema = Type.Object({
  id: Type.String(),
});

type ReadSkillArgs = Type.Static<typeof ReadSkillArgsSchema>;

const ReadSkillArgsValidator = Schema.Compile(ReadSkillArgsSchema);

export const readSkillTool: Tool<ReadSkillArgs> = {
  name: "read_skill",
  description: "Returns the content for a loaded SKILL.md by id.",
  parameters: ReadSkillArgsSchema,
  async execute(args: ReadSkillArgs, context: ToolContext): Promise<ToolResult> {
    const parsed = ReadSkillArgsValidator.Parse(args);
    const skill = context.session.skills.find((candidate) => candidate.id === parsed.id);
    if (!skill) {
      return {
      toolCallId: context.toolCallId,
      toolName: "read_skill",
      ok: false,
      content: null,
        error: `Skill not loaded: ${parsed.id}`,
      };
    }

    return {
      toolCallId: context.toolCallId,
      toolName: "read_skill",
      ok: true,
      content: skill.content,
    };
  },
};

export function createDemoTools(): Tool[] {
  return [echoTool, nowTool, readSkillTool];
}
