# Rowan v0.4.2 Plan

> 版本：v0.4.2
> 日期：2026-05-03
> 状态：implemented
> 技术栈：TypeScript + Bun
> 基线：v0.4.1 Agent Boundary Correction
> 任务表：`docs/PLAN/v0.4.2/TASKS.md`

## 1. Goal

v0.4.2 atomizes the Agent loop's internal IO.

v0.4.1 established the correct ownership: `agent` owns the loop and driver semantics, while `runtime` owns integration glue. v0.4.2 makes that boundary usable by changing every loop phase from "takes the whole mutable runtime" to "takes one typed input and returns one typed output".

The guiding rule:

```text
agent 保留流程链路和状态机
runtime 提供每个环节的输入/输出变换、工具执行、策略 hooks、MCP/plugin glue
```

## 2. Target Loop Shape

```text
Agent.prompt()
  -> AgentLoopConfig
  -> AgentRunState
  -> runAgentLoop()

runAgentLoop()
  -> route(input) -> route(output)
  -> direct | thread | task
  -> plan(input) -> plan(output)
  -> attempt loop:
       execute(input) -> execute(output)
       executeTools(tool input) -> tool output
       verify(input) -> verify(output)
  -> outcome
```

Runtime participates only through explicit ports:

```text
PhaseInput
  -> runtime.beforePhase()
  -> phase runner
  -> runtime.afterPhase()
  -> PhaseOutput
```

## 3. Core Contracts

The implementation may refine exact names, but these concepts are required.

```ts
type AgentLoopConfig = {
  model: ModelRef;
  stream: StreamFn;
  maxAttempts: number;
  verifyTasks: boolean;
  limits?: AgentRunLimits;
  runtime?: AgentRuntimePort;
};

type AgentRunState = {
  session: Session<AgentEvent>;
  status: "routing" | "planning" | "executing" | "verifying" | "completed";
  task?: Task;
  attempt: number;
  toolResults: ToolResult[];
  limitUsage: AgentLimitUsage;
  depth: RuntimeDepth;
  lastExecuteText?: string;
};

type AgentContext = {
  config: AgentLoopConfig;
  state: Readonly<AgentRunState>;
  signal?: AbortSignal;
  emit(event: AgentEvent): Promise<void>;
  record(step: ExecutionTurn): Promise<void>;
  runThread?: RunThread;
};

type PhaseInputMap = {
  route: RouteInput;
  plan: PlanInput;
  execute: ExecuteInput;
  verify: VerifyInput;
};

type PhaseOutputMap = {
  route: TaskRoutingDecision;
  plan: { task: Task; text?: string };
  execute: { text?: string; toolCalls: ToolCall[]; taskOutput: TaskOutput };
  verify: VerificationResult;
};
```

`PhaseResult` must support at least: continue, skip, retry, abort.

## 4. Runtime Phase Port

```ts
type AgentRuntimePort = {
  beforePhase?<K extends LlmPhase>(
    context: AgentContext,
    phase: K,
    input: PhaseInputMap[K],
  ): Promise<
    | { input?: PhaseInputMap[K] }
    | { skip: PhaseOutputMap[K] }
    | { abort: Outcome }
  >;

  afterPhase?<K extends LlmPhase>(
    context: AgentContext,
    phase: K,
    output: PhaseOutputMap[K],
  ): Promise<
    | { output?: PhaseOutputMap[K] }
    | { retry?: PhaseInputMap[K] }
    | { abort: Outcome }
  >;

  tools?: ToolRunner;
};
```

Runtime ports may:

- adjust or redact phase inputs;
- adjust phase outputs;
- skip a phase with a supplied output;
- request a retry with adjusted input;
- abort with a final outcome;
- run tools through a shared tool execution path.

Runtime ports must not:

- own route / task / thread / verification ordering;
- mutate `session.messages` directly;
- mutate task status behind the loop;
- persist driver turns outside Agent-owned recording helpers.

## 5. Required Refactor

- Split the current private `AgentLoopRuntime` into config, state, and context.
- Add typed phase input/output contracts under `packages/agent/src/phases/types.ts` or another Agent-owned file.
- Add `runPhase()` around core phase runners.
- Rewrite route / plan / execute / verify helpers so they no longer receive the whole loop runtime.
- Extract model turn collection into a helper that returns text, structured output, tool calls, usage, and turn entries.
- Keep event emission, session message appends, and turn recording behind Agent-owned effect helpers.
- Split execute into model execution and tool execution so `ToolRunner` can live in runtime while retry and verification stay Agent-owned.
- Preserve `beforeToolCall` / `afterToolCall` compatibility through the default tool runner path.
- Preserve public `Agent.prompt()` and `Agent.startThread()` behavior.

## 6. Not Doing

- No context projection rewrite.
- No provider-neutral `ConversationEntry[]`.
- No SSE parser work.
- No full policy engine.
- No new MCP implementation.
- No replay/fork/compaction.
- No workflow graph.

## 7. Acceptance Criteria

- No phase helper receives the whole mutable loop runtime.
- `runAgentLoop()` reads as route / branch / plan / attempt execute / verify / outcome.
- Runtime hooks can adjust phase input and phase output without direct session mutation.
- Runtime hooks can skip, retry, and abort phases.
- Tool execution is callable through a runtime-owned `ToolRunner` port.
- Direct, task, thread, limits, multi-turn, and verify retry tests pass.
- New tests cover `beforePhase` input adjustment, `afterPhase` output adjustment, skip, retry, abort, and unchanged default behavior.
- `bun test packages` passes.
- `bun run build` passes.
