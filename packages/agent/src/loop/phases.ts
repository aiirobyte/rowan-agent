import { executeRuntimeToolCall } from "@rowan-agent/runtime/tools";
import {
  parseTask,
  parseTaskRoutingDecision,
  parseVerificationResult,
} from "../task";
import { scheduleTaskRouting } from "./routing";
import type {
  AgentLoopContext,
  LlmPhase,
  LlmPhaseOutputMap,
  ModelStreamEvent,
  Outcome,
  Task,
  TaskRoutingDecision,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "../types";
import {
  createMessage,
  latestUserInput,
  nowIso,
  Validators,
} from "../types";
import type {
  ExecuteInput,
  ExecuteOutput,
  PhaseInputMap,
  PhaseOutputMap,
  PlanInput,
  RouteInput,
  VerifyInput,
} from "./types";
import {
  assertNotAborted,
  createInvalidExecuteToolResult,
  createInvalidModelVerification,
  createToolTaskOutput,
  errorMessage,
  executePhase,
  isInvalidModelSchemaError,
  isRecord,
  planPhase,
  routePhase,
  verifyPhase,
} from "./shared";

export async function collectTextAndStructured<TPhase extends LlmPhase>(input: {
  context: AgentLoopContext;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: TPhase;
  recordText?: boolean;
}): Promise<{
  text: string;
  phaseOutput?: LlmPhaseOutputMap[TPhase];
  structured?: unknown;
  toolCalls: ToolCall[];
}> {
  const toolCalls: ToolCall[] = [];
  let text = "";
  let flushedText = "";
  let phaseOutput: LlmPhaseOutputMap[TPhase] | undefined;
  let structured: unknown;
  const flushText = async () => {
    if (text.length === 0) {
      return;
    }

    flushedText += text;
    await input.context.appendEventMessage(
      createMessage("assistant", text, {
        kind: "model_message",
        phase: input.metadataPhase,
        scope: "execution",
      }),
    );
    text = "";
  };

  for await (const event of input.events) {
    assertNotAborted(input.context.signal);

    if (event.type === "prompt_message") {
      await input.context.appendEventMessage(
        createMessage(event.message.role, event.message.content, {
          kind: "phase_prompt",
          phase: event.phase,
          scope: "execution",
        }),
      );
    }

    if (event.type === "model_requested") {
      input.context.consumeLimit("modelCalls");
      await input.context.emit({
        type: "model_requested",
        phase: event.phase,
        model: event.model,
        usage: event.usage,
        ts: nowIso(),
      });
    }

    if (event.type === "text_delta") {
      text += event.text;
    }

    if (event.type === "structured_output") {
      await flushText();
      structured = event.content;
    }

    if (event.type === "phase_output") {
      if (event.phase !== input.metadataPhase) {
        throw new Error(`Expected ${input.metadataPhase} phase output, received ${event.phase}.`);
      }

      await flushText();
      phaseOutput = event.output as LlmPhaseOutputMap[TPhase];

      if (event.phase === executePhase) {
        for (const outputToolCall of (event.output as LlmPhaseOutputMap["execute"]).toolCalls) {
          const toolCall = Validators.toolCall.Parse(outputToolCall);
          toolCalls.push(toolCall);
          await input.context.emit({
            type: "tool_requested",
            toolCall,
            ts: nowIso(),
          });
        }
      }
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
      await input.context.emit({
        type: "tool_requested",
        toolCall,
        ts: nowIso(),
      });
    }

    if (event.type === "done") {
      await flushText();
    }
  }

  await flushText();

  return { text: flushedText, phaseOutput, structured, toolCalls };
}

export async function planTask(context: AgentLoopContext, input: PlanInput): Promise<{ task: Task; text: string }> {
  const collected = await collectTextAndStructured({
    context,
    events: context.config.stream(
      context.config.model,
      { phase: planPhase, state: input.state, runtime: input.runtime },
      { signal: context.signal },
    ),
    metadataPhase: planPhase,
  });

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["plan"] | undefined;
  const rawTask = phaseOutput?.task ?? collected.structured;
  if (!rawTask) {
    throw new Error("Planner did not produce a structured task.");
  }

  const task = parseTask(rawTask);
  return { task, text: phaseOutput?.text ?? collected.text };
}

export async function routeRequest(
  context: AgentLoopContext,
  input: RouteInput,
): Promise<TaskRoutingDecision & { text: string }> {
  const collected = await collectTextAndStructured({
    context,
    events: context.config.stream(
      context.config.model,
      { phase: routePhase, state: input.state, runtime: input.runtime },
      { signal: context.signal },
    ),
    metadataPhase: routePhase,
    recordText: false,
  });

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["route"] | undefined;
  const rawDecision = phaseOutput ?? collected.structured;
  if (!rawDecision) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const decision = scheduleTaskRouting({
    input: latestUserInput(input.state),
    tools: input.tools,
    decision: parseTaskRoutingDecision(rawDecision),
    defaultNeedsTaskRoute: input.shouldDefaultToThreadRoute ? "thread" : "task",
    allowThreadRoute: input.canStartThreadRoute,
    workerTask: input.workerTask,
    workerGoal: input.workerGoal,
  });
  if (decision.route !== "direct") {
    await context.appendEventMessage(
      createMessage("assistant", JSON.stringify(decision), {
        kind: "routing_decision",
        phase: routePhase,
        scope: "execution",
      }),
    );
  }
  return { ...decision, text: phaseOutput?.text ?? decision.message };
}

async function executeToolCall(input: {
  context: AgentLoopContext;
  task: Task;
  toolCall: ToolCall;
}): Promise<ToolResult> {
  if (input.context.config.runtime?.tools) {
    return input.context.config.runtime.tools({
      context: input.context,
      task: input.task,
      toolCall: input.toolCall,
    });
  }

  const toolContext = {
    state: input.context.state.agentState,
    task: input.task,
    toolCallId: input.toolCall.id,
    ...(input.context.runThread ? { runThread: input.context.runThread } : {}),
  };
  return executeRuntimeToolCall({
    tools: input.context.config.tools,
    task: input.task,
    toolCall: input.toolCall,
    toolContext,
    beforeToolCall: input.context.config.beforeToolCall,
    afterToolCall: input.context.config.afterToolCall,
    signal: input.context.signal,
    observe: async (event) => {
      if (event.type === "approval_requested") {
        await input.context.emit({
          type: "tool_approval_requested",
          taskId: input.task.id,
          toolName: event.tool.name,
          args: event.args,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "approval_result") {
        await input.context.emit({
          type: "tool_approval_result",
          taskId: input.task.id,
          toolName: event.tool.name,
          args: event.args,
          decision: event.decision,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "tool_blocked") {
        await input.context.emit({
          type: "tool_blocked",
          toolName: event.tool.name,
          reason: event.reason,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "tool_start") {
        input.context.consumeLimit("toolCalls");
        await input.context.emit({
          type: "tool_start",
          toolName: event.tool.name,
          args: event.args,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "result_review_requested") {
        await input.context.emit({
          type: "tool_result_review_requested",
          taskId: input.task.id,
          toolName: event.tool.name,
          result: event.result,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "result_review_result") {
        await input.context.emit({
          type: "tool_result_review_result",
          taskId: input.task.id,
          toolName: event.tool.name,
          result: event.result,
          ts: nowIso(),
        });
        return;
      }

      await input.context.emit({
        type: "tool_end",
        toolName: event.toolName,
        result: event.result,
        ts: nowIso(),
      });
    },
  });
}

export async function executeTask(
  context: AgentLoopContext,
  input: ExecuteInput,
): Promise<ExecuteOutput> {
  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  try {
    collected = await collectTextAndStructured({
      context,
      events: context.config.stream(
        context.config.model,
        {
          phase: executePhase,
          state: input.state,
          task: input.task,
          toolResults: input.toolResults,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: executePhase,
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidExecuteToolResult(error);
    input.toolResults.push(result);
    await context.appendEventMessage(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      }),
    );
    return {
      text: "",
      toolCalls: [],
      taskOutput: createToolTaskOutput(input.toolResults),
    };
  }

  for (const toolCall of collected.toolCalls) {
    const result = await executeToolCall({ context, task: input.task, toolCall });
    input.toolResults.push(result);
    await context.appendEventMessage(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      }),
    );
  }

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["execute"] | undefined;
  return {
    text: phaseOutput?.text ?? collected.text,
    toolCalls: collected.toolCalls,
    taskOutput: createToolTaskOutput(input.toolResults),
  };
}

export async function verifyTask(
  context: AgentLoopContext,
  input: VerifyInput,
): Promise<VerificationResult> {
  await context.emit({
    type: "verification_start",
    taskId: input.task.id,
    ts: nowIso(),
  });

  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  try {
    collected = await collectTextAndStructured({
      context,
      events: context.config.stream(
        context.config.model,
        {
          phase: verifyPhase,
          state: input.state,
          task: input.task,
          taskOutput: input.taskOutput,
          criteria: input.criteria,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: verifyPhase,
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidModelVerification(input.task, error);
    await context.emit({
      type: "verification_end",
      taskId: input.task.id,
      result,
      ts: nowIso(),
    });
    return result;
  }

  const phaseOutput = collected.phaseOutput as LlmPhaseOutputMap["verify"] | undefined;
  const rawVerification = phaseOutput ?? collected.structured;
  const result = rawVerification
    ? parseVerificationResult(rawVerification)
    : {
        passed: false,
        message: "Verifier did not produce structured output.",
      };
  await context.emit({
    type: "verification_end",
    taskId: input.task.id,
    result,
    ts: nowIso(),
  });

  return result;
}

export type RunPhaseOutput<TPhase extends LlmPhase> =
  | { type: "output"; output: PhaseOutputMap[TPhase] }
  | { type: "abort"; outcome: Outcome };

function hasAbort(value: unknown): value is { abort: Outcome } {
  return isRecord(value) && isRecord(value.abort);
}

function hasSkip<TPhase extends LlmPhase>(value: unknown): value is { skip: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "skip" in value;
}

function hasInput<TPhase extends LlmPhase>(value: unknown): value is { input: PhaseInputMap[TPhase] } {
  return isRecord(value) && "input" in value;
}

function hasOutput<TPhase extends LlmPhase>(value: unknown): value is { output: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "output" in value;
}

function hasRetry<TPhase extends LlmPhase>(value: unknown): value is { retry: PhaseInputMap[TPhase] } {
  return isRecord(value) && "retry" in value;
}

export async function runPhase<TPhase extends LlmPhase>(
  context: AgentLoopContext,
  phase: TPhase,
  input: PhaseInputMap[TPhase],
  runner: (phaseInput: PhaseInputMap[TPhase]) => Promise<PhaseOutputMap[TPhase]>,
): Promise<RunPhaseOutput<TPhase>> {
  let currentInput = input;
  let retries = 0;

  while (true) {
    const before = await context.config.runtime?.beforePhase?.(context, phase, currentInput);
    if (hasAbort(before)) {
      return { type: "abort", outcome: before.abort };
    }
    if (hasSkip<TPhase>(before)) {
      return { type: "output", output: before.skip };
    }
    if (hasInput<TPhase>(before) && before.input) {
      currentInput = before.input;
    }

    const output = await runner(currentInput);
    const after = await context.config.runtime?.afterPhase?.(context, phase, output);
    if (hasAbort(after)) {
      return { type: "abort", outcome: after.abort };
    }
    if (hasRetry<TPhase>(after) && after.retry) {
      retries += 1;
      if (retries > 3) {
        throw new Error(`Runtime requested too many ${phase} phase retries.`);
      }
      currentInput = after.retry;
      continue;
    }
    if (hasOutput<TPhase>(after) && after.output) {
      return { type: "output", output: after.output };
    }

    return { type: "output", output };
  }
}
