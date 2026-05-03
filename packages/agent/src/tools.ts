import {
  createCoreTools as createRuntimeCoreTools,
} from "@rowan-agent/runtime/tools";
import type { CoreToolContext } from "@rowan-agent/runtime/tools";
import type { Tool } from "./types";

export {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@rowan-agent/runtime/tools";
export type { CoreToolContext };

export function createCoreTools(input: CoreToolContext = {}): Tool[] {
  return createRuntimeCoreTools(input) as unknown as Tool[];
}
