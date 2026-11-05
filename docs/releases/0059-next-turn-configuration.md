# Rowan Agent 0.45.0 - Configuration changes apply at the next user Turn

A Run no longer keeps its first Configuration Snapshot for life. Each user Turn
resolves a fresh one, so a change a host makes with `updateAgentConfig`,
`loadTools`, `loadSkills`, `loadPhases`, `loadAgents`, or `unload` reaches the
model at the next user message and is announced there. There is no new API, and
the cached System Prompt prefix is never rewritten, so provider prompt caches
survive a model switch, a Tool load, or an instruction change.

- **Turn**: one user turn. It begins when its user input is committed: a new
  Run's user message, an Agent Input reply to a Run waiting at a turn boundary,
  or an answer to that boundary's `user_input` Interaction through
  `respondInteraction`. Model rounds, retries, Tool calls, permission
  Interactions, Phase routes, and parallel Phases stay on the Turn's snapshot,
  and resume and restart recovery reuse it.
- **Configuration Notice**: when the latest configuration differs from what the
  context reflects, the Turn's user message carries
  `configuration: { token, digest, prefix?, notice? }` and is sent with a
  leading `<configuration_update>` text part. It lists Tools added, removed, and
  changed, Skills and Phases added and removed, and the new instructions. With no
  change nothing is added. The message `content` stays the user's own text, and
  hosts read the notice from `configuration.notice` on `message_committed`.
- **What the request carries**: the System Prompt is rendered from the Prefix
  Configuration, `model` and the stream come from the Turn's snapshot, and
  `tools` is the prefix Tools followed by added Tools. A removed Tool keeps its
  definition until compaction, and a call to it returns `Tool "x" was removed.`
- **Compaction rebuilds the prefix** from the snapshot of the Run that
  compacts. The System Prompt and `tools` are rebuilt, removed Tools leave the
  request, and the notices the summary covers leave the Model Context.
- **Phases**: a waiting Run resumes with the current Phase's prompt taken from
  the Turn's Phases. If that Phase was removed, the Turn starts at the new entry
  Phase, or the Phase-less entry Loop, and drops the continuation. A Control
  Phase Run with no input adds no Turn message, and one whose Phase is missing
  still fails.
- **Recovery**: an older snapshot that cannot be resolved or assembled resets
  the prefix for that Turn instead of failing the Run.
- **Session files**: a user entry starts with the notice text the model saw,
  and a model switch still writes `model_change`. Answering an interaction
  records no notice, because interactions are not written to session files.

`start_run` idempotency fingerprints no longer include the pinned token, so
retrying a `start` that carries `phasePayload` across this upgrade can report
`idempotency_conflict`.

## Packages

- `@rowan-agent/agent` 0.45.0
- `@rowan-agent/models` 0.16.0
