# Rowan Agent Context

Rowan is a TypeScript + Bun Agent harness runtime. This context defines the domain language that architecture reviews, ADRs, and implementation plans should use.

## Language

### Agent Kernel

**Rowan**:
A minimal Agent harness runtime for engineering workflows.
_Avoid_: framework, app builder

**Agent**:
The public facade that owns Session lifecycle, event fanout, cancellation, and the Agent loop entrypoint.
_Avoid_: service, runner

**Agent loop**:
The ordered route, plan, execute, verify state machine that turns a user request into an Outcome.
_Avoid_: runtime loop, workflow graph

**Session**:
The durable conversation aggregate containing semantic messages, skills, runtime log, and optional thread assignment metadata.
_Avoid_: chat log, transcript

**Thread**:
A child Session created for delegated work and verified by its parent Agent loop.
_Avoid_: sub-agent when referring to persisted Rowan state

**Task**:
A structured unit of work with instruction, acceptance criteria, tool names, skill ids, status, and attempts.
_Avoid_: job, ticket

**Outcome**:
The final passed or failed result of an Agent run.
_Avoid_: response, result when the final run judgement is meant

### Context And History

**ContextScope**:
The visibility label on messages: conversation, execution, or diagnostic.
_Avoid_: visibility

**ExecutionTurn**:
The persisted phase-level driver history for prompts, model output, tool calls, and tool results.
_Avoid_: trace, log record

**AgentEvent**:
The live observable event stream emitted during a run.
_Avoid_: replay state

**Run log**:
The Pino JSONL observability sink for AgentEvents.
_Avoid_: source of truth

**DCP**:
The deterministic context pipeline separating source input, projection, rendering, provider conversion, and driver output.
_Avoid_: prompt builder when the whole pipeline is meant

**Projection**:
The deterministic reduction from source inputs and driver history into an intermediate context.
_Avoid_: prompt construction

**Rendering**:
The phase-specific conversion from projected context into model-readable context.
_Avoid_: provider wire conversion

### Runtime Integration

**Runtime glue**:
The workspace, tools, skills, hooks, MCP, plugin, and policy integration layer used by the Agent loop.
_Avoid_: Agent core

**Provider adapter**:
The module that converts provider wire formats to Rowan protocol events or phase outputs.
_Avoid_: model runtime

**ToolRunner**:
The runtime-owned execution path for resolving, validating, approving, executing, and reviewing tool calls.
_Avoid_: tool service

**Skill**:
A `SKILL.md` instruction bundle loaded into Session context.
_Avoid_: plugin when the item is just a skill file

## Relationships

- An **Agent** creates or continues exactly one active **Session** per run.
- An **Agent loop** consumes one **Session** and produces one **Outcome**.
- An **Agent loop** may create a **Thread**, which is also a **Session**.
- A **Task** is created by the plan phase or by a thread route.
- An **ExecutionTurn** belongs to exactly one **Session** and one phase.
- **AgentEvents** feed **Run logs**, but **Run logs** are not replay state.
- **Runtime glue** supplies **ToolRunner** and skills to the **Agent loop**.
- A **Provider adapter** converts provider output before the **Agent loop** records effects.
- **Projection** and **Rendering** belong to the DCP path, not to provider adapters.

## Example dialogue

> **Dev:** "Can we put tool execution back into the Agent loop to make this change smaller?"
> **Domain expert:** "No. The Agent loop should own ordering and Outcomes. Runtime glue should own the ToolRunner so local tools, MCP tools, and future policy share one path."

## Flagged ambiguities

- "runtime" previously meant both **Agent loop** and **Runtime glue**. Resolved: the **Agent loop** lives in `packages/agent`; **Runtime glue** lives in `packages/runtime`.
- "history" may mean **Session** messages, **ExecutionTurn**, or **Run log**. Resolved: use the precise term.
- "context" may mean **Session** state, **Projection**, **Rendering**, or provider messages. Resolved: use the DCP term for the layer being discussed.
- "result" may mean tool output, phase output, or final **Outcome**. Resolved: use **Outcome** only for the final run judgement.
