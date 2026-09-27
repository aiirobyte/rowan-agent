# Rowan Agent 0.12.0 — provider protocols aligned with the current official APIs

## In-stream failures, every protocol

A provider that fails after HTTP 200 now fails the Run with its own message instead of `Model returned an empty response.`: Anthropic `error` events, Responses `error` / `response.failed` events, gateway `{ "error": ... }` chunks, and a 200 Chat Completions error body.

## Anthropic Messages

- Claude 4.6+ and Claude 5 models use adaptive thinking (`thinking: { type: "adaptive", display: "summarized" }`) with `output_config.effort` mapped from the thinking level; earlier and unknown models keep `budget_tokens`.
- Thinking signatures (`signature_delta`) and `redacted_thinking` are captured and replayed, in stream order, so thinking survives tool-use turns. Blocks signed by another provider are not sent.
- `tool_choice` is sent; tool `input_schema` passes the full JSON Schema through.
- Sampling parameters are omitted when thinking is on and on models that removed them.
- Stop reasons `refusal` and `model_context_window_exceeded` are mapped; cache read/write tokens are reported.

## OpenAI Chat Completions

- `max_completion_tokens` replaces the deprecated `max_tokens`.
- `reasoning_effort` uses the official values (`max` maps to `xhigh`).
- `tool_choice` is sent; cached prompt tokens are reported.

## OpenAI Responses

- Requests are stateless (`store: false`) and include `reasoning.encrypted_content`; reasoning items are replayed ahead of the next turn's output.
- `tool_choice` is sent; a turn with function calls reports `tool_use`; `max_output_tokens` and `content_filter` cut-offs map to `max_tokens` and `error`; cached input tokens are reported.

## Packages

- `@rowan-agent/models` 0.7.0
- `@rowan-agent/agent` 0.12.0

## Compatibility

No API change. `ThinkingBlock` gains an optional `signature`. Behavior changes: an OpenAI-compatible gateway that only understands `max_tokens` no longer receives an output cap, and Responses requests are no longer stored server-side.
