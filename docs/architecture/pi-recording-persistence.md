# Pi Agent Memory And Session Persistence Comparison

This note compares Pi and Rowan around one core question:

How should the Agent Module keep live memory, and how should durable Session persistence work?

It is based on the current Pi implementation:

- Pi `packages/agent/src/agent.ts`
  <https://raw.githubusercontent.com/earendil-works/pi/refs/heads/main/packages/agent/src/agent.ts>
- Pi `packages/agent/src/agent-loop.ts`
  <https://raw.githubusercontent.com/earendil-works/pi/refs/heads/main/packages/agent/src/agent-loop.ts>
- Pi `SessionManager`
  <https://raw.githubusercontent.com/earendil-works/pi/refs/heads/main/packages/coding-agent/src/core/session-manager.ts>
- Pi session format docs
  <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md>
- Pi session docs
  <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md>

## Pi Shape

Pi uses two deliberately different Modules.

### Agent Memory

Pi `Agent` is an in-memory stateful wrapper around the low-level Agent loop.

It owns:

- `systemPrompt`, current `messages`, current `tools`, model and thinking settings;
- runtime status such as `isStreaming`, `streamingMessage`, `pendingToolCalls`, and `errorMessage`;
- steering and follow-up queues;
- abort lifecycle and listener fanout.

The low-level loop emits lifecycle events such as message start/update/end, tool execution start/end, turn end, and agent end. `Agent.processEvents()` reduces those events into memory:

- prompt and assistant messages enter `state.messages` on `message_end`;
- streaming message state is transient;
- pending tool calls are tracked only while the run is active;
- listeners are awaited as part of the active run lifecycle.

The important architectural point is that Pi `Agent` does not persist durable Sessions. It keeps the current live transcript and runtime state.

### Session Persistence

Pi coding-agent persistence is owned by `SessionManager`, not by the Agent core.

`SessionManager` stores Sessions as append-only JSONL files. The first line is a session header. Later lines are typed entries with `id` and `parentId`, forming a tree:

- message entries;
- model and thinking-level changes;
- compaction entries;
- branch summaries;
- custom entries;
- labels and session info.

Appending a new entry advances the current leaf. Branching moves the leaf to an older entry without rewriting history. Context reconstruction walks from the selected leaf to the root and builds the model-visible message list, including compaction and branch summaries when needed.

This gives Pi three useful properties:

1. Live memory is simple and fast.
2. Durable history is append-only and crash-friendly.
3. Branching, compaction, and extension state are persistence features, not Agent features.

## Rowan Shape

Rowan already has the right domain terms, but the current implementation mixes two concerns more than Pi does.

### Agent Memory

Rowan `Agent` is the public facade for:

- Session lifecycle;
- event fanout;
- cancellation;
- current run state;
- the Agent loop entrypoint.

Its state contains both a live `context` snapshot and an optional durable `session`. `Agent.run()` resolves a Session, passes it to `runAgentLoop()`, then replaces `state.session` and `state.context` with the returned values.

The Agent loop mutates the Session during the run:

- `syncSessionFromContext()` copies context messages into the Session;
- `appendSessionMessage()` appends conversation messages;
- execution-scoped event messages stay in the loop message log;
- the loop returns `AgentRunResult` with the Session and Outcome.

This works, but it makes `Agent` partly an in-memory reducer and partly a durable aggregate owner.

### Session Persistence

Rowan persistence is currently a whole-state AgentStore:

- `LocalJsonAgentStore` writes one `<session-id>.json` file per Session.
- The file contains the persisted Session fields plus a `steps` array of `ExecutionTurn` entries.
- `save(session)` rewrites the Session state.
- `appendStep(sessionId, step)` reads the same JSON file, appends to `steps`, and rewrites it.
- The CLI collects `ExecutionTurn` entries in memory, runs the Agent, then saves the returned Session and appends the collected steps.

This shape is simple, but it has weaker persistence properties than Pi:

1. A long run is durable only after the run returns, except for run logs.
2. Session messages and execution history are stored as one rewritten JSON document.
3. Branching and compaction would require invasive changes to the Session object and store schema.
4. Context reconstruction is implicit in `session.messages`, not an explicit persistence operation.

## Target Direction

Rowan should adopt Pi's implementation shape:

1. Make `Agent` primarily an in-memory reducer over AgentEvents and loop results.
2. Move durable Session persistence to an append-only Session Manager.
3. Treat model-visible context reconstruction as a Session Manager operation.
4. Keep Agent loop ordering, Tasks, Threads, and Outcomes in `packages/agent`.
5. Keep Session files, leaf/branch behavior, compaction, and append semantics out of `packages/agent`.

In Rowan terms:

- **Agent** owns live memory and run lifecycle.
- **Agent loop** owns route / plan / execute / verify ordering and produces an Outcome.
- **Session Manager** owns durable Session entries and reconstructs AgentContext for a selected leaf.
- **AgentStore** either becomes the Session Manager interface or is replaced by it.
- **Run log** remains observability only.

## Proposed Rowan Design

### 1. Introduce A Session Manager Module

Create a deep Session Manager Module in `packages/session` or `packages/store`.

Recommended package ownership:

- `packages/session` owns Session entry types and context reconstruction.
- `packages/store` owns filesystem adapters if persistence stays split by package.

The Interface should be Pi-shaped:

```ts
type SessionManager = {
  getSessionId(): string;
  getSessionFile(): string | undefined;
  appendMessage(message: AgentMessage): Promise<string>;
  appendOutcome(outcome: Outcome): Promise<string>;
  appendExecutionTurn(turn: ExecutionTurn): Promise<string>;
  appendCompaction(input: CompactionInput): Promise<string>;
  branch(entryId: string): Promise<void>;
  buildAgentContext(input?: { leafId?: string; tools?: Tool[]; skills?: Skill[] }): Promise<AgentContext>;
  listEntries(): Promise<SessionEntry[]>;
};
```

The Implementation should use JSONL entries:

```ts
type SessionEntry =
  | { type: "message"; id: string; parentId: string | null; timestamp: string; message: AgentMessage }
  | { type: "outcome"; id: string; parentId: string | null; timestamp: string; outcome: Outcome }
  | { type: "execution_turn"; id: string; parentId: string | null; timestamp: string; turn: ExecutionTurn }
  | { type: "compaction"; id: string; parentId: string | null; timestamp: string; summary: string; firstKeptEntryId: string }
  | { type: "branch_summary"; id: string; parentId: string | null; timestamp: string; fromId: string; summary: string }
  | { type: "session_info"; id: string; parentId: string | null; timestamp: string; title: string }
  | { type: "custom"; id: string; parentId: string | null; timestamp: string; customType: string; data: unknown };
```

Execution entries are durable history but are not automatically projected into conversation context. `buildAgentContext()` decides which entry types become model-visible messages.

### 2. Change Agent To Pi-Style Live Memory

Refactor Rowan `AgentState` toward live state:

```ts
type AgentState = {
  sessionId?: string;
  context: AgentContext;
  model: ModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentResult?: AgentRunResult;
  error?: string;
};
```

The Agent should keep a current `AgentContext` and reduce loop events into memory. It should not be responsible for saving or loading durable Sessions.

Recommended changes:

- Replace `state.session` with `state.sessionId` plus live `context`.
- Remove Session persistence assumptions from `AgentRunConfig`.
- Keep `sessionId` as an identifier forwarded through the loop and provider adapters.
- Let the composition root provide the initial `context`, usually from `SessionManager.buildAgentContext()`.
- Let event listeners or the composition root append messages and execution entries to Session Manager.

This mirrors Pi: Agent memory is useful for UI and control flow, while durable Session state is external.

### 3. Make Agent Loop Return Run Output, Not Durable Session State

Refactor `runAgentLoop()` so the durable Session aggregate is no longer its output.

Instead of returning:

```ts
{ kind: "session", session, outcome, limitUsage, depth }
```

return:

```ts
{
  kind: "session";
  sessionId: string;
  messages: AgentMessage[];
  outcome: Outcome;
  limitUsage: AgentLimitUsage;
  depth: RuntimeDepth;
}
```

The loop may still maintain an in-run context and emit messages. It should not require a durable Session object to exist in memory. For Threads, return the child `sessionId`, messages, Outcome, and depth metadata.

This keeps Rowan's Agent loop semantics but follows Pi's key split: loop returns produced messages and run result; persistence chooses how to append them.

### 4. Move CLI Persistence To Streaming Append

Change the CLI from end-of-run whole-state save to append-as-events persistence.

Current flow:

1. Load Session JSON.
2. Build Agent with `session`.
3. Collect steps in memory.
4. Save Session after run.
5. Append steps after run.

Target Pi-style flow:

1. Open or create `SessionManager`.
2. Build initial `AgentContext` from the current leaf.
3. Subscribe a persistence listener to Agent events.
4. Append user, assistant, tool, execution, and Outcome entries as they occur.
5. Use `buildAgentContext()` for the next turn.

This narrows the crash window and makes interactive Sessions durable turn by turn.

### 5. Preserve Rowan-Specific Semantics

Adopting Pi's implementation shape should not flatten Rowan's domain model.

Keep:

- `ContextScope` rules for conversation, execution, and diagnostic content;
- `ExecutionTurn` as phase-level driver history;
- `Task`, `Thread`, and `Outcome` as Rowan concepts;
- Agent loop route / plan / execute / verify ordering;
- Runtime glue ownership of tools and skills;
- provider adapters as the provider-output normalization seam.

Change only the memory and persistence shape:

- live state belongs to Agent;
- durable append-only entries belong to Session Manager;
- model-visible context is reconstructed explicitly from the selected Session branch.

## Migration Plan

### Phase 1: Add Append-Only Session Manager Beside Current Store

Add JSONL Session Manager tests first:

- creates a header and appends message entries;
- reconstructs AgentContext from the current leaf;
- excludes execution entries from conversation context by default;
- appends `ExecutionTurn` entries without rewriting old entries;
- supports branch by moving the leaf;
- lists Sessions by latest activity.

Keep `LocalJsonAgentStore` during this phase.

### Phase 2: Teach CLI To Use Session Manager For New Sessions

For fresh CLI runs:

- create a JSONL Session;
- append the initial user message before calling Agent;
- build context from Session Manager;
- append assistant messages and Outcome during event handling;
- append `ExecutionTurn` entries as soon as the Agent loop produces them.

Existing `.json` Sessions continue to load through the old store.

### Phase 3: Convert Agent To Live Memory Only

Refactor `Agent` so `state.session` disappears from the public state surface.

Tests should prove:

- multi-turn Agent memory still works;
- async listeners are still awaited correctly;
- abort and error handling still produce live state;
- a Session Manager can persist a run entirely through public Agent events and run output.

### Phase 4: Refactor `runAgentLoop()` Input And Output

Move loop input from durable Session objects to:

- `sessionId`;
- `AgentContext`;
- thread metadata;
- runtime config.

Move loop output from durable Session to produced messages plus Outcome.

Tests should prove:

- direct, task, thread, retry, limit, and verification behavior remains unchanged;
- `ExecutionTurn.sessionId` is stable;
- child Thread Sessions can be opened and reconstructed through Session Manager.

### Phase 5: Migrate Or Bridge Old Session Files

Add one of two compatibility paths:

1. Read old `<session-id>.json` files and export them into new JSONL files on first load.
2. Keep a read-only legacy adapter and write all new activity to JSONL.

Prefer migration-on-load once the JSONL Session Manager has enough coverage.

## Recommended Final Shape

```text
CLI / composition root
  -> SessionManager.open/create()
  -> SessionManager.buildAgentContext()
  -> Agent.run(context)
  -> persistence listener appends SessionEntry JSONL

Agent
  -> live memory reducer
  -> event fanout
  -> cancellation and run lifecycle

Agent loop
  -> route / plan / execute / verify
  -> Thread creation
  -> Outcome
  -> produced messages and ExecutionTurns

Session Manager
  -> append-only JSONL tree
  -> leaf and branch
  -> compaction and summaries
  -> AgentContext reconstruction
```

This uses Pi's implementation style while preserving Rowan's domain split. The main improvement is Depth: durable Session behavior becomes one deep Module with a small Interface, while Agent becomes a smaller live-memory Module with better locality.
