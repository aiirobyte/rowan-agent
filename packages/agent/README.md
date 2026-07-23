# @rowan-agent/agent

Durable Agent Runtime. The public interface consists of `AgentRuntime`, Durable
Stores, Config Providers, Run handles, and Run Events. An Agent is a persistent
identity, not a process-local Session object.

## Quick start

```ts
import {
  AgentRuntime,
  createCoreTools,
  InMemoryStore,
} from "@rowan-agent/agent";

const runtime = await AgentRuntime.init({
  store: new InMemoryStore(),
});

const agentId = await runtime.createAgent({
  identity: "example:v1", // Stable config snapshot identity, not the Agent ID
  model: { provider: "openai", id: "gpt-4o" },
  stream,
  context: {
    systemPrompt: "You are helpful.",
    tools: createCoreTools({ root: process.cwd() }),
    skills: [],
  },
});

const run = await runtime.start(agentId, "Summarize the workspace.", {
  idempotencyKey: "run-example", // One Agent can have multiple independent Runs
});
const observing = (async () => {
  for await (const event of run.observe()) {
    if (event.kind === "message_delta") process.stdout.write(event.text);
  }
})();
const boundary = await run.wait();
await observing;
await runtime.close();
```

## Public lifecycle

1. `AgentRuntime.init({ store })` opens a Runtime Owner with an in-memory Config Provider by default. Pass `configs` when configuration must survive process boundaries.
2. `createAgent()` creates a persistent Agent identity and binds a configuration snapshot.
3. `start()` creates a queued Run; `run(runId)` returns a stateless Run handle.
4. `observe()` follows display-oriented `RunEvent` values; `wait()` waits for an authoritative boundary.
5. `respond()` continues an `input_required` Run; `cancel()` terminates an unfinished Run.
6. `close()` seals the Owner and releases the Store.

`AgentRuntime` does not expose process-local Agents, Sessions, Bindings,
Mailboxes, or compatibility factories. The Durable Store is the source of truth;
Run handles do not hold business state.

## Stores

- `InMemoryStore`: tests and single-process embedding.
- `SqliteStore`: local persistence; the database is initialized on the first `openOwner()`.
- `InMemoryConfigProvider`: tests and embeddings without an external config service.

The Runtime generates an idempotency key for ordinary Agent creation. Callers
that need to retry the same creation after an unknown result pass a stable
`idempotencyKey` explicitly. Other write commands retain their documented
idempotency identities. The Store provides atomicity for Runs, events, Tool
lifecycles, and Owner fencing.

## Tool lifecycle

Tools are supplied through `AgentConfig.context.tools` and persist through:

`pending → running → completed | failed | indeterminate`

When an external side effect cannot be confirmed, the Tool must become
`indeterminate`; the Run then fails and is never automatically retried.

While running, a Tool may call `context.reportProgress(progress)` with a
JSON-safe value. Progress is live-only and may be dropped.

## Events

`run.observe()` delivers `RunEvent` values for live presentation:

- transient `message_delta` and `tool_progress` events are live-only and
  best-effort;
- durable `message_committed`, `run_transitioned`, and `tool_state_changed`
  events are replayable;
- a durable `message_committed` event is the authoritative full content if a
  transient delta was coalesced or dropped.

`runtime.consume()` delivers only `DurableRunEvent` values:

- `message_committed`
- `run_transitioned`
- `tool_state_changed`

Durable events and their corresponding Run aggregate changes commit in one
Store transaction. Reliable consumers persist progress through cursors and
checkpoints; transient events never enter the Durable Store.

## Resources

`loadSkills()`, `loadPhases()`, and `loadExtensions()` load workspace resources.
Pass the resulting resources through `AgentConfig.context` or `extensions`.
