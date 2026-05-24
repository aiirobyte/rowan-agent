import type { Tool } from "../env/types";

export type McpToolProvider = {
  name: string;
  listTools(): Promise<Tool[]>;
};
