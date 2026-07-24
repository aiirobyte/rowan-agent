# Event-driven Agent Runtime

Status: Accepted

Decision: [ADR-0004](../adr/0004-event-driven-agent-runtime.md)

Supersedes: [PRD-0001](./0001-durable-agent-runtime.md)

## Outcome

Rowan exposes one durable execution path for:

- host input to an Agent;
- Agent-to-Agent delivery through reliable events;
- input requests and answers;
- Run state observation and replay;
- Agent configuration creation and updates;
- Runtime restart, ownership takeover, and state discovery.

Rowan owns execution identity, ordering, persistence, recovery, and delivery. It does not know host Project, Task, Workflow, hierarchy, routing, or business cancellation models.

This is a breaking, from-scratch Runtime:

- no compatibility facade;
- no old Runtime data migration;
- no `node_modules` changes;
- no EverYield Project Agent recovery layer;
- no public process-local `Agent`, Binding, Reconstruction, Session, Mailbox, Runtime Message, or per-Run Lease.

## Design invariants

1. Durable Store state is authoritative. In-memory queues and notifications only accelerate work.
2. One Durable Store has at most one unexpired Runtime Owner.
3. Every Execution Attempt has a unique fencing token distinct from Run revision and owner epoch.
4. One Agent has at most one `running` or `input_required` Run.
5. Agent Runs are immutable FIFO positions ordered by `agentSequence`.
6. A queued Run's input is durable but is not a Canonical Message until that Run first starts.
7. Canonical Messages are immutable and ordered by `(agentSequence, sequenceWithinRun)`.
8. A Run waiting for input remains pinned to the Configuration Snapshot that produced its checkpoint until terminal.
9. Every Run aggregate mutation and all related Durable Run Events commit in one Store transaction.
10. Transient Run Events never control execution or recovery.
11. A Tool Call with an ambiguous external effect is `indeterminate`, makes the Run terminal, and is never automatically retried.
12. Terminal Run states have no outgoing transitions.

## JSON-safe values

All durable caller-owned values use the following logical data model:

```ts
type JsonPrimitive = null | boolean | number | string;

type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type JsonObject = Readonly<Record<string, JsonValue>>;
type Metadata = JsonObject;
```

Opaque identities are branded strings:

```ts
declare const opaqueIdBrand: unique symbol;

type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

type AgentId = OpaqueId<"AgentId">;
type RunId = OpaqueId<"RunId">;
type MessageId = OpaqueId<"MessageId">;
type InputRequestId = OpaqueId<"InputRequestId">;
type ToolCallId = OpaqueId<"ToolCallId">;
type EventId = OpaqueId<"EventId">;
type ExecutionId = OpaqueId<"ExecutionId">;
type OutcomeId = OpaqueId<"OutcomeId">;
type ConfigToken = OpaqueId<"ConfigToken">;
type EventCursor = OpaqueId<"EventCursor">;
type AgentListCursor = OpaqueId<"AgentListCursor">;
type RunListCursor = OpaqueId<"RunListCursor">;
```

Rowan generates Agent, Run, Message, Input Request, Tool Call, Event,
Execution, and Outcome IDs. Config Provider issues raw Config Token strings
that Runtime validates and brands internally; Store adapters encode cursors.
Callers generate Consumer IDs and the idempotency keys whose retries must
survive an unknown result. Runtime generates a unique key for ordinary Agent
creation when the caller omits one.

Runtime-owned durable content does not reuse the legacy provider DTOs:

```ts
type TextContent = Readonly<{
  type: "text";
  text: string;
}>;

type ImageContent = Readonly<{
  type: "image";
  data: string;
  mimeType: string;
}>;

type ThinkingContent = Readonly<{
  type: "thinking";
  thinking: string;
  signature?: string;
}>;

type ToolUseContent = Readonly<{
  type: "tool_use";
  toolCallId: ToolCallId;
  name: string;
  input: JsonValue;
}>;

type ToolExecutionResult =
  | Readonly<{
      ok: true;
      content: JsonValue;
    }>
  | Readonly<{
      ok: false;
      content: JsonValue;
      error: string;
    }>;

type DurableToolResult = Readonly<{
  toolCallId: ToolCallId;
  toolName: string;
}> & ToolExecutionResult;

type ToolResultContent = Readonly<{
  type: "tool_result";
  toolCallId: ToolCallId;
  result: ToolExecutionResult;
}>;

type UserContent =
  | string
  | readonly (TextContent | ImageContent)[];

type AssistantContent =
  | string
  | readonly (TextContent | ThinkingContent | ToolUseContent)[];

type ToolMessageContent = readonly [
  ToolResultContent,
  ...ToolResultContent[],
];

type MessageContent =
  | UserContent
  | AssistantContent
  | ToolMessageContent;

type Outcome = Readonly<{
  id: OutcomeId;
  message: string;
  payload?: JsonValue;
  toolResults?: readonly DurableToolResult[];
}>;
```

Runtime validation accepts only:

- `null`, booleans, strings, and finite numbers;
- dense arrays;
- plain objects with data properties;
- recursively JSON-safe values.

Runtime validation rejects:

- `undefined`, functions, symbols, BigInt, and non-finite numbers;
- sparse arrays and cycles;
- accessors, custom prototypes, `toJSON`, Date, Map, Set, typed arrays, and class instances.

Canonical comparison recursively sorts object keys. String input is normalized to the object form before comparison.

First-release limits are part of the Store contract and apply equally to Memory and SQLite adapters:

```text
idempotency key:       256 UTF-8 bytes
Consumer ID:           256 UTF-8 bytes
Config identity:       256 UTF-8 bytes
Config Token:        1,024 UTF-8 bytes
one metadata object:    64 KiB encoded JSON
one Message content:    16 MiB encoded JSON
one checkpoint:          4 MiB encoded JSON
Tool args/result:       16 MiB encoded JSON each
Outcome/failure:         4 MiB encoded JSON
```

Public command-input limit violations return `invalid_argument` before the
command's semantic write. Invalid model, Tool, hook, or Provider output follows
its execution/configuration failure contract below; it is never reported as a
caller argument error.

## Core domain

### Agent

An Agent is a durable identity, not a process-local object:

```ts
type AgentRecord = {
  id: AgentId;
  metadata?: Metadata;
  currentConfigToken?: ConfigToken;
  createdAt: string;
  activatedAt?: string;
  updatedAt: string;
};
```

`currentConfigToken` is absent only while Agent creation is being provisioned. Provisioning is internal and never returned as a usable Agent.
`activatedAt` is written in the same transaction that first installs
`currentConfigToken`; it is absent while provisioning and immutable afterward.

Agent metadata is immutable. Rowan may pass it to Config Provider methods but never interprets it.

### Run

```ts
type RunState =
  | "queued"
  | "running"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";
```

A Run has:

- an immutable `agentSequence`, allocated from the Agent record;
- a mutable Store-global `readySequence`, allocated each time it enters `queued`;
- a monotonic `revision`;
- immutable Run metadata;
- durable pending input until its first execution;
- an optional pinned Config Token and Execution Checkpoint;
- exactly one terminal result when terminal.

The Scheduler uses `agentSequence` for per-Agent FIFO. Across Agents it uses `readySequence` as best-effort fairness; concurrent Config resolution means Rowan does not promise strict cross-Agent start or completion order.

### Message

```ts
type MessageBase = Readonly<{
  id: MessageId;
  agentId: AgentId;
  runId: RunId;
  metadata?: Metadata;
  sequenceWithinRun: number;
  createdAt: string;
}>;

type UserMessage = MessageBase & Readonly<{
  role: "user";
  content: UserContent;
}>;

type AssistantMessage = MessageBase & Readonly<{
  role: "assistant";
  content: AssistantContent;
}>;

type ToolMessage = MessageBase & Readonly<{
  role: "tool";
  content: ToolMessageContent;
}>;

type Message = UserMessage | AssistantMessage | ToolMessage;
```

IDs, timestamps, roles, provenance, and ordering are Rowan-owned. Public input cannot choose a Message role.

When executing Run N, Model Context can be projected from:

- all Canonical Messages whose Run has `agentSequence < N`;
- Canonical Messages already committed by Run N;
- Messages from earlier failed or cancelled Runs that actually started;
- execution-local Phase prompts and compaction state.

It never includes input from a future Run that has not started. Cancelling a never-started Run leaves no Canonical Message.

Canonical history is append-only. Compaction, Phase-local prompts, and model-specific normalization belong to an execution-local Model Context projection and never delete, reorder, or replace Canonical Messages.

### Input Request and checkpoint

```ts
type InputRequest = Readonly<{
  id: InputRequestId;
  phase: string;
  messageId: MessageId;
  createdAt: string;
}>;

type ExecutionCheckpoint = Readonly<{
  codec: string;
  version: number;
  data: JsonValue;
}>;
```

The prompt exists once as an `AssistantMessage` in Canonical History.
`InputRequest.messageId` must reference that Message from the same Agent and
Run. `InputRequest.phase` is the non-empty Phase ID that requested input; it is
durable request provenance rather than prompt text or Message metadata. Input
Request history is retained with:

- open, answered, or cancelled state;
- requesting Phase ID;
- prompt Message ID;
- optional answer Message ID;
- canonical answer bytes for idempotent replay;
- timestamps.

At most one Input Request is open for one Run.

Checkpoint compatibility is local to the affected Run; it never prevents the
Runtime from opening the Store. An incompatible `input_required` Run remains
observable and cancellable, while `respond()` rejects before committing an
answer. An already-answered `queued` Run whose pinned checkpoint is
incompatible is durably failed by the Scheduler.

### Execution Attempt

Every successful claim produces:

```ts
type ExecutionToken = Readonly<{
  runId: RunId;
  ownerEpoch: number;
  executionId: ExecutionId;
}>;
```

The token is required for every execution-originated write:

- Message commit;
- Tool state change;
- Input Request commit;
- Outcome or Run Failure commit.

Leaving `running` invalidates the token. A later attempt always receives a different `executionId`, even under the same Runtime Owner epoch.

### Agent Configuration shape

Agent Configuration contains executable definitions and is not JSON data:

```ts
import Type from "typebox";

type ToolInvocationContext = Readonly<{
  agentId: AgentId;
  runId: RunId;
  toolCallId: ToolCallId;
  reportProgress(progress: JsonValue): void;
}>;

type Tool = Readonly<{
  name: string;
  description: string;
  parameters: Type.TSchema;
  execute(
    args: JsonValue,
    context: ToolInvocationContext,
    signal: AbortSignal,
  ): Promise<ToolExecutionResult>;
}>;

type BeforeToolCall = (input: Readonly<{
  tool: Tool;
  args: JsonValue;
  context: ToolInvocationContext;
  signal: AbortSignal;
}>) =>
  | Readonly<{ allow: true }>
  | Readonly<{ allow: false; reason: string }>
  | Promise<
      | Readonly<{ allow: true }>
      | Readonly<{ allow: false; reason: string }>
    >;

type AfterToolCall = (input: Readonly<{
  tool: Tool;
  result: ToolExecutionResult;
  context: ToolInvocationContext;
  signal: AbortSignal;
}>) => ToolExecutionResult | Promise<ToolExecutionResult>;

type AgentDefinitionContext = Readonly<{
  systemPrompt: string;
  tools: readonly Tool[];
  skills: readonly Skill[];
  phases?: PhaseRegistry;
}>;

type AgentCommonConfig = Readonly<{
  identity: string;
  context: AgentDefinitionContext;
  cwd?: string;
  extensions?: readonly LoadedExtension[];
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
}>;

type AgentModelConfig =
  | {
      model: ModelConfig;
      stream?: never;
    }
  | {
      model: ModelRef;
      stream: StreamFn;
    };

type AgentConfig = Readonly<AgentCommonConfig & AgentModelConfig>;
```

It never contains canonical Messages, Session identity or state, caller AbortSignal, Runtime ports, emitters, or persistence callbacks. Config Provider owns secure storage or reconstruction of executable values; Durable Store persists only opaque Config Tokens.

`Tool.parameters` preserves Rowan's existing TypeBox `Type.TSchema` contract;
Agent Configuration is executable process data, not a durable `JsonValue`.
Runtime validates that the schema compiles and has a JSON-safe
provider-projectable representation before the first model request. Model
arguments, Tool results, and all persisted Tool DTOs still use the strict
`JsonValue` contract above.

`identity` is a stable, non-empty host-defined identifier, at most 256 UTF-8
bytes. It must stay equal for semantically identical executable
configuration and change whenever model behavior, prompts, Tools, Skills,
Phases, hooks, extensions, or checkpoint compatibility changes. Rowan cannot
compare JavaScript closures, so this identity is the explicit idempotency
contract between the host and Config Provider.

## Public interface

```ts
class AgentRuntime {
  static init(options: {
    store: DurableStore;
    configs: ConfigProvider;
    concurrency?: number; // default 10
  }): Promise<AgentRuntime>;

  createAgent(
    input: {
      config: AgentConfig;
      metadata?: Metadata;
    },
    options?: {
      idempotencyKey?: string;
    },
  ): Promise<AgentId>;

  updateAgentConfig(
    agentId: AgentId,
    config: AgentConfig,
    options: {
      idempotencyKey: string;
    },
  ): Promise<void>;

  start(
    agentId: AgentId,
    input: UserInput,
    options: {
      idempotencyKey: string;
      metadata?: Metadata;
    },
  ): Promise<AgentRun>;

  run(runId: RunId): AgentRun;

  listAgents(input?: {
    after?: AgentListCursor;
    limit?: number;
  }): Promise<Page<AgentSummary, AgentListCursor>>;

  listRuns(input?: {
    agentId?: AgentId;
    states?: readonly RunState[];
    after?: RunListCursor;
    limit?: number;
  }): Promise<Page<RunSummary, RunListCursor>>;

  consume(input: {
    consumerId: string;
    signal: AbortSignal;
    onEvent(
      event: DurableRunEvent,
      context: Readonly<{ signal: AbortSignal }>,
    ): void | Promise<void>;
  }): Promise<DurableConsumer>;

  close(): Promise<void>;
}
```

```ts
type UserInput =
  | string
  | Readonly<{
      content: UserContent;
      metadata?: Metadata;
    }>;

type Page<T, C> = Readonly<{
  items: readonly T[];
  next?: C;
}>;

type AgentSummary = Readonly<{
  id: AgentId;
  metadata?: Metadata;
  createdAt: string;
  activatedAt: string;
  updatedAt: string;
}>;

type RunSummary = Readonly<{
  id: RunId;
  agentId: AgentId;
  agentSequence: number;
  state: RunState;
  metadata?: Metadata;
  createdAt: string;
  updatedAt: string;
}>;

type DurableConsumer = Readonly<{
  caughtUp: Promise<void>;
  done: Promise<void>;
}>;
```

Agent, Run, and Event cursors are different opaque types. List order is stable:

- active Agents by `activatedAt, agentId`;
- Runs by `createdAt, runId`.

Each list cursor is bound to the Store incarnation, collection, normalized
filter, and last sort key. Reusing it with another collection, Store, or filter
returns `invalid_cursor`. Pagination is a live keyset view rather than a
historical snapshot: rows committed after a page may appear on later pages if
their sort key follows the cursor. `limit` is not part of the filter and may
change between pages.

Because Run state is mutable, a Run that enters a requested `states` filter
after its sort key has passed the cursor is not guaranteed to appear in that
pagination walk. Consumers that require an exhaustive changing view start a
new walk or consume Durable Run Events.

Using activation time prevents an Agent reserved before a cursor but activated
after it from being skipped. The first release accepts list limits from 1
through 1,000 and defaults to 100.

`runtime.run(runId)` synchronously creates an immutable, stateless handle and does no Store I/O. The first I/O operation returns `run_not_found` when necessary.

### AgentRun

```ts
class AgentRun {
  readonly id: RunId;

  snapshot(): Promise<RunSnapshot>;

  observe(options?: {
    after?: EventCursor;
    signal?: AbortSignal;
  }): AsyncIterable<RunEvent>;

  wait(options?: {
    signal?: AbortSignal;
  }): Promise<RunBoundary>;

  respond(input: {
    requestId: InputRequestId;
    input: UserInput;
  }): Promise<void>;

  cancel(reason?: string): Promise<RunBoundary>;
}
```

No execution checkpoint, Config Token, owner token, or execution token appears
in caller commands or read models. The injected Config Provider necessarily
receives its own tokens.

## Agent configuration

Callers create and update configuration only through `AgentRuntime`. `ConfigProvider` is an injected adapter seam:

```ts
type ConfigResolution =
  | Readonly<{
      kind: "available";
      config: AgentConfig;
    }>
  | Readonly<{
      kind: "deferred";
      retryAfterMs?: number;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: string;
    }>;

type ConfigPutResult =
  | Readonly<{
      kind: "stored";
      token: string;
    }>
  | Readonly<{
      kind: "identity_conflict";
    }>;

interface ConfigProvider {
  put(input: {
    agentId: AgentId;
    agentMetadata?: Metadata;
    config: AgentConfig;
    operationId: string;
    signal: AbortSignal;
  }): Promise<ConfigPutResult>;

  resolve(input: {
    agentId: AgentId;
    agentMetadata?: Metadata;
    token: ConfigToken;
    signal: AbortSignal;
  }): Promise<ConfigResolution>;
}
```

Provider requirements:

- `ConfigToken` is immutable and resolvable after process restart.
- Runtime validates an issued token as a non-empty string within the stated
  byte limit before any Store write that persists or references that token;
  tokens are durable locators, not embedded secrets;
- `put()` is idempotent by `operationId`, compares `config.identity`, and
  returns `stored` with the same raw token after response loss; a different
  identity for the same operation returns `identity_conflict`, which Runtime
  maps to `idempotency_conflict`;
- `available` resolves the requested token and its returned
  `config.identity` must match the immutable identity recorded for that token;
- every issued token remains retained in the first release; there is no token
  GC protocol;
- returned Agent Configuration is an immutable execution snapshot;
- `deferred` means retry without changing Run state;
- `retryAfterMs`, when present, is a finite non-negative integer and Runtime
  clamps it to its retry cap;
- `unavailable` means resolution cannot succeed without external repair.

A first-release Runtime gives every `put()` and `resolve()` call a 30-second
deadline through its signal; it never waits for an uncooperative Provider
before closing.

A Provider rejection, timeout, malformed response, or invalid retry hint is
treated as transient unavailability. A command rejects
`configuration_unavailable` without activating a provisioned Agent, changing
the current Config Token, or answering an Input Request; an Agent creation
reservation may remain for retry. Scheduler resolution behaves as `deferred`.
A Provider-originated `AbortError` is also transient.
Runtime close or ownership loss aborts Provider work but maps to
`runtime_closed` or `runtime_ownership_lost`; a Scheduler attempt simply stops
without mutating its Run. Only a caller-supplied public AbortSignal is exposed
as `AbortError`.

Runtime namespaces Provider operation IDs by Store incarnation, operation kind,
Agent ID, and the caller-provided or Runtime-generated idempotency key. Provider
calls may leave an unreferenced token after a fenced or failed Store commit;
such a token is harmless and remains retained in the first release.

Command idempotency scopes are exact and disjoint within one Store
incarnation:

```text
createAgent:       ("create_agent", idempotencyKey)
updateAgentConfig: ("update_agent_config", agentId, idempotencyKey)
start:             ("start_run", agentId, idempotencyKey)
```

The Store incarnation is part of every encoded scope. A key may therefore be
reused for another operation kind or another Agent without collision, but
never for a different canonical request in the same scope.

Agent creation uses recoverable provisioning:

1. Store looks up the key and canonical request. A completed record returns its
   Agent ID without Provider access; a conflict rejects; an absent request
   reserves one Agent ID, while an existing provisioning request resumes it.
2. Only an unfinished provisioning request calls `configs.put()` with that
   Agent ID and the same namespaced operation ID.
3. Provider returns `stored` with the same raw token or
   `identity_conflict`; Runtime validates and internally brands a stored token.
4. Store atomically activates the Agent with that token, or verifies that the completed record already references it.
5. A retry with the same creation key resumes or returns the same Agent.

When `createAgent()` omits the key, Runtime generates a fresh key before the
first Store write. That call remains internally replayable, but another caller
invocation generates a new key and represents a new Agent creation. A caller
that must retry across an unknown result supplies and preserves a stable key
before the first invocation.

Creation idempotency compares canonical Agent metadata and
`config.identity`. Once Agent creation has completed, replay returns the
original Agent ID and does not update its configuration. Configuration changes
use `updateAgentConfig()`. Provisioning rows are excluded from `listAgents()`;
`start()` treats their IDs as `agent_not_found`.

Configuration update:

1. looks up the key and Config identity; a completed update returns without
   Provider access and a conflict rejects;
2. for an unfinished update, verifies the Agent and obtains immutable Agent
   metadata;
3. calls `configs.put()` with the same namespaced update operation ID outside a Store transaction;
4. atomically compares any existing update idempotency record with the returned token;
5. swaps `currentConfigToken` and records successful idempotency, or returns
   the prior success without changing the current token;
6. may leave an unreferenced Provider token if Store commit fails, but never partially changes Agent behavior.

Distinct concurrent updates are last-Store-commit-wins. Replaying an older
successful update returns success but never restores its token over a newer
committed update.

Configuration selection:

- a never-started queued Run resolves the Agent's current Config Token;
- claim CAS verifies that the Agent token has not changed since resolution;
- an active Execution Attempt keeps its resolved Configuration Snapshot;
- an input-waiting Run pins that attempt's Config Token until terminal;
- updating an Agent does not change a pinned Run.

For a queued Run, `deferred` leaves it queued and schedules retry;
`unavailable` commits a durable `configuration_unavailable` failure. Provider
exceptions and invalid responses are transient and therefore do not
permanently fail a Run.

Every Scheduler transition based on an out-of-transaction Config resolution rechecks the
Owner lease, `queued` state, expected Run revision, and per-Agent FIFO-head
predicate. For an unpinned Run, both claim and `queued → failed` also CAS the
Agent's current Config Token; for a pinned Run they CAS the Run's pinned token
and checkpoint header. A concurrent configuration update or Run change makes
the attempt a no-op and triggers fresh resolution, so a stale `unavailable`
result cannot fail work that now has another configuration.

This is the final resolution of the former latest-config/checkpoint race.

## Run state machine

Allowed transitions:

```text
nonexistent
  └─ start ───────────────→ queued

queued
  ├─ claim ───────────────→ running
  ├─ unusable config/checkpoint → failed
  └─ cancel ──────────────→ cancelled

running
  ├─ request input ───────→ input_required
  ├─ complete ────────────→ completed
  ├─ execution failure ──→ failed
  ├─ close/takeover ─────→ failed
  ├─ cancel, no open running Tool → cancelled
  └─ cancel, open running Tool ───→ failed(tool_indeterminate)

input_required
  ├─ respond ─────────────→ queued
  └─ cancel ──────────────→ cancelled

completed | failed | cancelled
  └─ no outgoing transition
```

Required invariants:

```text
completed      <=> successful Outcome exists
failed         <=> Run Failure exists
cancelled      <=> cancellation record exists
input_required <=> exactly one open Input Request exists
running        <=> one current Execution Token exists
terminal       => no current Execution Token or open Input Request
```

A queued Run is claimable only when no smaller nonterminal `agentSequence` exists for the same Agent.

### start()

`start()`:

- validates and canonicalizes input before Store access;
- performs idempotency lookup before other mutable state checks;
- creates a Run with pending input, immutable metadata, `agentSequence`, and `readySequence`;
- does not create a Canonical Message;
- accepts new Runs while the Agent is `running` or `input_required`;
- never answers an Input Request.

Idempotency scope:

```text
(Store incarnation, "start_run", agentId, idempotencyKey)
```

Canonical request:

```text
normalized UserInput + Run metadata
```

Same key and same request returns the original AgentRun. Same key and different
request returns `idempotency_conflict`. The key is mandatory. An intentional
repeat uses a newly generated key; this
prevents a success-unknown retry from accidentally creating a second Run.

### claim

Config resolution happens outside a Store transaction. Claim is one Store transaction that rechecks:

- Runtime Owner token;
- Run state and revision;
- expected Agent or pinned Config Token;
- per-Agent FIFO head predicate;
- absence of another `running` or `input_required` Run.

It then:

- installs the Runtime-preallocated Execution ID;
- promotes pending input under its preallocated Canonical user Message ID if
  this is the first attempt;
- changes `queued → running`;
- increments Run revision once;
- writes ordered events;
- returns the claimed Run, execution token, checkpoint if any, and the canonical Agent history needed for Model Context projection.

The Agent's first-execution behavior is derived from durable history, not process memory. The configured entry Phase is used when no earlier Run has begun execution; subsequent new Runs use the normal default entry behavior. Checkpoint resume uses its stored Phase state.

### input_required

An Execution Attempt returns rather than retaining a pending Promise or callback.

Runtime preallocates the prompt Message and Input Request IDs. Entering
`input_required` atomically commits:

1. prompt Canonical Message;
2. open Input Request;
3. Execution Checkpoint;
4. pinned Config Token;
5. Run state and revision;
6. Durable Run Events.

The Execution Attempt ends and releases its concurrency slot.

### respond()

Input Request ID is the answer idempotency identity:

- same request ID and same canonical answer returns success;
- same request ID and different answer returns `input_request_conflict`;
- this lookup happens before current Run state checks.

An answered request remains idempotently replayable after its Run reaches any later state. A cancelled request has no answer and returns `run_state_conflict`.

Runtime first reads the request, expected Run revision, pinned token, and
checkpoint header. It checks checkpoint compatibility before invoking Config
Provider, then verifies:

- the Input Request belongs to this Run;
- the Input Request is open;
- the checkpoint codec/version is supported;
- the pinned Config Token resolves as `available`.

`deferred`, `unavailable`, timeout, or Provider failure returns
`configuration_unavailable` and leaves the Input Request open. An incompatible
checkpoint returns `checkpoint_incompatible` and also leaves it open. The Run
therefore remains observable, answerable after repair or upgrade, and
cancellable.

A successful response transaction:

1. CASes the unexpired Owner lease, exact Run revision, `input_required` state,
   exact open Input Request ID, pinned Config Token, and checkpoint header;
2. commits the answer under its preallocated canonical user Message ID;
3. marks the Input Request answered with answer Message ID and canonical bytes;
4. changes `input_required → queued`;
5. allocates a new `readySequence`;
6. retains the checkpoint and pinned Config Token;
7. increments revision once and appends events.

A CAS miss writes no Message. Runtime rereads the durable request and applies
the same replay rules: an equal answered request succeeds, a different answer
conflicts, a cancelled request returns `run_state_conflict`, and a still-open
request restarts compatibility/config resolution from its new revision.

The next claim uses the pinned Configuration Snapshot.

If an answer was committed by a compatible Runtime but the process stopped
before claim, a later Runtime may encounter the answered `queued` Run with an
unsupported pinned checkpoint or an `unavailable` Config Token. The Scheduler
then commits `queued → failed` with the corresponding `RunFailure`; it never
blocks Runtime initialization or other Agents.

Checkpoint compatibility always precedes Config resolution for a pinned
queued Run. If both are unusable, the durable failure is
`checkpoint_incompatible`.

### terminal commit

Completion atomically stores the Outcome and optional explicit
`outputMessageId`. When present, that ID must reference an already-committed
`AssistantMessage` from the same Agent and Run. Output is never inferred from
the last assistant Message.

Runtime allocates Outcome identity and validates every model-produced canonical
Message and Outcome as JSON-safe and within limits before commit. Malformed
assistant content, Tool arguments, or Outcome data causes durable
`execution_failed`; provisional streaming content is discarded and no Tool is
invoked from invalid content.

Run Failure is separate from successful Outcome:

```ts
type RunFailure =
  | Readonly<{ code: "configuration_unavailable"; message: string }>
  | Readonly<{
      code: "checkpoint_incompatible";
      message: string;
      expected: Readonly<{ codec: string; versions: readonly number[] }>;
      actual: Readonly<{ codec: string; version: number }>;
    }>
  | Readonly<{
      code: "runtime_interrupted";
      message: string;
      ownerEpoch: number;
    }>
  | Readonly<{
      code: "tool_indeterminate";
      message: string;
      toolCallIds: readonly [ToolCallId, ...ToolCallId[]];
    }>
  | Readonly<{
      code: "execution_failed";
      message: string;
      details?: JsonValue;
    }>;

type QueuedRunFailure = Extract<
  RunFailure,
  { code: "configuration_unavailable" | "checkpoint_incompatible" }
>;

type RunningRunFailure = Extract<
  RunFailure,
  { code: "runtime_interrupted" | "tool_indeterminate" | "execution_failed" }
>;
```

### cancel()

Cancellation is naturally idempotent:

- any already-terminal Run returns its existing boundary without mutation;
- queued cancellation removes only pending work and creates no Canonical Message;
- input-required cancellation closes the open request without writing an answer;
- running cancellation atomically invalidates the Execution Token and resolves
  every open Tool Call;
- when no currently open Tool Call is `running`, cancellation marks any
  `pending` calls determinate `failed`, writes their result Messages, commits
  `cancelled`, and appends events;
- when any currently open Tool Call is `running`, cancellation marks those
  open calls `indeterminate`, resolves remaining pending calls, writes every
  result Message, and commits `failed` with `tool_indeterminate` instead of
  claiming a clean cancellation.

If another terminal commit wins the Store race, cancellation returns that
boundary. If cancellation wins, all late execution writes fail.

## Snapshot and waiting

```ts
type RunSnapshotBase = Readonly<{
  runId: RunId;
  agentId: AgentId;
  agentSequence: number;
  revision: number;
  input: UserInput;
  metadata?: Metadata;
  messageCount: number;
  toolCallCount: number;
  createdAt: string;
  updatedAt: string;
  cursor: EventCursor;
}>;

type RunSnapshot = RunSnapshotBase & (
  | Readonly<{ state: "queued" | "running" }>
  | Readonly<{
      state: "input_required";
      request: Readonly<{
        id: InputRequestId;
        phase: string;
        prompt: AssistantMessage;
      }>;
    }>
  | Readonly<{
      state: "completed";
      outcome: Outcome;
      output?: AssistantMessage;
    }>
  | Readonly<{
      state: "failed";
      failure: RunFailure;
    }>
  | Readonly<{
      state: "cancelled";
      reason?: string;
    }>
);
```

Snapshot is a bounded summary of the current Run aggregate, not its unbounded
Message or Tool history and not full Agent history. Callers replay
`MessageCommitted` and `ToolStateChanged` events when they need that history.
Snapshot and its global event cursor are read in one Store snapshot
transaction.

```ts
type RunBoundary =
  | Readonly<{
      type: "input_required";
      requestId: InputRequestId;
      phase: string;
      prompt: AssistantMessage;
    }>
  | Readonly<{
      type: "completed";
      outcome: Outcome;
      output?: AssistantMessage;
    }>
  | Readonly<{
      type: "failed";
      failure: RunFailure;
    }>
  | Readonly<{
      type: "cancelled";
      reason?: string;
    }>;
```

`wait()`:

- returns immediately when already at a boundary;
- may be called repeatedly and never consumes state;
- returns terminal states normally rather than rejecting;
- rejects only for command, Store, Runtime, or AbortSignal errors;
- is implemented from durable snapshot plus event cursor, never only from an in-memory waiter.

## Durable Run Events

`EventCursor` contains an opaque Store incarnation and a 64-bit Store sequence represented as JSON-safe text. Callers cannot construct, compare, or increment it.

```ts
type DurableEventBase = Readonly<{
  id: EventId;
  schemaVersion: 1;
  cursor: EventCursor;
  durability: "durable";
  agentId: AgentId;
  runId: RunId;
  runRevision: number;
  metadata?: Metadata;
  createdAt: string;
}>;
```

```ts
type DurableRunEvent =
  | MessageCommitted
  | RunStateChanged
  | ToolStateChanged;
```

```ts
type MessageCommitted = DurableEventBase & Readonly<{
  kind: "message_committed";
  message: Message;
}>;

type RunStateChanged = DurableEventBase & (
  | Readonly<{
      kind: "run_state_changed";
      from: null;
      to: "queued";
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "input_required";
      to: "queued";
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "queued";
      to: "running";
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "running";
      to: "input_required";
      request: Readonly<{
        id: InputRequestId;
        phase: string;
        prompt: AssistantMessage;
      }>;
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "running";
      to: "completed";
      outcome: Outcome;
      output?: AssistantMessage;
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "queued";
      to: "failed";
      failure: QueuedRunFailure;
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "running";
      to: "failed";
      failure: RunningRunFailure;
    }>
  | Readonly<{
      kind: "run_state_changed";
      from: "queued" | "running" | "input_required";
      to: "cancelled";
      reason?: string;
    }>
);

type ToolStateChanged = DurableEventBase & (
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: null; to: "pending" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "pending" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "pending"; to: "running" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "running" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "pending"; to: "failed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "failed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "completed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "completed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "failed" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "failed" }>;
    }>
  | Readonly<{
      kind: "tool_state_changed";
      transition: Readonly<{ from: "running"; to: "indeterminate" }>;
      toolCall: Extract<ToolCallSnapshot, { state: "indeterminate" }>;
    }>
);
```

Every first successful semantic mutation increments each affected Run's
revision exactly once. Exact replay is a read of that postcondition and
increments nothing. Events for that Run carry its same post-commit revision and
all events are ordered by Store cursor.

Fixed event order:

- Canonical Messages follow `sequenceWithinRun`;
- a Tool-use Message precedes creation of its `pending` Tool Calls;
- each Tool terminal state precedes its corresponding Tool-result Message;
- batched Tool events in one transaction follow model-request order; independent
  parallel result transactions follow Store commit order and correlate by
  `ToolCallId`;
- `RunStateChanged`, when present, is the final event for that Run in the
  transaction.

```text
start:
  run_state_changed(null → queued)

first claim:
  message_committed(input)
  → run_state_changed(queued → running)

later claim:
  run_state_changed(queued → running)

respond:
  message_committed(answer)
  → run_state_changed(input_required → queued)

input boundary:
  message_committed(prompt)
  → run_state_changed(running → input_required)

completion:
  message_committed(output, when produced in this transaction)
  → run_state_changed(running → completed)

Tool request:
  message_committed(assistant tool use)
  → tool_state_changed(pending, in model order)

Tool invocation point:
  tool_state_changed(pending → running)

Tool determinate result:
  tool_state_changed(completed or failed)
  → message_committed(tool result)

simple failure with no open Tools:
  run_state_changed(current → failed)

clean cancellation:
  tool_state_changed(pending → failed, if any, in model request order)
  → message_committed(determinate result, in the same order)
  → run_state_changed(current → cancelled)

seal/indeterminate Tool with unresolved calls:
  tool_state_changed(failed or indeterminate, in model request order)
  → message_committed(explicit result, in the same order)
  → run_state_changed(running → failed)
```

When clean cancellation has no pending Tool, it emits only its Run transition.
A queued or input-required cancellation likewise emits only its Run
transition. Multi-Run takeover/seal orders affected Runs by
`agentId, agentSequence, runId`, then applies the per-Run order above.

The explicit unknown-effect Tool result keeps later Model Context structurally valid without claiming that the external effect failed.

First release events are append-only and have no GC.

## Transient Run Events and observe()

```ts
type MessageDelta = Readonly<{
  kind: "message_delta";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  messageId: MessageId;
  offset: number; // UTF-16 code units
  text: string;
}>;

type ToolProgress = Readonly<{
  kind: "tool_progress";
  durability: "transient";
  runId: RunId;
  executionId: ExecutionId;
  toolCallId: ToolCallId;
  progress: JsonValue;
}>;

type RunEvent = DurableRunEvent | MessageDelta | ToolProgress;
```

Transient rules:

- no Event ID, Store cursor, or Run revision;
- live only and never replayed;
- bounded per-observer buffering;
- Message deltas may be coalesced or dropped;
- Tool progress may be dropped;
- active Tools may report best-effort JSON progress through
  `ToolInvocationContext.reportProgress(progress)`;
- a completed `message_committed` event is authoritative for full content;
- provisional content without a final Message is discarded at a Run boundary;
- Runtime checks the current Execution Token before enqueueing local transient
  events and drops queued transients before delivering a locally observed
  durable Run boundary.

An event already yielded to caller code cannot be retracted. After
close/takeover, an old in-flight callback may race with the new owner's durable
commit, so a stale transient can be observed before replay reaches the terminal
event. Once `observe()` yields that terminal Durable Run Event it ends and
yields nothing afterward. Durable state is authoritative; Rowan does not claim
an impossible absolute cross-owner emission barrier.

Streaming allocates the eventual Message ID before the first delta.

`observe()`:

- without `after`, replays all retained durable events for the Run, then follows live durable and transient events;
- with `after`, yields only durable events whose Store sequence is greater, plus transient events observed after live attachment;
- tolerates global cursor gaps after Run filtering;
- polls or wakes from Store state so slow consumers cannot lose durable events;
- ends after delivering the terminal event;
- if the Run is already terminal and its terminal cursor is not after the supplied cursor, yields nothing and ends immediately;
- rejects a cursor from another Store incarnation or beyond the current waterline with `invalid_cursor`;
- rejects AbortSignal cancellation with `AbortError`.

Replay-to-live attachment may duplicate a durable fetch internally but deduplicates by Event ID before delivery.

## Reliable consumption

`runtime.consume()` delivers only Durable Run Events.

Registration is asynchronous so Store checkpoint and catch-up waterline are frozen before the method resolves.

If the required signal aborts before registration linearizes, `consume()`
rejects with `AbortError` and releases the locally reserved Consumer ID. A
Runtime closed before that point rejects `runtime_closed` with the same
cleanup. The Store registration transaction is the race linearization point.
Once it commits, `consume()` resolves a handle even if already stopping; later
abort/close is represented only by that handle's `caughtUp` and `done`
lifecycle below.

Rules:

- a new consumer starts at the first retained event;
- an existing consumer starts after its Consumer Checkpoint;
- one consumer invokes its listener serially;
- successful listener completion advances the checkpoint in a Store transaction;
- listener failure leaves the checkpoint unchanged and retries the same event;
- retry uses exponential backoff with jitter, from 100 ms to a 30 second cap;
- one failing event blocks only that consumer;
- processing through the frozen registration waterline resolves `caughtUp`;
- caller AbortSignal before catch-up rejects `caughtUp` with `AbortError`;
- Runtime close before catch-up rejects `caughtUp` with
  `RuntimeError("runtime_closed")`;
- AbortSignal or Runtime close stops new delivery and aborts the in-flight
  listener's delivery signal;
- after an AbortSignal or Runtime close, `done` resolves normally only after
  the in-flight listener settles;
- ownership loss or permanent Store failure rejects pending `caughtUp` and
  eventually rejects `done` with the same `RuntimeError`;
- Runtime close does not await consumer handles or an uncooperative listener;
- stale checkpoint writes after close or ownership loss are fenced;
- one Runtime cannot activate the same Consumer ID twice;
- a Consumer ID remains active until its handle's `done` settles and may be
  registered again only afterward.

Listener side effects are at-least-once. A side effect followed by a crash before checkpoint may repeat.
The delivery signal is cooperative cancellation, not proof that an external
effect stopped. Waiting for listener settlement before releasing the Consumer
ID prevents deliberate overlap inside one Runtime, while keeping Runtime
shutdown bounded. After close, crash, or takeover, an uncooperative callback
from the old owner may still overlap a retry by the new owner; this is
unavoidable for external effects. Listeners therefore deduplicate side effects
by Event ID.

There is no event skip or dead-letter command in the first release. Operators fix a deterministic listener failure and replay it, or abort that consumer.

## Runtime ownership

The Store maintains one durable owner row:

```ts
type OwnerToken = Readonly<{
  ownerId: string;
  epoch: number;
  expiresAt: string;
}>;
```

Ownership rules:

- each Runtime initialization generates a fresh Owner ID;
- Store time, not process time, decides expiry;
- a non-expired owner with a different Owner ID causes
  `runtime_already_owned`;
- every successful acquisition, whether after clean release or expiry,
  atomically increments epoch and never reuses an earlier epoch;
- release clears the owner identity but preserves the monotonic epoch;
- all writes, including renewal and consumer checkpoints, verify owner identity,
  epoch, and `StoreNow < expiresAt` in their transaction;
- an expired owner cannot renew itself or commit while waiting for takeover;
- renewal failure stops new local work and best-effort aborts local execution;
- ownership fencing protects Store state but cannot undo an external Tool effect.

Expired takeover is one Store transaction:

1. verify previous owner expiry;
2. install the next epoch;
3. mark previous-epoch pending Tool Calls determinate `failed`;
4. mark previous-epoch running Tool Calls `indeterminate`;
5. append a model-visible result Message for every unresolved Tool use;
6. fail previous-epoch running Runs with `runtime_interrupted` or `tool_indeterminate`;
7. append all events;
8. install the new owner lease.

Queued, input-required, and terminal Runs are unchanged.

The initial built-in ownership lease is 30 seconds and renews every 10 seconds. These are Runtime implementation constants in the first release rather than public interface fields.

## Scheduling

- default global Run concurrency is 10;
- different Agents may execute concurrently;
- one Agent always executes serially;
- an input-required Run blocks later Runs of the same Agent;
- Store queue state is authoritative;
- Runtime maintains a wake generation and a low-frequency safety scan so a lost notification cannot strand work;
- Config lookups have a separate first-release concurrency limit of 16 and do
  not consume execution slots;
- one Config lookup has a 30 second Runtime timeout; timeout behaves as `deferred`;
- `deferred` Config results use per-Agent capped exponential backoff and allow other Agents to proceed;
- no Config lookup, Tool call, model call, or listener runs inside a Store transaction.

Claim must atomically enforce:

```text
Run is queued
AND Run revision is expected
AND owner token is current
AND expected Config Token is current or pinned
AND no smaller nonterminal agentSequence exists
AND no running/input_required Run exists for the Agent
```

Memory scheduler state may optimize this query but cannot weaken it.

First release has no queue priority, capacity limit, delayed task, execution retry, or preemption.

## Tool Calls

```ts
type ToolCallState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "indeterminate";

type ToolCallSnapshotBase = Readonly<{
  id: ToolCallId;
  agentId: AgentId;
  runId: RunId;
  executionId: ExecutionId;
  requestMessageId: MessageId;
  name: string;
  args: JsonValue;
  createdAt: string;
  updatedAt: string;
}>;

type ToolCallSnapshot = ToolCallSnapshotBase & (
  | Readonly<{
      state: "pending";
    }>
  | Readonly<{
      state: "running";
    }>
  | Readonly<{
      state: "completed";
      result: DurableToolResult & Readonly<{ ok: true }>;
      resultMessageId: MessageId;
    }>
  | Readonly<{
      state: "failed";
      result: DurableToolResult & Readonly<{ ok: false }>;
      resultMessageId: MessageId;
    }>
  | Readonly<{
      state: "indeterminate";
      result: DurableToolResult & Readonly<{ ok: false }>;
      resultMessageId: MessageId;
      reason: string;
    }>
);
```

`beforeToolCall` and `afterToolCall` are side-effect-free policy/transform
hooks; external effects belong only in the Tool adapter. Each hook has a
30-second first-release Runtime timeout, and Runtime ignores a late result:

- before-hook denial, throw, timeout, or invalid return occurs while the Tool
  Call is `pending`; Runtime commits a determinate failed Tool result and may
  continue the model loop;
- after-hook output is the only successful/failure result eligible for commit;
  Runtime supplies IDs, normalizes it, and validates it as JSON-safe and within
  the Tool-result size limit;
- after-hook throw, timeout, invalid return, process loss, or abort happens
  after the durable invocation point but before a final result commit, so the
  Tool becomes `indeterminate`, parallel open Tools are resolved, and the Run
  fails with `tool_indeterminate`.

Tool lifecycle:

1. Rowan allocates a durable Tool Call ID for each model Tool use, stores the
   source protocol and model correlation ID in the internal Tool Call record,
   rewrites canonical Tool-use content to the durable ID, and commits that
   Message with all `pending` Tool Calls before waiting for Tool capacity.
2. Policy denial or cancellation before the durable invocation point changes
   `pending → failed` and commits a determinate Tool result Message.
3. Store commits `pending → running` as the durable invocation point; only
   after that commit may Runtime call the Tool adapter.
4. Runtime passes `ToolInvocationContext` to the Tool adapter; its durable Tool
   Call ID is the correlation and optional external idempotency token. Agent
   and Run IDs are captured values, so Tools do not need mutable self-ID
   closures.
5. Explicit adapter success or determinate failure atomically commits Tool terminal state, result, model-visible Tool Message, and events.
6. Adapter throw, timeout, broken connection, abort after the invocation point,
   or crash between that commit and durable result commit is `indeterminate`,
   even if the process may have crashed before the adapter body actually ran.
7. Indeterminate commit includes an explicit unknown-effect Tool result Message and terminal Run Failure.

The Tool adapter and after hook return `ToolExecutionResult`; they cannot choose
the durable Tool ID or name. A malformed, non-JSON-safe, oversized, or
identity-bearing adapter/hook result cannot be committed. Because validation
occurs after the durable invocation point, Runtime treats it as
`indeterminate` and follows step 7.

For a Tool that passed the durable invocation point, only an adapter-returned
determinate failure is `failed`. Policy denial and pre-invocation cancellation
also produce determinate `failed`; Rowan never infers that a thrown error after
the invocation point proves no external effect.

Canonical assistant Tool-use and Tool-result content both use Rowan's durable
`ToolCallId`. The internal model correlation ID exists only to preserve the
provider protocol. Model Context ingestion maps the provider ID to
`ToolCallId`; projection maps both Tool-use and Tool-result blocks to one
provider-facing alias. It reuses the stored original when compatible with the
target protocol, otherwise derives a deterministic valid alias from
`ToolCallId`. No Runtime command accepts that alias, and external Tool adapters
receive only the durable ID.

In a stored `DurableToolResult`, `toolCallId` is the durable
`ToolCallId` and `toolName` equals the Tool Call record.

If one Tool Call makes the Run terminal while parallel Tool Calls remain open, the same transaction marks every `pending` call determinate `failed`, every `running` call `indeterminate`, writes one result Message per unresolved Tool use, and includes all indeterminate IDs in the Run Failure.

Tool progress is transient. No Run boundary—including `input_required`,
`completed`, `failed`, or `cancelled`—can commit while one of its Tool Calls is
`pending` or `running`. The ordinary execution loop may request input only when
no Tool Call is open; cancellation, seal, and Tool-induced failure resolve all
open calls in the same transaction as the boundary.

## Durable Store seam

Memory and SQLite are real adapters at one internal seam. `DurableStore` first verifies schema and acquires ownership, returning an owner-bound Store capability so Runtime code cannot forget the epoch:

### Success-unknown and exact replay

Every semantic Store write is exactly replayable at its operation boundary.
Runtime allocates all natural intent identities before the first attempt and
reuses them with the same canonical payload:

| Write | Stable replay identity |
| --- | --- |
| Agent reserve/activation | caller idempotency key, or a Runtime-generated key for one ordinary invocation, plus its documented scope |
| Config update, Run creation | caller idempotency key plus its documented scope |
| claim, including first input promotion | preallocated `ExecutionId`, first-input `MessageId` when applicable, plus expected Run revision |
| Canonical Message commit | preallocated `MessageId` |
| input boundary | preallocated `InputRequestId` and prompt `MessageId` |
| answer | `InputRequestId` plus canonical answer bytes |
| Tool request | assistant `MessageId` plus ordered preallocated `ToolCallId`s |
| Tool invocation/result | `ToolCallId` plus expected source/target state |
| Outcome/failure/cancellation | Run ID, Execution ID when applicable, expected revision, and target terminal state |
| owner renewal/seal | Owner Token plus a preallocated renewal sequence or seal operation |
| Consumer registration | Owner Token, Consumer ID, and a preallocated registration operation ID |
| Consumer Checkpoint | Consumer ID plus delivered Event cursor |

Subject to the current fences below, same identity and payload returns the
original durable postcondition without incrementing revision or appending
Events. Consumer-registration replay returns the same frozen starting
checkpoint and catch-up waterline. A different payload or impossible
postcondition performs no write and is an invariant/CAS conflict. Store
idempotency rows and Provider `operationId` mappings are never deleted or
reused during the Store incarnation in the first release.

After a possible commit with an unknown response, Runtime may only retry the
same intent or read back its durable postcondition. It never allocates
replacement IDs, reinvokes a model or Tool, repeats a Provider `put()` under
another operation ID, or writes a failure until it has proved the original
commit absent. If reconciliation remains unavailable, local work stops and the
owner/takeover protocol eventually seals the attempt.

In particular, a Tool adapter is called only after the exact
`pending → running` intent is confirmed. An ambiguous Tool-result or Outcome
commit is reconciled, never converted into a second invocation or a different
terminal result.

Exact replay never bypasses the current Owner or Execution fence. A stale
OwnedStore or Execution Token returns `runtime_ownership_lost` or an internal
stale-execution CAS result even when historical receipts exist, and never
authorizes a new model, Tool, or hook call. Claim and Tool-invocation replay
return executable capability only while the current Run/Tool is still
`running` under that same live Execution Token. Renewal replay likewise
requires the same live owner and epoch. A durable successful seal receipt is
the sole operation allowed to return success across a later owner epoch,
because it cannot authorize new work.

```ts
interface DurableStore {
  openOwner(input: {
    ownerId: string;
    leaseMs: number;
  }): Promise<OwnedStore>;
}
```

`openOwner()` validates schema and ownership only. It does not scan Run
checkpoints: one incompatible Run must not make discovery, observation, or
cancellation of the entire Store unavailable.

One `AgentRuntime.init()` invocation generates its Owner ID once and reuses it
for all `openOwner()` retries. If the live row already has that exact Owner ID,
Store returns the original Owner Token without incrementing epoch; this is a
replay, not a new acquisition. Another initialization uses another Owner ID
and receives `runtime_already_owned` until release or expiry.

Constructing a Store adapter performs no schema or ownership write. Version inspection and current-schema creation happen only through Runtime initialization.

`OwnedStore` exposes semantic atomic methods, not table primitives. Representative methods:

```text
reserveAgent
activateAgent
updateAgentConfigToken
createRun
claimRun
commitInputRequired
answerInput
beginToolCall
startToolCall
commitToolResult
commitOutcome
cancelRun
sealAndReleaseOwner
renewOwner
snapshotRun
listAgents
listRuns
listEvents
openConsumer
advanceConsumerCheckpoint
```

Execution-originated methods require `ExecutionToken`; owner-bound methods carry owner identity and epoch internally.

### Schema

Suggested tables:

```text
runtime_meta
runtime_owner
agents
runs
messages
input_requests
tool_calls
run_events
consumer_checkpoints
idempotency
```

Deleted tables:

```text
sessions
runtime_messages
runtime_leases
mailbox
```

Required constraints include:

```text
UNIQUE (agent_id, agent_sequence)
UNIQUE (run_id, sequence_within_run)
at most one running/input_required Run per Agent
at most one open Input Request per Run
one current execution_id only while running
terminal state and terminal payload consistency
```

The Agent row allocates `next_run_sequence`; Store code never uses `MAX(agentSequence) + 1`.

Run Events use a 64-bit SQLite integer primary key sequence allocated by SQLite, never `MAX(sequence) + 1`. Adapters convert it to a JSON-safe opaque cursor.

### SQLite contract

- inspect `sqlite_master` and schema version read-only before any DDL or DML;
- only a genuinely empty database may initialize the current schema;
- a non-empty unsupported Runtime database returns `unsupported_store_version` without mutation;
- use short write transactions and no external await inside them;
- use `BEGIN IMMEDIATE` or equivalent for semantic writes;
- enable foreign keys, WAL, a bounded busy timeout, and a documented synchronous level;
- classify `BUSY/LOCKED` as retryable Store failure, not state conflict;
- read Run snapshot and event waterline in one read transaction;
- test with two independent SQLite connections to the same file.

The durability profile covers application and process crash. Host power-loss guarantees follow the configured SQLite synchronous mode and are documented by the adapter.

## Agent-to-Agent delivery

Rowan does not add `context.agent()` or infer routing.

Flow:

1. source Run commits a terminal `run_state_changed` event;
2. reliable consumer receives it;
3. host router filters for a completed Run with explicit output;
4. router makes a deterministic target and input mapping;
5. router calls target `runtime.start()`;
6. router returns so its checkpoint can advance.

```ts
if (
  event.kind !== "run_state_changed"
  || event.to !== "completed"
  || !event.output
) {
  return;
}

const targetContent: UserContent =
  mapAssistantOutputToUserContent(event.output);

await runtime.start(
  targetAgentId,
  {
    content: targetContent,
    metadata: {
      sourceEventId: event.id,
      sourceRunId: event.runId,
      sourceMessageId: event.output.id,
    },
  },
  {
    idempotencyKey: `${routerId}:primary-output:${event.id}`,
  },
);
```

Requirements:

- target `start()` always queues, including while target is input-required;
- Rowan never coerces assistant content into user content; the host router owns
  `mapAssistantOutputToUserContent()` and must return a valid `UserContent`;
- routing for one source event must be stable across retries and deployments;
- if routing depends on mutable business state, the router persists its
  decision and stable delivery slot in a host-owned outbox before calling
  target `start()`;
- different independent routers use different idempotency namespaces;
- a router that emits multiple deliveries uses stable semantic slot names in
  the key, such as `primary-output`; deploy or route version is never part of
  the key;
- Rowan does not change source assistant role into target user role implicitly; the router supplies user content.

## JSONL projection

Session JSONL is removed. JSONL becomes a projection assembled with the
deliberate `logging → agent` dependency:

```ts
const appendJsonl = createJsonlRunEventSink({
  directory,
});

await runtime.consume({
  consumerId: "jsonl-transcript",
  signal,
  onEvent: appendJsonl,
});
```

Behavior:

- the `logging` package exports a Durable-Run-Event sink and depends only on
  pure event DTOs from `agent`; CLI or `agent` owns Runtime orchestration;
- Runtime passes only Durable Run Events;
- writes `{directory}/{agentId}.jsonl`;
- writes one hydrated event per complete line;
- serializes repair and append with a per-Agent interprocess file lock and
  cooperates with the delivery signal, so an old-owner callback cannot
  interleave bytes with a new owner;
- never writes transient deltas or Tool progress;
- resolves listener work only after append completion;
- repairs or truncates an incomplete trailing line before append;
- is at-least-once and may repeat a complete line after a crash;
- includes Event ID and cursor for deduplication;
- blocks only its own consumer on failure;
- never participates in Model Context, scheduling, or recovery.

## CLI control flow

CLI persists Agent ID and current Run ID. Ordinary Agent creation lets Runtime
generate its key; commands that need caller-controlled retry use a stable
operation idempotency key.

```text
no current Run
  → runtime.start()

current Run is input_required
  → run.respond(requestId, input)

run.wait() returns terminal
  → clear current Run
```

`observe()` is display-only. `wait()` and snapshots control state.

After restart:

```ts
const run = runtime.run(runId);
const boundary = await run.wait();
```

`listAgents()` and `listRuns()` support discovery and status views without exposing Durable Store internals.

These reads use an initialized owning Runtime. A separate CLI process cannot
open the same Store while another owner is live; in the first release it
surfaces `runtime_already_owned` with `expiresAt/retryAfterMs` rather than
bypassing ownership through direct SQL. Concurrent out-of-process inspection
would require a future read-only/query IPC seam and is not implied here.

The public `Agent` value is removed, so resource loading moves to standalone exports:

```text
loadSkills
loadPhases
loadExtensions
```

CLI and logging migrate from `Agent.subscribe()` to `AgentRun.observe()`.

## Error model

Command and infrastructure errors use:

```ts
class RuntimeError<C extends RuntimeErrorCode> extends Error {
  readonly code: C;
  readonly details: RuntimeErrorDetails[C];
}

type AnyRuntimeError = {
  [C in RuntimeErrorCode]: RuntimeError<C>;
}[RuntimeErrorCode];

declare function isRuntimeError(value: unknown): value is AnyRuntimeError;
```

Stable first-release codes:

```ts
type RuntimeErrorCode =
  | "invalid_argument"
  | "runtime_closed"
  | "runtime_already_owned"
  | "runtime_ownership_lost"
  | "agent_not_found"
  | "run_not_found"
  | "run_state_conflict"
  | "input_request_conflict"
  | "idempotency_conflict"
  | "configuration_unavailable"
  | "checkpoint_incompatible"
  | "consumer_already_active"
  | "invalid_cursor"
  | "store_unavailable"
  | "unsupported_store_version";
```

```ts
type RuntimeErrorDetails = {
  invalid_argument: {
    argument: string;
    reason: string;
  };
  runtime_closed: null;
  runtime_already_owned: {
    expiresAt: string;
    retryAfterMs: number;
  };
  runtime_ownership_lost: {
    reason: "expired" | "released" | "epoch_advanced";
    expectedEpoch: number;
    actualEpoch: number;
    expiresAt?: string;
  };
  agent_not_found: {
    agentId: AgentId;
  };
  run_not_found: {
    runId: RunId;
  };
  run_state_conflict: {
    runId: RunId;
    expected: readonly RunState[];
    actual: RunState;
  };
  input_request_conflict: {
    runId: RunId;
    requestId: InputRequestId;
    reason: "not_found" | "wrong_run" | "different_answer";
  };
  idempotency_conflict: {
    scope: "create_agent" | "update_agent_config" | "start_run";
    idempotencyKey: string;
  };
  configuration_unavailable: {
    agentId: AgentId;
    runId?: RunId;
    retryable: boolean;
    reason: string;
  };
  checkpoint_incompatible: {
    runId: RunId;
    expected: {
      codec: string;
      versions: readonly number[];
    };
    actual: {
      codec: string;
      version: number;
    };
  };
  consumer_already_active: {
    consumerId: string;
  };
  invalid_cursor: {
    cursorType: "agent_list" | "run_list" | "event";
    reason:
      | "malformed"
      | "wrong_store"
      | "wrong_collection"
      | "filter_mismatch"
      | "beyond_waterline";
  };
  store_unavailable: {
    operation: string;
    retryable: boolean;
    reason: string;
  };
  unsupported_store_version: {
    found: string | null;
    supported: string;
  };
};
```

Error messages are diagnostic and may evolve; `code` and `details` above are
the stable machine interface. Public-method error sets are:

| Method / Promise | Runtime Error codes |
| --- | --- |
| `AgentRuntime.init` | `invalid_argument`, `runtime_already_owned`, `store_unavailable`, `unsupported_store_version` |
| `createAgent` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `idempotency_conflict`, `configuration_unavailable`, `store_unavailable` |
| `updateAgentConfig` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `agent_not_found`, `idempotency_conflict`, `configuration_unavailable`, `store_unavailable` |
| `start` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `agent_not_found`, `idempotency_conflict`, `store_unavailable` |
| `run` | none; it performs no I/O |
| `listAgents` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `invalid_cursor`, `store_unavailable` |
| `listRuns` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `agent_not_found`, `invalid_cursor`, `store_unavailable` |
| `consume` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `consumer_already_active`, `store_unavailable` |
| `AgentRun.snapshot` | `runtime_closed`, `runtime_ownership_lost`, `run_not_found`, `store_unavailable` |
| `AgentRun.observe` | `runtime_closed`, `runtime_ownership_lost`, `run_not_found`, `invalid_cursor`, `store_unavailable` |
| `AgentRun.wait` | `runtime_closed`, `runtime_ownership_lost`, `run_not_found`, `store_unavailable` |
| `AgentRun.respond` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `run_not_found`, `run_state_conflict`, `input_request_conflict`, `configuration_unavailable`, `checkpoint_incompatible`, `store_unavailable` |
| `AgentRun.cancel` | `invalid_argument`, `runtime_closed`, `runtime_ownership_lost`, `run_not_found`, `store_unavailable` |
| `close` | `runtime_ownership_lost`, `store_unavailable` |
| consumer `caughtUp` / `done` | `runtime_closed` (`caughtUp` only), `runtime_ownership_lost`, `store_unavailable` as specified by the consumer lifecycle |

AbortSignal cancellation rejects with `AbortError`, the explicit exception to `RuntimeError`.

Error precedence is deterministic: synchronous argument/canonicalization
validation runs first, then local closed/aborted checks; Store idempotency
records are consulted before mutable existence or state checks; not-found
precedes state conflict. An owner fence or Store failure at the transaction
linearization point supersedes the domain result because no authoritative
commit can then be proven.

Execution failures are durable `RunFailure` values and are not command Promise rejections.

## close and restart

`close()`:

1. synchronously marks the local Runtime closing, stops new claims and
   deliveries, and aborts local execution and consumer delivery signals;
2. best-effort aborts local model and Tool controllers;
3. executes one Store `sealAndReleaseOwner()` transaction;
4. does not wait indefinitely for user-controlled Promises;
5. rejects `store_unavailable` if durable seal cannot commit;
6. allows a later `close()` call to retry sealing;
7. returns successfully once the seal/release transaction has committed.

The seal transaction:

- marks pending Tool Calls determinate failed;
- marks running Tool Calls indeterminate;
- commits one determinate or unknown-effect Tool Message for every unresolved Tool use;
- fails running Runs as interrupted or Tool-indeterminate;
- appends events;
- releases only the matching owner token.

Queued, input-required, and terminal Runs remain unchanged.

Late callbacks may continue in JavaScript but cannot emit accepted transient events or commit Store writes.

`sealAndReleaseOwner()` is retry-idempotent for one Owner Token:

- an existing successful receipt for the same seal operation returns success
  even if a later owner has since advanced the epoch;
- a matching live owner is sealed and released;
- an already-empty owner row whose preserved epoch equals the closing token's
  epoch records/returns success;
- without a prior receipt, a greater epoch or another owner at that epoch returns
  `runtime_ownership_lost`.

Concurrent local `close()` calls share the same attempt. After
`store_unavailable`, a later call retries the Store transaction; after success,
all later calls return success.

## Removed public concepts

The final public package removes without aliases:

- `Agent`;
- `Agent.send()/subscribe()`;
- `AgentHandle`;
- `AgentRun.result()/consumeRuntimeEvents()/subscribe()`;
- `reconstructAgent()`;
- `pauseAgent()/resumeAgent()`;
- `RuntimeEventDisposition`;
- Session lifecycle and Session Manager authority;
- Runtime Message and Mailbox;
- per-Run Lease;
- suspended/resume continuation;
- JSONL Session authority;
- persistence callbacks `onMessage`, `onOutcome`, and `onModelTranscript`.

Full raw model transcripts are not Runtime State in the first release. Hosts that need provider-level tracing use a non-authoritative telemetry adapter; telemetry failure cannot affect a Run.

## Rollout

- Current Runtime database files are unsupported.
- Store version is checked before any schema mutation.
- CLI uses a new Runtime database filename or requires explicit user reset.
- Downstream rows referencing old Rowan Agent or Session IDs are invalidated or rebuilt explicitly.
- No automatic migration, compatibility reader, or dual write exists.

## Acceptance

### State and ordering

- 100 concurrent `start()` calls allocate unique `agentSequence` values.
- every `start()` requires a stable idempotency key and a response-loss retry
  creates one Run;
- Same-Agent execution is strictly FIFO and serial.
- Different Agents reach configured concurrency.
- New `start()` during `input_required` queues without answering it.
- Cancelling never-started input produces no Canonical Message.

### Ownership and fencing

- two Runtime instances race for one Store and exactly one acquires it;
- a response-loss retry of `openOwner()` with the same Owner ID returns the
  original token rather than fencing itself;
- an unexpired owner is never taken over;
- an expired owner is atomically sealed and replaced;
- every stale owner write is rejected;
- every stale Execution Attempt write is rejected, including under the same owner epoch;
- close, cancel, outcome, and Tool-result races have one valid linearization.

### Configuration and input

- creation and update idempotency survive response loss;
- same Provider operation plus the same configuration identity returns one
  token; a different identity conflicts;
- concurrent Config updates are last-commit-wins and replaying an older success
  does not revert the current token;
- current Config changes affect never-started Runs;
- checkpointed Runs continue with their pinned Config Snapshot;
- restart resolves pinned Config Tokens;
- deferred configuration does not block other Agents;
- an incompatible open request remains observable and cancellable, rejects
  answer commit, and does not prevent Runtime initialization;
- an incompatible answered queued Run becomes durably failed;
- checkpoint incompatibility wins over simultaneous Config unavailability;
- a Config-resolution race in `respond()` cannot write an answer for another
  revision or Input Request;
- repeated same answer succeeds and different answer conflicts.

### Events and consumers

- snapshot plus cursor has no durable replay gap;
- replay-to-live loops do not lose or duplicate delivered durable Event IDs;
- terminal snapshot plus a later cursor ends observation immediately;
- slow transient observers do not slow execution;
- final Message commit repairs dropped deltas;
- local buffering drops queued transients at a boundary; takeover may expose a
  stale transient before the terminal Event, but `observe()` ends at that
  durable boundary;
- consumer listener failure retries one event with unchanged checkpoint;
- catch-up waterline, abort, close, and ownership-loss semantics match this PRD;
- a Consumer ID cannot be reused while an aborted but uncooperative listener is
  still in flight;
- crash after target `start()` and before checkpoint creates one target Run.

### Tools

- policy denial before the durable invocation point is determinate;
- cancellation before the durable invocation point never becomes indeterminate;
- throw, timeout, abort, crash, and takeover after the durable invocation point
  become indeterminate;
- Tool terminal state, Tool Message, Run terminal state when applicable, and events are atomic;
- malformed or oversized adapter/after-hook output after the invocation point
  becomes indeterminate;
- later Model Context contains a structurally valid Tool result for indeterminate calls.

### Store adapters and schema

- Memory and SQLite pass the same behavioral and concurrency contract suite;
- Agent and Run list cursors reject cross-Store, cross-collection, and
  filter-mismatched reuse, and activation-time pagination does not skip a
  provisioned Agent;
- two SQLite connections exercise ownership, busy handling, sequence allocation, and CAS;
- fault injection at every semantic transaction proves all-or-nothing writes;
- fault injection after commit but before response proves exact replay with no
  duplicate revision/Event and no repeated Model, Tool, or Provider effect;
- unsupported old schema returns `unsupported_store_version` and leaves every table and row unchanged.

### Product integration

- package build and generated public interface checks pass;
- CLI restarts from both terminal and input-required Run IDs;
- CLI list/status uses Runtime read interfaces rather than Store internals;
- JSONL event sink repairs partial lines and tolerates duplicate full lines;
- Rowan source, examples, CLI, logging, and downstream migration contain no old Agent, Reconstruction, Session authority, Mailbox, Lease, or `RuntimeEventDisposition` usage.
