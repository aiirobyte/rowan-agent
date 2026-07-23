# Rowan Agent Runtime

Rowan Agent Runtime hosts durable, independently scheduled Agents inside one application process. It owns execution continuity and reliable observation without learning host Project, Task, Workflow, hierarchy, or routing models.

## Identity and configuration

**Agent**:
A durable runtime identity with ordered Agent Runs, canonical conversation history, immutable metadata, and one current Agent Configuration. An Agent is not a process-local object.
_Avoid_: Worker, Bot, Agent process, Agent Binding

**Agent ID**:
The opaque identity Rowan assigns to an Agent for input, scheduling, configuration lookup, and observation.
_Avoid_: Session ID, Project Agent ID, business identity

**Agent Metadata**:
Opaque immutable host data stored with an Agent and made available to configuration adapters and read models. Rowan transports it without interpreting its schema.
_Avoid_: Agent Configuration, business state

**Agent Configuration**:
The executable model, Context resources, hooks, and policies used by an Agent.
It includes a host-defined stable identity because Rowan cannot compare
closures. Hosts update it through the Runtime, while a configuration adapter
preserves immutable snapshots that Rowan can resolve after restart.
_Avoid_: Agent Options, Agent Binding, serialized Agent

**Configuration Snapshot**:
An immutable, restart-resolvable version of one Agent Configuration. A Run waiting for input remains attached to the snapshot that created its Execution Checkpoint.
_Avoid_: Caller revision, ConfigRef, mutable current config

## Conversation

**Agent Input**:
JSON-safe user content accepted to create an Agent Run or answer an Input Request. Queued input is durable but is not a Canonical Message until its Run first begins execution.
_Avoid_: Command, Runtime Message, arbitrary Agent Message

**Canonical Message**:
An immutable Rowan-generated Message in an Agent's durable conversation history. Its identity, provenance, and ordering are Runtime-owned.
_Avoid_: Pending input, Stream Event, mutable transcript entry

**Model Context**:
The execution-local projection built from Canonical Messages and the current Agent Configuration. Compaction and Phase-local prompts may change this projection without rewriting canonical history.
_Avoid_: Runtime State, Session, canonical transcript

## Execution

**Agent Run**:
A durable FIFO processing request created from Agent Input. It may be queued, running, waiting for input, or terminal, and it can have multiple Execution Attempts separated by Input Requests.
_Avoid_: Job, Workflow Run, Turn Promise

**Execution Attempt**:
One fenced period in which the Scheduler claims an Agent Run and executes it until an input or terminal boundary.
_Avoid_: Worker, Lease, Agent process

**Input Request**:
A durable one-shot request for more Agent Input, linked to one prompt Message and one Execution Checkpoint. Its ID is the idempotency identity of its answer.
_Avoid_: Suspension Promise, pending callback, resume token

**Execution Checkpoint**:
Opaque durable state produced by the execution loop at an Input Request and consumed by a later Execution Attempt under the same Configuration Snapshot.
_Avoid_: Session State, continuation object, Consumer Checkpoint

**Run Boundary**:
The stable observable result of reaching either an Input Request or a terminal Run state.
_Avoid_: Stream Event, Promise rejection

**Outcome**:
The successful terminal result of a completed Agent Run.
_Avoid_: Run Failure, Runtime Error, Event

**Run Failure**:
A durable machine-readable explanation for a failed Agent Run.
_Avoid_: Runtime Error, thrown command error, Outcome

**Run Cancellation**:
A terminal decision that prevents further execution of one Agent Run. Cancelling input that has never begun execution does not add it to canonical conversation history.
_Avoid_: Agent pause, business cancellation

## Runtime coordination

**Scheduler**:
The Runtime policy that selects durable, ready Agent Runs while preserving per-Agent FIFO and configured concurrency. It never chooses business work or communication targets.
_Avoid_: Workflow orchestrator, Router, in-memory queue

**Runtime Owner**:
The single live Runtime permitted to mutate one Durable Store. Ownership is time-bounded so an expired owner can be fenced and replaced after process loss.
_Avoid_: Run worker, Agent Binding, permanent lock

**Recovery**:
Re-establishing Runtime ownership, sealing abandoned Execution Attempts, and continuing queued or input-waiting Runs from Durable Store state.
_Avoid_: Agent Reconstruction, Session resume, continuation revival

## State and events

**Runtime State**:
The authoritative durable state for Agent identity, Run scheduling, canonical history, execution checkpoints, Tool Calls, ownership, idempotency, and reliable event delivery.
_Avoid_: Model Context, Session, Memory

**Durable Run Event**:
An immutable replayable fact committed atomically with the Run aggregate change it describes.
_Avoid_: Agent Input, Transient Run Event, command

**Transient Run Event**:
A lossy live observation such as a Message delta or Tool progress update. It is never authoritative for control flow or recovery.
_Avoid_: Durable Run Event, Canonical Message

**Run Metadata**:
Opaque immutable host correlation data stored with one Agent Run and echoed on its Durable Run Events.
_Avoid_: Agent Metadata, business state, Outcome payload

**Event Consumer**:
A stable delivery identity that receives Durable Run Events serially within one
active delivery loop and owns an independent Consumer Checkpoint. Delivery is
at-least-once; an uncooperative callback may overlap a new owner after
takeover, so side effects use Event ID idempotency.
_Avoid_: Stream subscriber, Extension listener

**Consumer Checkpoint**:
The last contiguous Durable Run Event cursor successfully processed by one Event Consumer.
_Avoid_: Execution Checkpoint, global acknowledgement

**Event Cursor**:
An opaque Durable Store position used for snapshot-to-observation handoff and replay.
_Avoid_: Array index, timestamp, caller-computed sequence

## Tools

**Tool Capability**:
A Tool available in an Agent's Configuration Snapshot and current Model Context. Phase and Runtime policy may narrow it but cannot invent it.
_Avoid_: Prompt permission, Tool request

**Tool Call**:
A durable Runtime-controlled attempt to invoke one Tool Capability for one
Execution Attempt. Its Rowan ID is canonical and fences persistence and
external idempotency; a stored provider correlation maps both Tool-use and
Tool-result blocks only at the Model Context boundary.
_Avoid_: Shell command, Tool Event

**Indeterminate Tool Call**:
A Tool Call whose external effect may have happened but whose determinate result was not durably committed. It terminates the Run and is never retried automatically.
_Avoid_: Failed Tool Call, retryable error
