# ToolRunner Over Tool Service

Tool execution should converge on a runtime-owned ToolRunner rather than an Agent-owned tool service. The Agent loop owns run ordering and effects; runtime glue owns tool lookup, validation, hooks, and local or MCP execution.
