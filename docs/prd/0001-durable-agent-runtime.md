# Durable Multi-Agent Runtime

Status: Implemented

## Problem Statement

Rowan currently exposes an in-memory `Agent` whose caller directly constructs the loop, supplies persistence callbacks, and manages `LocalJsonlSessionManager` separately. Embedders therefore need host objects such as EverYield's `AgentHost` to restore Session context, append messages and outcomes, continue suspended input, observe failures, and coordinate cancellation.

Runtime work is currently coupled to the host process. Embedders need durable Agent lifecycle, scheduling, suspension, recovery, and Tool control without introducing a second orchestration model.

Rowan needs an embedded, durable Runtime behind the `Agent` SDK. It must preserve direct SDK integration while making construction uniform, allowing Agents to execute independently, and supporting long-running scheduling and durable result delivery.

## Goals

1. Make Rowan own Agent lifecycle hosting so callers no longer implement an `AgentHost` equivalent.
2. Introduce one asynchronous lifecycle through `AgentRuntime.createAgent()`, `AgentRuntime.reconstructAgent()`, `Agent.send()`, and `AgentRun`.
3. Give every Agent an opaque Rowan-generated Agent ID, one Session, one Mailbox, and at most one active Agent Run.
4. Let different Agents run concurrently without coupling their Agent Runs.
5. Persist Runtime Messages, Agent Runs, leases, control state, Runtime Events, and Tool Calls for recovery.
6. Resume suspended Runs after human input without retaining scheduler or model capacity while waiting.
7. Restore unfinished Agents after process restart when hosts reconstruct their Bindings with current Agent Options.
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

The host explicitly starts one Rowan Runtime per process. `runtime.createAgent()` creates a new Agent ID and Session, persists its Runtime record, and binds the returned in-memory Agent object internally. `runtime.reconstructAgent()` requires an existing Agent ID, restores its Session, and replaces its live Agent Binding using current Context.

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
const runtime = await AgentRuntime.start({
  stateStore,
  sessionProvider,
  toolPolicy,
});

const agent = await runtime.createAgent(options);

const reconstructed = await runtime.reconstructAgent(agent.id, options);

const run = await agent.send(input);
const outcome = await run.result();
```

`AgentRun` exposes its ID and current state, waits for a terminal Outcome through `result()`, observes Run changes, and can abort its specific Run. Transient Stream Events remain available from Agent subscription. Durable Runtime Events are delivered through stable Runtime Event Consumer identities with independent Checkpoints.

The Runtime must be explicitly started before Agent creation. A second Runtime start in the same process fails, Rowan does not expose ambient lifecycle access, and it never creates a non-durable default Runtime.

## Domain Invariants

- Rowan generates every Agent ID; hosts never encode business identity into it.
- One Agent owns exactly one Session and Mailbox.
- One Agent has at most one running or suspended Agent Run.
- Different Agents may run concurrently within configured capacity limits.
- One Agent ID has at most one live Agent Binding.
- Agent ID is the only Runtime Message address; Session ID is never used for scheduling or delivery.
- Agent reconstruction preserves both the Agent ID and Session ID while replacing the Agent Binding.
- Agent ID is the only reconstruction address; Session ID never selects or adopts Runtime identity.
- Only Runtime Messages make Agents runnable.
- Runtime Commands may preempt a Run but never enter its Mailbox or Session.
- Runtime control decisions use Runtime State, never Context or Session inference.

## Sessions and Context

Session Manager continues to own JSONL conversation records. A Session contains messages, model transcripts, outcomes, and the information needed to rebuild model-visible conversation context, but it does not own mailbox, scheduling, delivery, or business state.

Agent reconstruction continues writing to the original Session ID. The caller supplies current model, System Prompt, Tools, Skills, Phases, and host Context through `currentOptions`; Rowan does not serialize executable definitions or pin a definition version in the Session.

## Agent Registry and Reconstruction

The live Agent Registry is private to the Runtime. Successful Agent creation or reconstruction automatically binds the in-memory object by Agent ID; there is no public `bind()` or `registerAgent()` lifecycle step.

The durable Agent record contains Agent ID, Session ID, lifecycle state, and timestamps. Agent Options remain process-local because they may contain executable model, Tool, Phase, Extension, and callback definitions; Rowan does not persist or infer them.

On restart, the Runtime recovers abandoned Leases into durable queued work without synthesizing Agent Bindings. The host calls `reconstructAgent(agentId, currentOptions)` for an Agent it can currently construct; reconstruction restores the original Session and establishes the Binding under the original Agent ID. Establishing an active Binding automatically schedules that Agent's queued Runs. A suspended Agent may remain unbound until the host has new input, then reconstruct before `send()` resumes the same Run.

## Runtime Messages

The Mailbox supports only fixed Runtime-owned envelopes:

1. Agent Input, which starts a new Agent Run or resumes the Agent's suspended Run.

There is no custom message-type registry, target policy language, or generic model-facing message Tool. Calling `send()` on an Agent creates Agent Input for that Agent; completion is observed through the returned handle and Runtime Events.

## Scheduling and Delivery

The Scheduler selects only work already present in Mailboxes. It may decide ordering, fairness, capacity, lease acquisition, lease renewal, and infrastructure retry timing. It must not inspect business payloads, select Workflows, decide Task completion, or choose communication targets.

Delivery is at least once. Runtime Messages have stable IDs and are deduplicated through durable inbox state. A completed Agent Run is never executed again merely because delivery is retried. The exact cross-Agent fairness algorithm is an implementation choice, but it must preserve per-Agent ordering and prevent one busy Agent from monopolizing all configured capacity.

Retry is limited to errors classified as retryable infrastructure failures, such as a lost execution process, transient model transport failure, or temporary Runtime Store failure. Agent failure Outcomes, definite Tool failures, cancellation, business failure, and indeterminate Tool Calls are terminal or recovery states rather than automatic retries. Exhausted infrastructure retries fail the Run, dead-letter the triggering Message, and return a failure Outcome to its caller or parent Agent.

## Suspension and Runtime Commands

When an Agent requests input, its Agent Run becomes suspended, releases its lease and execution capacity, persists its correlation state, and emits a `run_suspended` Runtime Event. The next `send()` to that Agent resumes the same Agent Run rather than creating a second Run.

Pause, resume, and abort are preemptive Runtime Commands. Pause gates queued work without cancelling a currently executing Run; resume removes that gate; abort terminates one precise Run. These commands bypass normal Mailbox order, do not become model-visible conversation messages, and produce durable Runtime Events. Business cancellation remains host-owned and may invoke Runtime abort after updating business state.

## Events

Runtime Events are low-frequency durable facts required for recovery, delivery, or lifecycle observation. They are written transactionally with Runtime State and delivered asynchronously to stable Runtime Event Consumers, so a slow consumer cannot block a state transition. Each consumer owns a contiguous durable Checkpoint that advances only after successful ordered delivery; one consumer cannot acknowledge an Event for another or skip an undelivered Event.

Stream Events remain transient observations for live UI and logging, including model deltas, message updates, and partial Tool output. Existing `Agent.subscribe()` behavior may continue for Stream Events; Stream Events are not replayed and cannot change control state.

The existing Extension `EventBus` remains an in-process inter-extension channel. It is not the durable Runtime Event stream, does not make Agents runnable, and must not be used as a recovery source.

## Tool Runtime

Tools supplied during Agent creation or reconstruction define the Agent's maximum Tool Capability set. Runtime policy may narrow this set but cannot add capabilities. Prompt content, model output, and Runtime Messages cannot expand Tool access.

Every Tool Call passes through the Rowan Tool Runtime for permission checks, concurrency and rate limits, abort propagation, and durable call-state recording. Tool implementations remain adapters supplied by Rowan or the host. A call whose side effect may have occurred without a durable terminal result becomes indeterminate and requires recovery or human resolution instead of blind retry.

## Persistence

Conversation Sessions remain JSONL. Runtime State uses a separate embedded SQLite store, with an in-memory adapter providing the same behavioral contract for tests.

The durable model includes Agents, Runtime Messages, Agent Runs, leases, Runtime Events/outbox delivery, and Tool Calls. Physical schema details may evolve, but state transitions that enqueue work, complete Runs, and enqueue Parent completion must be transactional.

The host chooses the Runtime Store location. A typical embedder may use one global runtime database while retaining separate business databases; Rowan never joins or interprets those business stores.

## Functional Requirements

1. `AgentRuntime.start()` starts exactly one Runtime for the current process and validates all required adapters.
2. `AgentRuntime.createAgent(options)` asynchronously creates an Agent ID, Session, durable Agent record, and private Agent Binding without enqueuing Agent Input or creating a Run.
3. `AgentRuntime.reconstructAgent(agentId, currentOptions)` requires an existing Agent ID and Session, restores the same IDs using caller-supplied current Agent Options, establishes the private Binding, schedules existing queued Runs, and rejects a duplicate live Binding.
4. Public direct `new Agent()` construction, static Agent lifecycle factories, and direct execution methods are removed.
5. Session persistence callbacks and reconstruction currently implemented by embedders move behind the Runtime-owned Agent lifecycle.
6. `Agent.send()` durably enqueues Agent Input and creates or resumes an Agent Run before returning its handle.
7. `AgentRun.result()` resolves only for a terminal Outcome and survives process-local scheduling delays.
8. One Agent never executes two Runs concurrently.
9. Multiple Agents execute concurrently up to configured Runtime limits.
10. Suspended Runs release capacity and resume through the next Agent Input.
11. Runtime Commands preempt queued or active work according to their control semantics.
12. Runtime Messages are delivered at least once and deduplicated by stable identity.
13. Scheduler retries only explicit Infrastructure Failures, renews active Leases, and atomically dead-letters exhausted work.
14. Runtime startup recovers abandoned Leases without constructing Agent Bindings or serializing executable Agent definitions.
15. Hosts explicitly reconstruct Agent Bindings with current Agent Options; suspended Agents may defer reconstruction until new input arrives.
16. Runtime control state and Session conversation state remain logically and physically separate.
17. Runtime Events needed for recovery are durable; consumer Checkpoints advance only after successful delivery; Stream Events remain transient.
18. Every Tool Call is authorized and observed by Tool Runtime before adapter execution.
19. Indeterminate Tool Calls cannot be automatically retried.
20. Runtime shutdown leaves persisted work in a recoverable state for the next startup.
21. The Runtime executes no work while the host process is not alive.
22. Rowan runtime code contains no Team, Project, Task, Workflow, or Memory model.

## Acceptance Criteria

- An embedder can create and reconstruct an Agent, suspend and resume its Run, abort work, and restore execution without an external AgentHost.
- Two Agents can execute concurrently while two Runs for the same Agent cannot.
- Killing and restarting the host leaves queued and suspended work recoverable after the host reconstructs the Agent Binding with current Agent Options.
- Re-delivering a completed Message does not re-run the completed Agent Run.
- A Tool Call interrupted after a potentially completed side effect becomes indeterminate rather than executing again.
- Existing Agents reconstruct by Agent ID, retain their original Session IDs, and use current caller-provided capabilities.
- Tests exercise behavior through public Runtime, Agent, AgentRun, Session, Event, and Tool seams rather than private scheduler helpers.

## Migration

This work is released as a breaking Rowan SDK version. Rowan CLI migrates to explicit Runtime startup and the new Agent lifecycle. Existing low-level loop code remains internal to Agent Runtime, while embedders use `runtime.createAgent()` / `runtime.reconstructAgent()` and never own Session persistence callbacks.

EverYield migration is a downstream project: it will replace `AgentHost` and Session-ID-based runtime addressing with the new Rowan public seams while keeping EverYield Workflow and business state in EverYield.
