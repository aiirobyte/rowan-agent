# @rowan-agent/context

## Main Features

`@rowan-agent/context` converts Rowan sessions, phases, tools, and skills into model-readable prompts. It generates strict JSON-only instructions for the route, plan, execute, and verify phases, and trims conversation history to the context window needed for the current phase.

This package does not call models or execute tools directly. It only produces OpenAI-compatible chat messages so adapters and the runtime can share the same prompt contract.

## Architecture

`src/prompt.ts` stores the phase prompt templates:

- `buildSystemPrompt` combines the caller's system prompt with Rowan JSON output constraints.
- `buildRoutePrompt` asks the model to choose direct, task, or thread routing.
- `buildPlanPrompt` asks the model to produce a standard `Task`.
- `buildExecutePrompt` asks the model to select allowed tool calls.
- `buildVerifyPrompt` asks the model to judge task output against acceptance criteria.

`src/prompt-builder.ts` converts `LlmContext` into `ChatMessage[]`. It serializes tool definitions, summarizes skills, selects recent conversation messages, and returns the current phase's `phasePromptMessage` for runtime recording.

## Usage Flow

1. The runtime builds an `LlmContext` containing the phase, session, task, tool results, or acceptance criteria.
2. Call `buildOpenAICompatiblePrompt({ context, tools })`.
3. Send the returned `messages` to the model.
4. Record `phasePromptMessage` in execution steps for replay and debugging.

```ts
import { buildOpenAICompatiblePrompt } from "@rowan-agent/context";

const prompt = buildOpenAICompatiblePrompt({
  context,
  tools,
});

await sendChatCompletion(prompt.messages);
```
