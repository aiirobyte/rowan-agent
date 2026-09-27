# Rowan Agent 0.11.1 — surface in-stream provider errors

## Fix

**OpenAI-compatible streams report in-stream error chunks**
An OpenAI-compatible gateway can accept a streaming request with HTTP 200 and then send its failure as a chunk such as `data: {"error":{"message":"..."}}` (quota, rate limit, upstream failure). The completions provider skipped chunks without `choices`, so the Run failed with the misleading `Model returned an empty response.` The provider now raises a `ProviderError` (`code: "stream_error"`) carrying the gateway's message, which reaches the host as the Run failure.

## Packages

- `@rowan-agent/models` 0.6.8
- `@rowan-agent/agent` 0.11.1

## Compatibility

No API change.
