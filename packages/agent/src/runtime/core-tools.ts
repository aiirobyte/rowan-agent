import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "../harness/tools";
import type { Tool } from "./contracts";

export const CORE_TOOL_NAMES = new Set(["read", "edit", "write", "bash"]);

/** Adapt the established host-filesystem Core Tools to the durable Runtime Tool contract. */
export function createRuntimeCoreTools(input: CoreToolContext = {}): Tool[] {
  return createLegacyCoreTools(input).map((tool) => ({
    ...tool,
    core: true,
  }));
}
