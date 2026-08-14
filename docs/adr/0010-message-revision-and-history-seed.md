---
status: accepted
---

# Version active Messages and seed independent Agent history

Canonical Messages remain durable runtime facts, but the active conversation
projection needs a stable identity that can be revised. A host Fork needs
copied context, not a source graph. This decision adds both capabilities
without teaching Rowan host-specific Conversation or branch concepts.

## Decisions

- A Message has a stable ID and a monotonic `messageRevision`. A revision
  appends an immutable `message_revised` fact and replaces only the active
  projection. The old value is retained until the store's retention policy
  removes it.
- `AgentRuntime.revise` is one atomic Store operation: expected-revision CAS,
  suffix fencing, effect-digest confirmation, pinned-config lookup, and one
  replacement Run reservation. The operation is idempotent by its caller
  operation key.
- Every execution write carries the revision/execution fence. A stale attempt
  cannot append Messages, Tool results, or terminal events after a revision.
- Tool definitions do not gain a read-only flag in this change. A Tool Call
  touched by the invalid suffix is treated as potentially effectful; running
  calls are stopped and uncertain calls are indeterminate.
- Agent creation may receive a validated active history seed. Rowan allocates
  fresh Message identities and copies values by value. It stores no source
  Agent ID, lineage, through-message, refcount, or lifecycle relation.
- A history seed never creates a Run. The host decides when to call `start()`.
- The new schema is a destructive cutover from unsupported old data; no
  migration or compatibility read path is maintained.

## Consequences

Runtime readers can keep stable keys and use one active-history interface after
an edit. Store adapters must maintain a revision projection and a cleanup
floor. Forked Agents consume additional storage, but their lifecycle and
deletion are independent and therefore cannot be corrupted by source changes.

## Rejected options

- New Message IDs for edits: rejected because identity churn leaks into UI and
  breaks stable event consumers.
- Parent pointers for history seeds: rejected because they couple deletion,
  retention, and replay across unrelated Agents.
- Copying Runs or Checkpoints: rejected because execution state is fenced and
  belongs to the source Agent only.
- Silent current-config fallback: rejected because reruns would not be
  reproducible.
