# Rowan Agent 0.14.2 — persist thinking in event order and deliver replies to open Interactions

A model response that ends in Tool Calls is committed as the assistant request message the Tool Results answer. That message was built from the reserved Tool Calls alone, so the thinking and text the model emitted before them were dropped. Every real Tool-Call message in a durable history was `[tool_use]` only.

The request message now carries the response's content blocks in the order the provider streamed them, with each Tool Call converted to its durable `tool_use` part. The next model request replays thinking, text and Tool Calls in that same order.

All built in streaming providers share one `ContentBlockAccumulator` as the single owner of block assembly; providers no longer keep a parallel copy of the same blocks. `openai-completions` and `openai-responses` also stop rebuilding partial blocks in a fixed type order, so reasoning that arrives after text keeps its place.

A new message sent while a Run waits on an open Interaction now records that message as the Interaction's reply instead of dropping the answer. A Tool Call that was waiting for approval receives the reply on re-entry, so the host can refuse it at once and the Run continues with the new message. When a Run failure cannot be committed, the Run is cancelled instead of being left running.

## Packages

- `@rowan-agent/agent` 0.14.2
- `@rowan-agent/models` 0.7.1
- Other package versions unchanged
