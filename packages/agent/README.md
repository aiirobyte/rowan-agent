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
  loadPhases,
  loadSkills,
} from "@rowan-agent/agent";

const skills = await loadSkills("./.rowan/skills");
const phases = await loadPhases("./.rowan/phases");
const runtime = await AgentRuntime.init({
  store: new InMemoryStore(),
});

const agentId = await runtime.createAgent({
  identity: "example:v1", // Stable config snapshot identity, not the Agent ID
  model: {
    provider: "openai",
    id: "gpt-4o",
    protocol: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY!,
  },
  definition: {
    name: "workspace-assistant",
    description: "Assist with the current workspace.",
    prompt: "You are helpful.",
    contexts: ["workspace"],
  },
  resources: {
    tools: createCoreTools({ root: process.cwd() }),
    skills,
    contexts: [{
      name: "workspace",
      value: { root: process.cwd() },
    }],
    phases,
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

Programmatic Phases may use the execution-scoped
[`PhaseInteractionDriver`](./docs/phase-interactions.md) for durable typed
Interactions, suspension checkpoints, and cancellation.
This is a generic Rowan boundary; transport and Provider semantics remain in
the embedding host.

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

Tools are supplied as `AgentConfig.resources.tools`, selected by the
Definition, and persist through:

`pending → running → completed | failed | indeterminate`

When an external side effect cannot be confirmed, the Tool must become
`indeterminate`; the Run then fails and is never automatically retried.

While running, a Tool may call `context.reportProgress(progress)` with a
JSON-safe value. Progress is live-only and may be dropped.

## Events

`run.observe()` delivers `RunEvent` values for live presentation:

- transient `message_delta` and `tool_progress` events are live-only and
  best-effort;
- durable `message_committed`, `run_state_changed`, and `tool_state_changed`
  events are replayable;
- a durable `message_committed` event is the authoritative full content if a
  transient delta was coalesced or dropped.

`runtime.consume()` delivers only `DurableRunEvent` values:

- `message_committed`
- `run_state_changed`
- `tool_state_changed`

Durable events and their corresponding Run aggregate changes commit in one
Store transaction. Reliable consumers persist progress through cursors and
checkpoints; transient events never enter the Durable Store.

## Resources

`AgentRuntime` owns a Resource Registry. Register Agent Definitions, Tools,
Skills, and Phases under stable `sourceId` values, then select the sources for
an Agent through `resourceView`:

```ts
const runtime = await AgentRuntime.init({
  store: new InMemoryStore(),
  bootstrap: async (registry) => {
    await registry.loadExtensions({
      sourceId: "workspace.extensions",
      directory: "./extensions",
    });
  },
});

await runtime.loadAgents({
  sourceId: "workspace",
  values: [{
    name: "workspace-assistant",
    description: "Assist with the current workspace.",
    prompt: "You are helpful.",
  }],
});
await runtime.loadTools({
  sourceId: "workspace",
  values: createCoreTools({ root: process.cwd() }),
});

const agentId = await runtime.createAgent({
  identity: "workspace:v1",
  definition: { name: "workspace-assistant" },
  resourceView: {
    agents: ["workspace"],
    tools: ["workspace"],
    skills: [],
    phases: [],
  },
  model: {
    provider: "openai",
    id: "gpt-4o",
    protocol: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY!,
  },
});
```

Each `load*()` call replaces one source atomically; use `directory` or inline
`values`. `resourceView` controls visibility, so same-name resources can live
in isolated sources but collide when selected together. The built-in `route`
Tool and `default` Phase are always available and cannot be overridden.

Extensions are Runtime-global. Load them only during `AgentRuntime.init()` via
`bootstrap`; after initialization they are frozen until the Runtime closes.
Definition name lists narrow the selected Tools, Skills, and Phases: omission
inherits all candidates, `[]` selects none, and missing names are skipped. The
same rule applies to `definition.contexts`.

### Resources and Definition

`resources` and `definition` have different jobs:

- `resources` supplies the concrete candidates available to one Agent. Its
  Tools contain executable `execute()` functions; Skills and Phases contain
  their loaded content; Contexts contain JSON-safe values.
- `definition` declares which candidates this Agent uses. `tools`, `skills`,
  `contexts`, and `phases` are name-based selectors; they cannot create a
  resource that is absent from `resources`.

For a single-process embedding, provide concrete resources directly and omit
the selectors when the Agent should use everything:

```ts
const agentId = await runtime.createAgent({
  identity: "workspace:v1",
  definition: {
    name: "workspace-assistant",
    description: "Assist with the current workspace.",
    prompt: "You are helpful.",
  },
  resources: { tools, skills, contexts, phases },
  model,
});
```

Use selectors when several Agents share a candidate pool:

```ts
definition: {
  name: "read-only-assistant",
  description: "Inspect the workspace without changing it.",
  prompt: "You are helpful.",
  tools: ["read"],
  contexts: ["workspace"],
  phases: { entryPhaseId: "review", phaseIds: ["review"] },
}
```

For process-boundary persistence, use the Resource Registry form shown above:
`resourceView` stores stable source IDs instead of executable resource
closures, and the Runtime resolves those sources into an immutable
Configuration Snapshot. This lets a restarted Runtime resolve the same
resource revisions while keeping each Run pinned to the snapshot that created
it. Direct `resources` are simpler for embedding; `resourceView` is the
declarative form for shared, reloadable, and restart-resolvable resources.
