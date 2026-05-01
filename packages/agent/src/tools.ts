import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "./types";

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

export function createCoreTools(): Tool[] {
  return [readSkillTool];
}
