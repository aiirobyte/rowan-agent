# Rowan Agent 0.42.0 - OAuth model listing and Gemini-compatible protocol

OAuth configuration no longer names a flow, signed-in model catalogs are
available through one public helper, and Rowan can speak Gemini's native wire.

- **OAuth auth mode**: `AuthMode` is now `"none" | "oauth"`. An `"oauth"` model
  loads the credential for its provider id and uses `credential.flow` for
  refresh, headers, base URL, and protocol validation.
- **Codex guard**: `openai-codex-responses` requires `auth: "oauth"` and an
  `openai-codex` credential; another stored flow is `invalid_config`.
- **OAuth listing**: `listOAuthModels(providerId, store, options?)` refreshes
  and saves through the request path, then returns `{ id, name?,
  contextWindow? }[]` using the Codex, xAI, or Copilot picker rules.
- **Gemini protocol**: `gemini-compatible` posts to
  `/models/{model}:streamGenerateContent?alt=sse` with `x-goog-api-key`, and
  maps tools, thinking, usage, stop reasons, errors, retries, and thought
  signatures on both thinking and tool-call blocks.

Tool-call blocks now carry an optional provider signature through stream
collection, durable messages, model context, and session output.

## Packages

- `@rowan-agent/agent` 0.42.0
- `@rowan-agent/models` 0.15.0
