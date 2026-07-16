# Durable Multi-Agent Runtime

Status: Proposed

## Problem Statement

Rowan currently exposes an in-memory `Agent` whose caller directly constructs the loop, supplies persistence callbacks, and manages `LocalJsonlSessionManager` separately. Embedders therefore need host objects such as EverYield's `AgentHost` to restore Session context, append messages and outcomes, continue suspended input, observe failures, and coordinate cancellation.

Runtime work is currently coupled to the host process. Embedders need durable Agent lifecycle, scheduling, suspension, recovery, and Tool control without introducing a second orchestration model.

Rowan needs an embedded, durable Runtime behind the `Agent` SDK. It must preserve direct SDK integration while making construction uniform, allowing Agents to execute independently, and supporting long-running scheduling and structured parent-child result delivery.

## Goals

1. Make Rowan own Agent lifecycle hosting so callers no longer implement an `AgentHost` equivalent.
2. Introduce uniform asynchronous `Agent.create()`, `Agent.resume()`, and `Agent.send()` entrypoints.
3. Give every Agent an opaque Rowan-generated Agent ID, one Session, one Mailbox, and at most one active Agent Run.
4. Let different Agents run concurrently without coupling their Agent Runs.
5. Persist Runtime Messages, Agent Runs, leases, control state, Runtime Events, and Tool Calls for recovery.
6. Resume suspended Runs after human input without retaining scheduler or model capacity while waiting.
7. Restore unfinished Agents after process restart through host-provided Agent Factories.
8. Centralize Tool permission enforcement, rate limiting, abort, and uncertain-side-effect handling.
9. Keep Rowan independent of host business concepts.

## Non-Goals

- Running Agents after the host process exits. A daemon or remote control plane is not part of this release.
- Defining a Workflow Runtime, Workflow DSL, graph, compensation model, or business scheduler.
- Implementing Agent Memory. Hosts supply model-facing Context, and Sessions retain conversation history.
- Supporting arbitrary Agent-to-Agent chat, custom message types, or user-defined routing rules.
- Guaranteeing exactly-once external side effects.
- Supporting multiple independent Runtime instances in one process.
- Preserving the public `new Agent()` lifecycle as a second construction path.

## Solution Overview

The host explicitly starts one Rowan Runtime per process. `Agent.create()` creates a new Agent ID and Session, persists its Runtime record, and binds the returned in-memory Agent object internally. `Agent.resume()` reconstructs a new in-memory object, restores the existing Session, and rebinds the original Agent ID.

`Agent.send()` persists Agent Input and returns an `AgentRun` handle immediately. The Scheduler runs at most one Agent Run per Agent while allowing multiple Agents to run concurrently.

```text
Host
  -> Agent.send(input)
  -> Message and Agent Run persisted
  -> AgentRun handle returned

Scheduler
  -> leases runnable Agent
  -> executes one Agent Run
  -> persists suspension or terminal Outcome

```

## Public SDK

```ts
await AgentRuntime.start({
  stateStore,
  sessionManager,
  factories,
  toolPolicy,
});

const agent = await Agent.create(options);

const resumed = await Agent.resume({
  ...options,
  sessionId: agent.sessionId,
});

const run = await agent.send(input);
const outcome = await run.result();
```

`AgentRun` exposes its ID and current state, supports Runtime and Stream Event subscription, waits for a terminal Outcome through `result()`, and can abort its specific Run. `runWithUserInput()` may remain as a convenience implemented by `send()` followed by `result()`; it must not remain an independent execution path.

The Runtime must be explicitly started before Agent creation. A second Runtime start in the same process fails, and Rowan must not silently create a non-durable default Runtime.

## Domain Invariants

- Rowan generates every Agent ID; hosts never encode business identity into it.
- One Agent owns exactly one Session and Mailbox.
- One Agent has at most one running or suspended Agent Run.
- Different Agents may run concurrently within configured capacity limits.
- One Agent ID has at most one live Agent Binding.
- Agent ID is the only Runtime Message address; Session ID is never used for scheduling or delivery.
- `Agent.resume()` preserves both the Agent ID and Session ID while replacing the in-memory object.
- Only Runtime Messages make Agents runnable.
- Runtime Commands may preempt a Run but never enter its Mailbox or Session.
- Runtime control decisions use Runtime State, never Context or Session inference.

## Sessions and Context

Session Manager continues to own JSONL conversation records. A Session contains messages, model transcripts, outcomes, and the information needed to rebuild model-visible conversation context, but it does not own mailbox, scheduling, delivery, or business state.

`Agent.resume()` continues writing to the original Session ID. The caller or Agent Factory supplies current model, System Prompt, Tools, Skills, Phases, and host Context; Rowan does not serialize executable definitions or pin a definition version in the Session.

## Agent and Factory Registries

The live Agent Registry is private to the Runtime. Successful Agent creation or resume automatically binds the in-memory object by Agent ID; there is no public `bind()` or `registerAgent()` lifecycle step.

The durable Agent record contains at least Agent ID, Session ID, opaque Factory ID, lifecycle state, and timestamps. Hosts register Factories by Factory ID during Runtime startup. Rowan treats Factory IDs and Agent IDs as opaque and does not inspect their business meaning.

On restart, the Runtime uses Factory ID to request current Agent construction options, reconstructs the Agent, restores the original Session, and binds the new object to the original Agent ID. The host stores its own business-object-to-Agent-ID associations. A missing Factory or host association leaves the Agent unbound and emits an actionable Runtime Event rather than guessing.

## Runtime Messages

The Mailbox supports only fixed Runtime-owned envelopes:

1. Agent Input, which starts a new Agent Run or resumes the Agent's suspended Run.

There is no custom message-type registry, target policy language, or generic model-facing message Tool. Calling `send()` on an Agent creates Agent Input for that Agent; completion is observed through the returned handle and Runtime Events.

## Scheduling and Delivery

The Scheduler selects only work already present in Mailboxes. It may decide ordering, fairness, capacity, lease acquisition, lease renewal, and infrastructure retry timing. It must not inspect business payloads, select Workflows, decide Task completion, or choose communication targets.

Delivery is at least once. Runtime Messages have stable IDs and are deduplicated through durable inbox state. A completed Agent Run is never executed again merely because delivery is retried. The exact cross-Agent fairness algorithm is an implementation choice, but it must preserve per-Agent ordering and prevent one busy Agent from monopolizing all configured capacity.

Retry is limited to errors classified as retryable infrastructure failures, such as a lost execution process, transient model transport failure, or temporary Runtime Store failure. Agent failure Outcomes, definite Tool failures, cancellation, business failure, and indeterminate Tool Calls are terminal or recovery states rather than automatic retries. Exhausted infrastructure retries fail the Run, dead-letter the triggering Message, and return a failure Outcome to its caller or parent Agent.

## Suspension and Runtime Commands

When an Agent requests input, its Agent Run becomes suspended, releases its lease and execution capacity, persists its correlation state, and emits an input-requested Runtime Event. The next `send()` to that Agent resumes the same Agent Run rather than creating a second Run.

Pause, resume, and abort are preemptive Runtime Commands. They bypass normal Mailbox order, do not become model-visible conversation messages, and produce durable Runtime Events. Business cancellation remains host-owned and may invoke Runtime abort after updating business state.

## Events

Runtime Events are low-frequency durable facts required for recovery, delivery, or lifecycle observation. They are written transactionally with Runtime State and delivered through an outbox-capable subscription.

Stream Events remain transient observations for live UI and logging, including model deltas, message updates, and partial Tool output. Existing `Agent.subscribe()` behavior may continue for Stream Events; Stream Events are not replayed and cannot change control state.

The existing Extension `EventBus` remains an in-process inter-extension channel. It is not the durable Runtime Event stream, does not make Agents runnable, and must not be used as a recovery source.

## Tool Runtime

Tools supplied during Agent construction define the Agent's maximum Tool Capability set. Runtime policy may narrow this set but cannot add capabilities. Prompt content, model output, and Runtime Messages cannot expand Tool access.

Every Tool Call passes through the Rowan Tool Runtime for permission checks, concurrency and rate limits, abort propagation, and durable call-state recording. Tool implementations remain adapters supplied by Rowan or the host. A call whose side effect may have occurred without a durable terminal result becomes indeterminate and requires recovery or human resolution instead of blind retry.

## Persistence

Conversation Sessions remain JSONL. Runtime State uses a separate embedded SQLite store, with an in-memory adapter providing the same behavioral contract for tests.

The durable model includes Agents, Runtime Messages, Agent Runs, leases, Runtime Events/outbox delivery, and Tool Calls. Physical schema details may evolve, but state transitions that enqueue work, complete Runs, and enqueue Parent completion must be transactional.

The host chooses the Runtime Store location. A typical embedder may use one global runtime database while retaining separate business databases; Rowan never joins or interprets those business stores.

## Functional Requirements

1. `AgentRuntime.start()` starts exactly one Runtime for the current process and validates all required adapters.
2. `Agent.create()` asynchronously creates an Agent ID, Session, durable Agent record, and private live binding.
3. `Agent.resume()` requires an existing Session and Agent record, restores the same IDs, and rejects duplicate live binding.
4. Public direct `new Agent()` construction is removed or made internal.
5. Session persistence callbacks and restoration currently implemented by embedders move behind Rowan's Agent lifecycle.
6. `Agent.send()` durably enqueues Agent Input and creates or resumes an Agent Run before returning its handle.
7. `AgentRun.result()` resolves only for a terminal Outcome and survives process-local scheduling delays.
8. One Agent never executes two Runs concurrently.
9. Multiple Agents execute concurrently up to configured Runtime limits.
10. Suspended Runs release capacity and resume through the next Agent Input.
11. Runtime Commands preempt queued or active work according to their control semantics.
12. Runtime Messages are delivered at least once and deduplicated by stable identity.
13. Scheduler retries only classified infrastructure failures and dead-letters exhausted work.
14. Factory recovery uses opaque Agent and Factory IDs without Session-ID pattern matching.
15. Factory recovery uses current host configuration and never serializes executable Agent definitions.
16. Runtime control state and Session conversation state remain logically and physically separate.
17. Runtime Events needed for recovery are durable; Stream Events remain transient.
18. Every Tool Call is authorized and observed by Tool Runtime before adapter execution.
19. Indeterminate Tool Calls cannot be automatically retried.
20. Runtime shutdown leaves persisted work in a recoverable state for the next startup.
21. The Runtime executes no work while the host process is not alive.
22. Rowan runtime code contains no Team, Project, Task, Workflow, or Memory model.

## Acceptance Criteria

- An embedder can create, run, suspend, resume, abort, and restore an Agent without an external AgentHost.
- Two Agents can execute concurrently while two Runs for the same Agent cannot.
- Killing and restarting the host leaves queued and suspended work recoverable through registered Factories.
- Re-delivering a completed Message does not re-run the completed Agent Run.
- A Tool Call interrupted after a potentially completed side effect becomes indeterminate rather than executing again.
- Existing Session conversations resume under their original Session IDs with current caller-provided capabilities.
- Tests exercise behavior through public Runtime, Agent, AgentRun, Session, Event, and Tool seams rather than private scheduler helpers.

## Migration

This work is released as a breaking Rowan SDK version. Rowan CLI migrates to explicit Runtime startup and the new Agent lifecycle. Existing low-level loop code may remain internal to Agent Runtime, but embedders migrate from direct construction and persistence callbacks to `Agent.create()` / `Agent.resume()`.

EverYield migration is a downstream project: it will replace `AgentHost` and Session-ID-based runtime addressing with the new Rowan public seams while keeping EverYield Workflow and business state in EverYield.
