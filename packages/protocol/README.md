# @rowan-agent/protocol

## Main Features

`@rowan-agent/protocol` is the shared type and protocol layer for Rowan packages. It defines model references, LLM phases, tasks, tool calls, tool results, run limits, contexts, execution steps, Outcomes, and structured output validators.

This package has no runtime side effects. Its main job is to keep adapters, context, runtime, agent, and store modules on the same data contract.

## Architecture

The source is split by protocol domain:

- `context.ts` defines `LlmContext`, `StreamFn`, and model stream events.
- `model.ts` defines model references and token usage.
- `phase.ts` defines the `route`, `plan`, `execute`, and `verify` phases.
- `task.ts` defines tasks, acceptance criteria, routing decisions, run limits, task output, and Outcomes.
- `tool.ts` defines tool definitions, tool calls, and tool results.
- `turn.ts` defines persistable execution steps and filters.
- `validators.ts` provides runtime parsers, `createId`, and default acceptance criteria.

`src/index.ts` exports the full protocol surface.

## Usage Flow

1. Prefer protocol types at package boundaries to avoid redefining shared structures.
2. Use `Validators` for data that comes from models, files, or external tools.
3. Use `createId(prefix)` when generating task, message, tool-call, or Outcome ids.
4. Use `createDefaultCriteria(description)` when a model-judged acceptance criterion is enough.

```ts
import { Validators, type Task } from "@rowan-agent/protocol";

const task: Task = Validators.task.Parse(rawTask);
```
