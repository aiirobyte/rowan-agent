# Run Interactions

Run Interactions are durable requests for input raised by a Phase, Tool hook, or
Tool execution. Answers are opaque JSON. A request may declare templates for
its `answered`, `replied`, and `cancelled` Interaction Record; Rowan supplies a
default rendering when no template is declared. Tool interactions are folded
into that Tool Call's result in model context.

Use `RunInteractionDriver.request` to create a request. Read answers through
`answers`, store JSON-safe continuation data through `checkpoint`, then call
`suspend` to return control to the Runtime. The Run enters `input_required` and
resumes when all pending interactions are resolved or when new Agent Input
replies to them. A Tool suspended in `execute` is invoked again after resume
with the same Tool Call identity, answers, and checkpoint. If the Run is
cancelled, the Tool does not execute.

Resolved interactions create structured Interaction Records. New Agent Input
is committed after records for interactions it replied to. Tool-associated
records are projected into the corresponding Tool result so provider messages
keep Tool-use and Tool-result ordering valid.

`RunSnapshot.currentPhaseId` reports the last entered Phase. Durable
`phase_entered` events include `executionId`, `phaseId`, and an increasing visit
number for each Run; `phase_status` remains a transient progress signal.

See [ADR-0012](../../../docs/adr/0012-run-interaction-and-durable-phase-entry.md)
and [PRD-0010](../../../docs/prd/0010-run-interaction-and-durable-phase-entry.md)
for the full contract. v0.13 removes `PhaseInteraction*`,
`ToolCallInteraction*`, `InputRequest*`, and `run.respond` without aliases.
