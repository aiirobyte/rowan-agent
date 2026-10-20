import Type from "typebox";
import Schema from "typebox/schema";
import type { ToolResult } from "@rowan-agent/models";
import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "../harness/tools";
import type { AgentId, JsonValue } from "../runtime-events";
import type { Tool } from "./contracts";

export const CORE_TOOL_NAMES = new Set(["read", "edit", "write", "bash", "respond_interaction"]);

/** Answers a pending Interaction on a Run of a child of `parent`. */
export type RespondChildInteraction = (
  parent: AgentId,
  input: Readonly<{ agentId: AgentId; interactionId: string; answer: JsonValue }>,
) => Promise<ToolResult>;

const RespondInteractionArgsSchema = Type.Object({
  agentId: Type.String({ description: "The child Agent whose Run raised the Interaction." }),
  interactionId: Type.String({ description: "The Interaction to answer." }),
  answer: Type.Any({ description: "The answer, as the person would give it; a permission Interaction takes the same answer the host's prompt offers." }),
});
const RespondInteractionArgsValidator = Schema.Compile(RespondInteractionArgsSchema);

/** The Core Tool through which an Agent answers an Interaction raised by one of its children. */
function createRespondInteractionTool(respond: RespondChildInteraction): Tool {
  return {
    name: "respond_interaction",
    core: true,
    description: "Answer a pending question or permission request raised by one of your child Agents.",
    parameters: RespondInteractionArgsSchema,
    async execute(args, context) {
      const { agentId, interactionId, answer } = RespondInteractionArgsValidator.Parse(args);
      return respond(context.agentId, { agentId: agentId as AgentId, interactionId, answer: answer as JsonValue });
    },
  };
}

/**
 * Adapt the established host-filesystem Core Tools to the durable Runtime Tool
 * contract. `respond` adds the Core Tool for Agents that have children.
 */
export function createRuntimeCoreTools(input: CoreToolContext = {}, respond?: RespondChildInteraction): Tool[] {
  return [
    ...createLegacyCoreTools(input).map((tool) => ({
      ...tool,
      core: true,
    })),
    ...(respond ? [createRespondInteractionTool(respond)] : []),
  ];
}
