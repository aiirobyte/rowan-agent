## Current release baseline

**v0.13.0**

The Run Interaction API replaces Phase/Tool Call interaction names and legacy
Input Requests. Resolved interactions create records, Tools can suspend during
`execute`, and each Phase entry is durable. See
[PRD-0010](docs/prd/0010-run-interaction-and-durable-phase-entry.md) and
[release notes](docs/releases/0012-run-interaction-and-durable-phase-entry.md) for the implementation
contract and breaking-change summary.

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
A host request containing a stable identity, registered Agent Definition
reference, Resource View, Context Candidates, and Rowan-native execution
options. It contains no concrete executable resource or host business Scope.
Hosts update it through the Runtime; Rowan resolves it into an immutable
Configuration Snapshot for each new Run.
_Avoid_: Agent Options, Agent Binding, serialized Agent

**Agent Definition**:
A reusable declarative description containing an Agent's identity, authored
prompt, optional model, and named Tool, Skill, PhaseRegistry, and Context
Candidate selections. A host may also attach concrete `bundledSkills` as
private, parent-wide guidance; those values remain active after Scope Skill
selection and replace same-name Scope values. It contains no host business
scope, lifecycle operation, or executable resource closure.
_Avoid_: Agent Context, Capability Allowlist, Agent Configuration

**Resource Source**:
One host-registered, atomically replaceable set of same-kind Agent Definitions,
Tools, Skills, or Phases identified by an opaque Source ID. Registration does
not make the source visible to an Agent.
_Avoid_: Catalog, Project Source, Resource Scope

**Resource View**:
The explicit Source IDs from which Rowan may resolve non-Extension resources
for one Agent Configuration. Rowan interprets only source visibility; it does
not know why the host selected those sources.
_Avoid_: Host Scope, Candidate Bag, Global Catalog

**Resource Candidate**:
A Tool, Skill, or Phase resolved from one Resource View before declarative
Definition and Phase narrowing. Candidates are never supplied as concrete
values in an Agent Configuration.
_Avoid_: Allowed Resource, Resource Reference, Registered Capability

**Phase Bundle**:
One file Phase plus its direct child Skill values, loaded and snapshotted as a
single Phase contribution. Nested Skills have no independent Rowan Source ID or
revision; entering the Phase merges them after the active Agent Context Skills
and replaces same-name values, and Rowan does not interpret the host concept
that owns the directory.
_Avoid_: Nested Resource Registry, Workflow Bundle, Phase Dependency Graph

**Definition Layer**:
An optional declarative layer supplied with a Definition reference that may
replace the authored prompt or model and narrow Tool, Skill, and Phase selections.
It cannot add a Resource Source, Context Candidate, or executable handler.
_Avoid_: Workflow, Child Definition, Capability Grant

**Context Candidate**:
One named JSON-safe value supplied by a host in an Agent Configuration. An
Agent Definition may select it for structured System Prompt formatting without
Rowan interpreting its business schema.
_Avoid_: Agent Context, Prompt String, Memory Store

**Configuration Snapshot**:
An immutable, restart-resolvable result of resolving one Agent Configuration.
It records source revisions, selected declarations, Context values, and
source-qualified executable references. A Run waiting for input remains
attached to the snapshot that created its Execution Checkpoint.
_Avoid_: Caller revision, ConfigRef, mutable current config

**Extension**:
A Runtime-global executable module activated during bootstrap before the
Scheduler becomes ready. It is implicit in every Resource View, remains active
for the Runtime lifetime, and is never selected by a Definition or Phase.
_Avoid_: Resource Candidate, Agent Extension, Scoped Extension

**Extension State**:
State storage exposed to an Extension through `api.state`: run-scoped in-memory state (`run(runId)`), agent-scoped durable state (`agent(agentId)`), and extension-scoped durable state (`global()`) that survives process restarts and is isolated per Extension ID.
_Avoid_: Static module state, global process variables, Agent Configuration mutation

## Conversation

**Agent Input**:
JSON-safe user content accepted to create an Agent Run or answer an open Run Interaction. Queued input is durable but is not a Canonical Message until its Run first begins execution.
_Avoid_: Command, Runtime Message, arbitrary Agent Message

**Canonical Message**:
An active Rowan-generated Message in an Agent's durable conversation history.
Its identity and ordering are Runtime-owned; its active content may advance
through Message Revisions while each revision fact remains immutable.
_Avoid_: Pending input, Stream Event, mutable transcript entry

**Message Revision**:
The monotonic version of one stable Canonical Message identity. The active
history exposes the latest revision and the Durable Run Event log retains the
revision fact until retention cleanup.
_Avoid_: New Message, Branch Message, mutable Event

**History Seed**:
A validated active Model Context copied by value when creating a new Agent.
Rowan allocates new Message identities and stores no source Agent or execution
relation; a seed never creates a Run.
_Avoid_: Agent Fork Link, Run Clone, Checkpoint Import

**Model Context**:
The execution-local projection built from Canonical Messages and the Run's Configuration Snapshot. Compaction and Phase-local prompts may change this projection without rewriting canonical history.
_Avoid_: Runtime State, Session, canonical transcript

## Execution

**Agent Run**:
A durable FIFO processing request created from Agent Input. It may be queued, running, waiting for input, or terminal, and it can have multiple Execution Attempts separated by Run Interactions.
_Avoid_: Job, Workflow Run, Turn Promise

**Execution Attempt**:
One fenced period in which the Scheduler claims an Agent Run and executes it until an input or terminal boundary.
_Avoid_: Worker, Lease, Agent process

**Phase Execution**:
One invocation of a selected Phase inside an Execution Attempt, governed by the Run's Phase state, routing, Execution Checkpoint, and Run Interaction Driver. It is not an independent durable Tool Call and has no Tool-style automatic retry contract.
_Avoid_: Tool Call, Phase Job, Generic Invocation

**Phase Status**:
A transient consumer-facing update emitted by a Phase without entering the
Conversation transcript. Its arbitrary `kind` identifies the business status;
its lifecycle `state` is explicitly `running` for in-progress work or
`completed` for the final update. Every status update must provide its state.
_Avoid_: Conversation Message, Run State, Tool Progress

**Run Interaction**:
A durable interaction boundary belonging to a Run. A Phase, Tool hook, or Tool execution may request it; its opaque JSON answer resolves it, Agent Input can reply to all open interactions, and cancellation closes it. A resolved interaction creates an Interaction Record.
_Avoid_: Phase Interaction, Tool Call Interaction, Input Request, ACP Message, Prompt String

**Run Interaction Driver**:
The execution-scoped Rowan capability through which a Phase or Tool requests interactions, reads resolved answers, checkpoints continuation state, suspends, and observes cancellation. It is protocol-neutral and does not know Providers, processes, or host business domains.
_Avoid_: Phase Interaction Driver, ACP Client, Provider Adapter, Tool Registry

**Settings Definition**:
A JSON-safe, host-neutral declaration registered by an extension as a declarative UI contribution through `api.ui.contribute({ slot: "settings", ... })`. Rowan collects the contribution but does not render the definition or interpret its domain fields; the host owns presentation and persistence through the extension's config block.
_Avoid_: ACP Settings page, host-specific configuration model

**Interaction Record**:
A structured Canonical Message that records a resolved Run Interaction. The Model Context renders its declared result template or Rowan's default; records raised by a Tool Call are folded into that Tool result.
_Avoid_: Phase Interaction answer message, user answer message

**Phase Suspension**:
A durable execution boundary produced by a Phase or Tool when it cannot continue until one or more Run Interactions are resolved. It stores JSON-safe continuation data and resumes through a new Execution Attempt; it never serializes a JavaScript closure. Suspended Tools re-execute with answers and checkpoint data; cancellation prevents their execution.
_Avoid_: Suspended Promise, Callback Handle, Automatic Retry

**Execution Checkpoint**:
Opaque durable state produced by the execution loop at an input boundary and consumed by a later Execution Attempt under the same Configuration Snapshot.
_Avoid_: Session State, continuation object, Consumer Checkpoint

**Run Boundary**:
The stable observable result of reaching either an input-required Run Interaction state or a terminal Run state.
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

**Runtime Readiness**:
The boundary reached after startup Resource Sources and executable handlers are
registered, global Extensions are activated and frozen, and recovery bindings
are available. The Scheduler cannot claim a Run before this boundary.
_Avoid_: Runtime Ownership, Extension Loaded Event, Host Reconciliation

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
An immutable replayable fact committed atomically with the Run aggregate change it describes. `phase_entered` records each Phase visit; `RunSnapshot.currentPhaseId` exposes the last entered Phase.
_Avoid_: Agent Input, Transient Run Event, command

**Transient Run Event**:
A lossy live observation such as a Message delta or transient Tool state update (e.g. progress). It is never authoritative for control flow or recovery.
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

**Tool Presentation**:
A pure description function executed across tool call states (`pending`, `in_progress`, progress reports via `reportProgress`, and `completed` / `failed`). Updates are merged via `mergeToolCall` (replacing specified fields, merging `_meta` per top-level key). Tool definition `_meta` is preserved untouched for hosts. Presentation failures fall back to default presentation without failing the tool call.
_Avoid_: Provider Activity, Tool Formatting Adapter, Imperative Presentation Hook

**Tool Progress**:
A structured progress report emitted by a running Tool via `context.reportProgress(progress: ToolProgress)`. It follows the standard MCP `notifications/progress` shape (`progress: number`, optional `total`, `message`, and `_meta`). Numbers must be finite; invalid shapes are dropped with a warning without failing the tool. Tool-private progress data lives under `_meta` keys, and continuous output must be reported cumulatively (e.g. a tail) because transient updates coalesce per `toolCallId`.
_Avoid_: Free-form progress JSON, uncoalesced stream deltas

**Tool Invocation Options**:
Per-call options (`ToolCallOptions`) provided when calling `ProviderCallContext.tools.call(name, args, options?)`. Rowan supports per-call cancellation via `signal` (settling only that tool call as failed without aborting the Run) and continuous execution observation via `onUpdate` (receiving the merged `ToolCall` on every state change: start, progress-driven `present` updates, and completion/failure; the raw `ToolProgress` is passed when triggered by a progress report).
_Avoid_: Run-level abort for single tool failure, polling tool state

**Indeterminate Tool Call**:
A Tool Call whose external effect may have happened but whose determinate result was not durably committed. It terminates the Run and is never retried automatically.
_Avoid_: Failed Tool Call, retryable error

**Run Interaction**:
A durable interaction requested by a Phase, Tool hook, or Tool execution. It uses the Run Interaction Driver and commits an Interaction Record when resolved.
_Avoid_: Phase Interaction, Input Request, Tool Call Interaction, Interactive Tool
