# Rowan Agent 0.20.0 / Models 0.9.0 — per-request provider options and turn contexts on the user message

## `providerOptions`: opaque per-request options for the Provider

`LlmRequest` gains `providerOptions?: JsonObject`. A host passes it on a user
turn the same way as `thinkingLevel`:

```ts
await runtime.start(agentId, {
  content: "hello",
  providerOptions: { mode: "read-only" },
}, { idempotencyKey });
```

The object is validated as JSON, stored with the Run input, and copied onto
every model request of that Run. Rowan never reads its contents.

## Turn-scoped Contexts move to the user message (ADR-0014)

`additionalContexts` are no longer rendered into the System Prompt. They are
stored on the Run's user `Message` as `contexts`, and each model request renders
them as a leading `<turn_context>…</turn_context>` text part of that message.
This keeps the System Prompt and the request prefix stable across turns.
Definition-selected `contexts` are unchanged.

- New public type field: `UserMessage.contexts?: readonly ContextCandidate[]`.
- Behaviour change: a turn's Contexts now stay visible to the model in later
  turns, as part of history.

## Packages

- `@rowan-agent/models` 0.9.0
- `@rowan-agent/agent` 0.20.0
- Other package versions unchanged
