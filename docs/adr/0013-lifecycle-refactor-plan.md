# Loop 生命周期重构规划 v6

## 核心设计

**所有 phase 统一输入输出接口，模型通过 `route` 决定流转，phase-specific 数据通过 `yield` 字段在 phase 间传递。**

## 统一接口

### PhaseOutput

```typescript
export type PhaseOutput = {
  /** 用户可见消息 */
  message: string;
  /** 下一个 phase id，或 "stop" */
  route: string;
  /** phase-specific 产出数据，通过 yield 传递给下一个 phase */
  yield?: unknown;
};
```

每个 phase 的 `yield` 内容不同，但接口统一：
- chat: `yield` 无
- plan: `yield = { task: Task }`
- execute: `yield = { toolResults: ToolResult[] }`
- verify: `yield` 无

`yield` 不参与主循环的路由决策（route 由模型决定），但会通过 PhaseInput 传递给下一个 phase。

### PhaseInput

```typescript
/** 所有 phase 的统一输入 — 包含模型所需的全部上下文 */
export type PhaseInput = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: Tool[];
  skills: Skill[];
  /** 上一个 phase 的 output.yield */
  yield?: unknown;
};
```

`buildInput` 从 PhaseContext 组装完整输入，`buildPrompt` 从 PhaseInput 构建模型 prompt。不再需要 `LlmContext` 联合类型。

转换链路：
```
PhaseContext → buildInput(context, yield) → PhaseInput
PhaseInput   → buildPrompt(input, tools)  → prompt string
prompt       → model.collect()            → 模型输出
```

主循环在进入下一个 phase 前，将 `output.yield` 传入 `input.yield`：

```typescript
let lastYield: unknown;

while (currentPhaseId) {
  // ...
  const phaseInput = handler.buildInput(context, lastYield);
  const output = await definition.run(context, phaseInput);
  // ...
  lastYield = output.yield;
  currentPhaseId = output.route;
}
```

这样 phase-specific 数据在 phase 间自然流动，不需要通过 state 或 messages 隐式传递。

### PhaseHandler

```typescript
export type PhaseHandler = {
  definition: PhaseDefinition;
  conversationLimit?: number;
  prepare?(context: PhaseContext): void;
  buildInput(context: PhaseContext, yield?: unknown): PhaseInput;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void;
  createOutcome?(output: PhaseOutput, state: AgentRunState): Outcome;
};
```

## 数据流

```
plan.run() → { message, route: "execute", yield: { task } }
                                         ↓
主循环: lastYield = output.yield
                                         ↓
execute.buildInput(context, lastYield)   → input.yield = { task }
execute.run(context, input)              → { message, route: "verify", yield: { toolResults } }
                                         ↓
主循环: lastYield = output.yield
                                         ↓
verify.buildInput(context, lastYield)    → input.yield = { toolResults }
verify.run(context, input)               → { message, route: "stop" }
```

## 模型输出与路由

所有 phase 由模型通过 `route` 字段决定流转，无例外。

### chat prompt
```
Output: { "message": string, "route": "stop" | "<phase_id>" }
route="stop" when you can fully answer directly.
```

### plan prompt
```
Output: { "message": string, "route": "execute", "task": Task }
```

### execute prompt
```
Output: { "message": string, "route": "execute" | "verify", "toolCalls": ToolCall[] }
route="execute" if more work is needed after tool execution.
route="verify" when execution is complete.
```

### verify prompt
```
Output: { "message": string, "route": "stop" | "execute" }
route="stop" when the task output satisfies the acceptance criteria.
route="execute" when more work is needed.
```

## 主循环

```typescript
async function runLoop(runtime: AgentLoopRuntime): Promise<AgentRunResult> {
  const config = runtime.phaseConfig ?? createBuiltinPhaseConfig();
  // ...

  let currentPhaseId = config.entryPhaseId;
  let lastYield: unknown;
  const phaseVisits = new Map<string, number>();

  while (currentPhaseId) {
    assertNotAborted(runtime.signal);

    const definition = resolvePhase(config, currentPhaseId);
    if (!definition) throw new Error(`Phase "${currentPhaseId}" not defined.`);

    const handler = getPhaseHandler(currentPhaseId);
    runtime.currentPhase = currentPhaseId;

    // 通用访问次数限制
    const visits = (phaseVisits.get(currentPhaseId) ?? 0) + 1;
    phaseVisits.set(currentPhaseId, visits);
    if (visits > (handler?.conversationLimit ?? 20)) {
      return completeRun(runtime, createMaxVisitsOutcome(currentPhaseId));
    }

    const loopContext = createAgentLoopContext(runtime);
    const context = createPhaseContext(runtime, definition, loopContext, availablePhases);

    // prepare
    handler?.prepare?.(context);

    // buildInput（统一输入，携带上一个 phase 的 yield）
    const phaseInput = handler
      ? await handler.buildInput(context, lastYield)
      : undefined;

    // beforePhase 钩子
    if (runtime.runtime?.beforePhase) {
      const before = await runtime.runtime.beforePhase(
        loopContext, definition.id as LoopPhase, phaseInput as never,
      );
      if (hasAbort(before)) {
        await emit(runtime, { type: "phase_start", phase: currentPhaseId, ts: nowIso() });
        await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
        return completeRun(runtime, before.abort);
      }
      if (hasSkip(before)) {
        const skipOutput = before.skip as PhaseOutput;
        if (skipOutput.route === "stop") {
          return completeRun(runtime, createSkippedOutcome());
        }
        currentPhaseId = skipOutput.route;
        lastYield = skipOutput.yield;
        continue;
      }
    }

    // phase_start
    await emit(runtime, { type: "phase_start", phase: currentPhaseId, ts: nowIso() });

    // run（统一输出）
    let output: PhaseOutput = await definition.run(context, phaseInput);

    // afterPhase 钩子
    if (runtime.runtime?.afterPhase) {
      let retries = 0;
      while (true) {
        const after = await runtime.runtime.afterPhase(
          loopContext, definition.id as LoopPhase, output as never,
        );
        if (hasAbort(after)) {
          await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });
          return completeRun(runtime, after.abort);
        }
        if (hasRetry(after) && after.retry) {
          retries += 1;
          if (retries > 3) throw new Error(`Too many ${currentPhaseId} retries.`);
          output = await definition.run(context, after.retry);
          continue;
        }
        if (hasOutput(after) && after.output) {
          output = after.output as PhaseOutput;
        }
        break;
      }
    }

    // finalize（副作用）
    handler?.finalize?.(context, output);

    // phase_end
    await emit(runtime, { type: "phase_end", phase: currentPhaseId, ts: nowIso() });

    // ★ 读 route — 主循环不包含任何 phase 特定逻辑
    if (output.route === "stop") {
      const outcome = handler?.createOutcome?.(output, runtime)
        ?? createDefaultOutcome(output);
      return completeRun(runtime, outcome);
    }

    if (!config.phases.some((p) => p.id === output.route)) {
      return completeRun(runtime, createDefaultPhaseOutcome());
    }

    // 传递 yield 到下一个 phase
    lastYield = output.yield;
    currentPhaseId = output.route;
  }

  throw new Error("Phase loop exited without outcome.");
}
```

## Phase 内部实现

### chat phase

```typescript
buildInput(context, _yield) {
  return {
    state: context.state.agentState,
    messages: context.messages.visible(),
    tools: [],
    skills: context.skills,
    runtime: context.state.depth,
  };
},

async run(context, input) {
  const collected = await context.model.collect({
    phase: "chat",
    payload: {
      phase: "chat",
      state: input.state,
      runtime: input.runtime,
      availablePhases: context.availablePhases,
    },
  });
  const raw = collected.structured;
  return {
    message: raw.message ?? raw.answer ?? raw.response ?? "",
    route: raw.route,
  };
},

finalize(context, output) {
  if (output.route !== "stop") {
    context.messages.appendState(
      createMessage("assistant", JSON.stringify(output), {
        kind: "phase_output", phase: "chat", scope: "execution",
      }),
    );
  },
},

createOutcome(output) {
  return Validators.outcome.Parse({
    id: createId("out"),
    passed: true,
    message: output.message,
  });
},
```

### plan phase

```typescript
buildInput(context, _yield) {
  return {
    state: context.state.agentState,
    messages: context.messages.visible(),
    tools: [],
    skills: context.skills,
    runtime: context.state.depth,
  };
},

async run(context, input) {
  const collected = await context.model.collect({
    phase: "plan",
    payload: { phase: "plan", state: input.state, runtime: input.runtime },
  });
  const raw = collected.structured;
  const task = Validators.task.Parse(raw.task ?? raw);
  return {
    message: raw.message ?? "",
    route: raw.route ?? "execute",
    yield: { task },
  };
},

finalize(context, output) {
  const { task } = output.yield as { task: Task };
  context.setTask(task);
},
```

### execute phase

```typescript
buildInput(context, yield) {
  return {
    state: context.state.agentState,
    messages: context.messages.visible(),
    tools: context.tools,
    skills: context.skills,
    runtime: context.state.depth,
    yield,  // 上一个 phase 的 yield（可能包含 task 等）
  };
},

async run(context, input) {
  const collected = await context.model.collect({
    phase: "execute",
    payload: {
      phase: "execute",
      state: input.state,
      task: context.state.task,
      toolResults: context.state.toolResults,
      runtime: input.runtime,
    },
  });
  const raw = collected.structured;
  const toolCalls = (raw.toolCalls ?? []).map(tc => Validators.toolCall.Parse(tc));

  const toolResults: ToolResult[] = [];

  // 执行工具调用
  for (const toolCall of toolCalls) {
    await context.toolExecution.start(toolCall.id, toolCall.name, toolCall.args);
    const result = await context.tools.execute({ task: context.state.task!, toolCall });
    toolResults.push(result);
    await context.toolExecution.end(result.toolCallId, result.toolName, result, !result.ok);

    const toolMsgId = context.message.start("tool", JSON.stringify(result), {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      scope: "execution",
    });
    await context.message.end(toolMsgId);
  }

  // ★ route 由模型决定
  return {
    message: raw.message ?? "",
    route: raw.route,
    yield: { toolResults },
  };
},

finalize(context, output) {
  if (output.message.trim().length > 0) {
    context.setLastExecuteText(output.message);
  }
},
```

### verify phase

```typescript
buildInput(context, yield) {
  return {
    state: context.state.agentState,
    messages: context.messages.visible(),
    tools: [],
    skills: context.skills,
    runtime: context.state.depth,
    yield,  // 上一个 phase 的 yield（包含 toolResults）
  };
},

async run(context, input) {
  const collected = await context.model.collect({
    phase: "verify",
    payload: {
      phase: "verify",
      state: input.state,
      task: context.state.task,
      toolResults: (input.yield as any)?.toolResults ?? [],
      criteria: context.state.task?.acceptanceCriteria ?? [],
      runtime: input.runtime,
    },
  });
  const raw = collected.structured;
  return {
    message: raw.message ?? "",
    route: raw.route,  // "stop" 或 "execute"
  };
},

createOutcome(output, state) {
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: state.task?.id,
    passed: true,
    message: output.message,
  });
},
```

## 需要解决的问题

### 1. verify 输出 route: "execute" 时的保护

通用的 phase 访问次数限制（利用已有的 `conversationLimit`）：

```typescript
const visits = (phaseVisits.get(currentPhaseId) ?? 0) + 1;
phaseVisits.set(currentPhaseId, visits);
if (visits > (handler?.conversationLimit ?? 20)) {
  return completeRun(runtime, createMaxVisitsOutcome(currentPhaseId));
}
```

### 2. verify 输出 route: "stop" 时的 failed outcome

当 verify 模型输出 `route: "stop"` 时，表示通过。当输出 `route: "execute"` 但达到访问上限时，主循环强制停止，创建 failed outcome。

```typescript
// 达到上限时
if (visits > maxVisits) {
  // 如果当前是 verify 且被强制停止 → failed
  // 如果是其他 phase 被强制停止 → generic
  return completeRun(runtime, createMaxVisitsOutcome(currentPhaseId));
}
```

### 3. execute 的 toolResults 追加到 state

execute phase 的 finalize 中，除了记录 lastExecuteText，还需要将 toolResults 追加到 state 中，以便后续 phase 通过 state 访问：

```typescript
finalize(context, output) {
  if (output.message.trim().length > 0) {
    context.setLastExecuteText(output.message);
  }
  const { toolResults } = output.yield as { toolResults: ToolResult[] };
  context.state.toolResults.push(...toolResults);
},
```

### 4. PhaseOutput/PhaseInput 类型变更

移除 `LoopPhaseOutputMap`、`PhaseOutputMap`、`PhaseInputMap` 等按 phase 区分的类型映射。统一为单一类型。

受影响的类型：
- `protocol/context.ts`: `LoopPhaseOutputMap` → `PhaseOutput`
- `loop/types.ts`: `PhaseInputMap`、`PhaseOutputMap`、`ExecuteOutput` → 移除
- `loop/types.ts`: `PhaseResult`、`BeforePhaseResult`、`AfterPhaseResult` 泛型简化

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `protocol/context.ts` | `LoopPhaseOutputMap` → 统一 `PhaseOutput`（含 `yield` 字段）；移除按 phase 区分的输出类型 |
| `types.ts` | `chat_start` → `turn_start`，`chat_end` → `turn_end` |
| `agent-loop.ts` | emitChat→emitTurn；appendMessage 移除事件；主循环统一读 output.route + yield 传递；createPhaseContext 实现 message/toolExecution；新增 phaseVisits 限制 |
| `loop/phases/config.ts` | PhaseContext 新增 message/toolExecution |
| `loop/types.ts` | 移除 PhaseInputMap/PhaseOutputMap/ExecuteOutput；PhaseResult 简化 |
| `loop/phases/built-in/types.ts` | PhaseHandler：移除 applyOutput/泛型，新增 createOutcome；buildInput 接收 yield 参数 |
| `built-in/chat/index.ts` | 输出统一格式；applyOutput → finalize + createOutcome |
| `built-in/plan/index.ts` | 输出统一格式；yield 传递 task；applyOutput → finalize |
| `built-in/execute/index.ts` | 输出统一格式；route 由模型决定；yield 传递 toolResults；工具调用用 toolExecution 管理器 |
| `built-in/verify/index.ts` | 输出统一格式；移除 passed/VerificationResult；从 input.yield 读取 toolResults；applyOutput → createOutcome |
| `loop/outcomes.ts` | 新增 createDefaultOutcome、createMaxVisitsOutcome |
| `test/*.test.ts` | 适配新输出格式和事件名 |
| `cli/src/cli.ts` | `chat_start` → `turn_start` |

## 实施步骤

| Step | 内容 | 风险 |
|------|------|------|
| A | 统一 PhaseOutput/PhaseInput 类型（含 yield 字段）；移除 LoopPhaseOutputMap | 中 |
| B | PhaseHandler 接口简化；buildInput 接收 yield 参数 | 中 |
| C | 各 phase 输出改为统一格式；yield 传递逻辑 | 中 |
| D | 主循环统一读 output.route + yield 传递；phaseVisits 限制 | 中 |
| E | PhaseContext 新增 message/toolExecution 接口 + 实现 | 低 |
| F | appendMessage 移除事件；collectTextAndStructured 用 phaseContext | 中 |
| G | execute phase 用 toolExecution 管理器 | 低 |
| H | 事件重命名 chat_* → turn_* | 低 |
| I | 测试验证 | — |
