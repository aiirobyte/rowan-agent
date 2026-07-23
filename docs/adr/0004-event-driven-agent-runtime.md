---
status: accepted
---

# Make the Durable Store authoritative for event-driven Agent execution

Rowan replaces process-local Agent Bindings, Sessions, Runtime Messages, Mailboxes, and per-Run Leases with durable Agent identities and Store-authoritative FIFO Agent Runs. A Run executes as fenced one-shot Execution Attempts, may cross durable Input Request boundaries without retaining a continuation, and is observed through replayable Run Events and stable snapshots. This supersedes ADR-0001 and ADR-0002.

The Runtime remains the only mutation owner of one Durable Store, but ownership
is a renewable Store lease rather than a process-local singleton. Expired
takeover atomically fences the previous owner, marks its pending Tool Calls
determinate failed and running Tool Calls indeterminate, fails its running Runs,
and installs a monotonically newer ownership epoch. Every claim also creates a
distinct execution token so an earlier attempt cannot commit into a later
attempt under the same owner.

Agent Configuration remains host-supplied executable code and carries an
explicit stable identity because Rowan cannot compare closures. The Runtime
stores only immutable configuration tokens; a Config Provider must resolve
those tokens after restart. New, never-started Runs use the Agent's current
configuration, while a Run that creates an Input Request remains pinned to the
Configuration Snapshot that produced its checkpoint until terminal. This
deliberately prefers resumability and a race-free answer contract over applying
the latest configuration mid-Run.

Queued Agent Input is durable Run data rather than canonical conversation history. It becomes a Canonical Message only when the Run first starts, so cancelling never-executed work cannot inject instructions into later Model Context. Model Context is an execution-local projection over immutable Canonical Messages; compaction and Phase-local prompts never rewrite canonical history.

## Consequences

- The public execution interface is `AgentRuntime`, `AgentRun`, JSON-safe user input, snapshots, Run boundaries, and Run Events; public `Agent`, Binding, Reconstruction, Session, Mailbox, and Runtime Message concepts are removed.
- `start()` always appends a new FIFO Run, including while the Agent waits for input; only `respond(requestId, input)` answers the open Input Request.
- Input Request ID is the answer idempotency identity. Run creation uses an
  explicit idempotency key. Agent creation generates a unique key when omitted;
  callers pass a stable key explicitly only when retries must reconcile an
  unknown result to the same Agent.
- An incompatible retained checkpoint never blocks Store initialization. Its
  Run stays observable and cancellable; answer or scheduling handles the
  incompatibility locally.
- Tool result state, its model-visible Message, and related events commit atomically. Ambiguous Tool failures become indeterminate and terminal rather than retryable.
- Every semantic Store write has a stable replay identity. A success-unknown
  write is reconciled without allocating new IDs or repeating model, Tool, or
  Provider effects.
- Reliable consumers are at-least-once. Agent-to-Agent routers must make stable routing decisions and use target `start()` idempotency rather than relying on atomic consumer acknowledgement plus enqueue.
- Memory and SQLite remain the two Durable Store adapters and must pass the same state, concurrency, crash, ownership, event, and schema contract tests.
- Existing Runtime schema and Session data are not migrated. A non-empty unsupported Store is rejected before any schema write.
