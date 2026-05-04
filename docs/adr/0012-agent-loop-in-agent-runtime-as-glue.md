# Agent Loop In Agent Runtime As Glue

The Agent loop, phases, thread semantics, attempts, verification, and Outcomes belong in `packages/agent`. Runtime remains glue for workspace helpers, skills, hooks, tools, MCP, plugins, and policy integration; it must not own route, plan, execute, or verify ordering.
