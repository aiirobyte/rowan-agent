---
status: accepted
---

# Pi-format session files and agent session id

Host applications (e.g. Mori) and local gateways (e.g. Magpie) link LLM sessions to agent transcript files by session id. Rowan previously sent no session id to providers and retained no transcript file in a standard format.

## Decision

- Adopt pi's append-only JSONL session file format (version 3) for Rowan agents.
- Session file persistence is opt-in via `AgentRuntimeOptions.sessionFiles = { dir }`. Absent = off.
- When enabled, `AgentRuntime.init` starts a durable consumer (`consumerId: "rowan:session-files"`) to persist session files deterministically per agent.
- The agent id is unconditionally passed as `sessionId` on `LlmRequest` and set as the `x-session-id` HTTP header on model requests before configured headers are applied.
