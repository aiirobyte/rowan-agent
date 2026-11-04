import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "../harness/tools";
import type { Tool } from "./contracts";

export const CORE_TOOL_ORDER = ["read", "bash", "edit", "write"] as const;
export const CORE_TOOL_NAMES = new Set<string>(CORE_TOOL_ORDER);

/** Adapt the established host-filesystem Core Tools to the durable Runtime Tool contract. */
export function createRuntimeCoreTools(input: CoreToolContext = {}): Tool[] {
  return createLegacyCoreTools(input).map((tool) => ({
    ...tool,
    core: true,
  }));
}
