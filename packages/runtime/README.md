# @rowan-agent/runtime

## Main Features

`@rowan-agent/runtime` is Rowan's runtime glue package. It provides workspace path helpers, built-in local tools, skill loading, tool hook types, and the MCP tool-provider boundary used by the Agent core.

The Agent loop itself lives in `@rowan-agent/agent`: route, plan, execute, verify, thread semantics, retries, outcome creation, and execution turn recording are Agent behavior.

## Architecture

Runtime-owned modules:

- `src/dir.ts` resolves source/binary workspaces and safe in-workspace paths.
- `src/tools.ts` provides built-in `read`, `write`, `edit`, and `bash` tools.
- `src/skills.ts` loads `SKILL.md` files.
- `src/hooks/index.ts` exports tool approval/review hook types.
- `src/mcp/index.ts` reserves the MCP tool-provider integration surface.
- `src/types.ts` defines runtime integration types for tools and hooks.

Runtime intentionally does not export Agent loop, thread, phase, runner, or task outcome APIs.

## Usage Flow

Most callers use runtime through `@rowan-agent/agent`:

```ts
import { Agent, createCoreTools } from "@rowan-agent/agent";

const agent = new Agent({
  systemPrompt: "You are Rowan.",
  model: { provider: "openai-compatible", name: "gpt-4.1-mini" },
  stream,
  tools: createCoreTools({ root: process.cwd() }),
});
```

Composition roots such as the CLI can also import workspace and skill helpers directly from runtime.
