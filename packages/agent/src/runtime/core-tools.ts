import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "../harness/tools";
import type { JsonValue, Tool, ToolInvocationContext } from "./contracts";

/** Adapt the established host-filesystem Core Tools to the durable Runtime Tool contract. */
export function createRuntimeCoreTools(input: CoreToolContext = {}): Tool[] {
  return createLegacyCoreTools(input).map((tool) => ({
    name: tool.name,
    core: true,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args: JsonValue, context: ToolInvocationContext, signal: AbortSignal) => {
      const result = await tool.execute(args, { skills: [], toolCallId: context.toolCallId }, signal);
      return result.ok
        ? { ok: true, content: result.content as JsonValue }
        : { ok: false, content: result.content as JsonValue, error: result.error ?? "Tool failed." };
    },
  }));
}
