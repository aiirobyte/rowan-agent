# Rowan Agent Runtime

Rowan Agent Runtime hosts durable, independently scheduled Agents inside one application process. It separates conversational continuity from runtime control so Agents can suspend, recover, and coordinate without sharing business models.

## Agents

**Agent**:
A durable runtime identity that owns one Session and processes at most one Agent Run at a time. Multiple Agents may run concurrently under the same Runtime.
_Avoid_: Worker, Bot, Agent process

**Agent ID**:
The opaque identity Rowan assigns to an Agent for binding, scheduling, and result delivery. It is not a Session ID or a business identity.
_Avoid_: Session address, Project Agent ID

**Agent Binding**:
The exclusive association that makes one Agent ID available to an active Runtime. Reconstructing an Agent replaces the binding while preserving its identity.
_Avoid_: Agent registration, Session binding

**Agent Factory**:
A host-provided rule that rebuilds an Agent from current capabilities and context. Rowan identifies the rule by an opaque Factory ID without interpreting its business meaning.
_Avoid_: Agent type, serialized Agent

## Conversation

**Session**:
The durable conversation belonging to one Agent. A resumed Agent continues the same Session; a Session does not own scheduling or business state.
_Avoid_: Memory, Runtime State

**Context**:
The current model-facing instructions, messages, tools, skills, and phases supplied to an Agent. Context may be rebuilt from current host state when an Agent is resumed.
_Avoid_: Runtime State, Agent Definition snapshot

## Execution

**Agent Input**:
An input submitted to an Agent to start a new Agent Run or resume its single suspended Agent Run.
_Avoid_: Command, Chat event

**Agent Run**:
A durable execution of Agent Input that may be queued, running, suspended, or terminal. An Agent Run has one eventual Outcome.
_Avoid_: Job, Workflow Run, Turn Promise

**Suspension**:
A non-terminal Agent Run state that releases execution capacity while waiting for input. New Agent Input resumes the same Agent Run.
_Avoid_: Completion, Blocking wait

**Outcome**:
The terminal result of an Agent Run, including completion, failure, or cancellation data returned to its caller.
_Avoid_: Event, Stream result

## Coordination

**Runtime Message**:
A durable mailbox item containing Agent Input for one Agent Run.
_Avoid_: Runtime Event, Arbitrary Agent message

**Mailbox**:
The ordered Runtime Message queue belonging to one Agent. Only a Runtime Message may make an idle or suspended Agent runnable.
_Avoid_: Event Bus, Transcript

**Scheduler**:
The runtime policy that selects already-declared work for execution under ordering, capacity, retry, and lease constraints. It never chooses business work or interprets message payloads.
_Avoid_: Workflow orchestrator, Router

**Lease**:
The temporary exclusive claim that permits one Runtime worker to execute an Agent Run. Losing a Lease makes unfinished infrastructure work eligible for recovery.
_Avoid_: Lock, Agent ownership

**Runtime Command**:
A preemptive control instruction such as pause, resume, or abort. Runtime Commands do not enter the Mailbox or Session.
_Avoid_: Agent Input, Business cancellation

## State and Events

**Runtime State**:
The authoritative durable state used for Agent binding, scheduling, delivery, recovery, and Tool Call control. Model-facing Context never substitutes for Runtime State.
_Avoid_: Memory, Session

**Runtime Event**:
A durable fact about a control-state transition that may be replayed for recovery or delivery.
_Avoid_: Runtime Message, Stream Event

**Stream Event**:
A transient observation such as model output or tool progress intended for live consumers. Stream Events are not replayed and cannot control scheduling.
_Avoid_: Runtime Event, State transition

## Tools

**Tool Capability**:
A Tool made available when an Agent is constructed. It defines the Agent's maximum executable capability and may only be narrowed by Runtime policy.
_Avoid_: Prompt permission, Tool request

**Tool Call**:
A Runtime-controlled attempt to execute one Tool Capability for an Agent Run.
_Avoid_: Shell command, Tool event

**Indeterminate Tool Call**:
A Tool Call whose external effect may have happened but whose terminal result was not durably observed. It requires recovery or human resolution instead of blind retry.
_Avoid_: Failed Tool Call, Retryable error
