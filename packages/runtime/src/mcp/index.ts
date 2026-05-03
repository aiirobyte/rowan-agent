import type { Tool } from "../types";

export type McpToolProvider = {
  name: string;
  listTools(): Promise<Tool[]>;
};
