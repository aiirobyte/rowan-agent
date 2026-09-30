# Rowan Agent 0.14.2 — persist thinking in committed messages in event order

A model response that ends in Tool Calls is committed as the assistant request message the Tool Results answer. That message was built from the reserved Tool Calls alone, so the thinking and text the model emitted before them were dropped. Every real Tool-Call message in a durable history was `[tool_use]` only.

The request message now carries the response's content blocks in the order the provider streamed them, with each Tool Call converted to its durable `tool_use` part. The next model request replays thinking, text and Tool Calls in that same order.

All built in streaming providers share one `ContentBlockAccumulator` as the single owner of block assembly; providers no longer keep a parallel copy of the same blocks. `openai-completions` and `openai-responses` also stop rebuilding partial blocks in a fixed type order, so reasoning that arrives after text keeps its place.

## Packages

- `@rowan-agent/agent` 0.14.2
- `@rowan-agent/models` 0.7.1
- Other package versions unchanged
