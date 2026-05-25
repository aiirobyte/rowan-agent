import { executeRuntimeToolCall } from "../harness/tools";
import type {
  AgentLoopContext,
  LoopPhase,
  LoopPhaseOutputMap,
  ModelStreamEvent,
  Outcome,
  Task,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "../types";
import {
  createMessage,
  nowIso,
  Validators,
} from "../types";
import type {
  ExecuteInput,
  ExecuteOutput,
  PhaseInputMap,
  PhaseOutputMap,
  PlanInput,
  VerifyInput,
} from "./types";
import {
  assertNotAborted,
  createInvalidExecuteToolResult,
  createInvalidModelVerification,
  createToolTaskOutput,
  isInvalidModelSchemaError,
  isRecord,
} from "./shared";
import type { PhaseContext, PhaseDefinition, PhaseTransition } from "./phase-config";
import type { AgentLoopRuntime } from "../loop";
import { createAgentLoopContext, emit } from "../loop";

// --- Parse functions (moved from task.ts) ---

function normalizeVerificationInput(value: unknown): VerificationResult {
  if (!isRecord(value)) {
    throw new Error("Expected verify output to be an object.");
  }

  if (typeof value.passed !== "boolean") {
    throw new Error("Expected verify output to include boolean passed.");
  }

  const passed = value.passed;
  const message =
    typeof value.message === "string" && value.message.trim().length > 0
      ? value.message
      : passed === true
        ? "Task passed."
        : "Task failed.";

  return Validators.verificationResult.Parse({
    passed,
    message,
  });
}

function parseVerificationResult(value: unknown): VerificationResult {
  return Validators.verificationResult.Parse(normalizeVerificationInput(value));
}

function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

export async function collectTextAndStructured<TPhase extends LoopPhase>(input: {
  context: AgentLoopContext;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: TPhase;
  recordText?: boolean;
}): Promise<{
  text: string;
  phaseOutput?: LoopPhaseOutputMap[TPhase];
  structured?: unknown;
  toolCalls: ToolCall[];
}> {
  const toolCalls: ToolCall[] = [];
  let text = "";
  let flushedText = "";
  let phaseOutput: LoopPhaseOutputMap[TPhase] | undefined;
  let structured: unknown;
  const flushText = async () => {
    if (text.length === 0) {
      return;
    }

    flushedText += text;
    await input.context.appendMessage(
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
      // Internal execution detail — not emitted as a message event.
    }

    if (event.type === "model_requested") {
      input.context.consumeLimit("modelCalls");
    }

    if (event.type === "text_delta") {
      text += event.text;
    }

    if (event.type === "structured_output") {
      structured = event.content;
    }

    if (event.type === "phase_output") {
      if (event.phase !== input.metadataPhase) {
        throw new Error(`Expected ${input.metadataPhase} phase output, received ${event.phase}.`);
      }

      await flushText();
      phaseOutput = event.output as LoopPhaseOutputMap[TPhase];

      if (event.phase === "execute") {
        for (const outputToolCall of (event.output as LoopPhaseOutputMap["execute"]).toolCalls) {
          const toolCall = Validators.toolCall.Parse(outputToolCall);
          toolCalls.push(toolCall);
        }
      }
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
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
      { phase: "plan", state: input.state, runtime: input.runtime },
      { signal: context.signal },
    ),
    metadataPhase: "plan",
  });

  const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["plan"] | undefined;
  const rawTask = phaseOutput?.task ?? collected.structured;
  if (!rawTask) {
    throw new Error("Planner did not produce a structured task.");
  }

  const task = parseTask(rawTask);
  return { task, text: phaseOutput?.text ?? collected.text };
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
      if (event.type === "tool_start") {
        input.context.consumeLimit("toolCalls");
        await input.context.emit({
          type: "tool_execution_start",
          toolCallId: input.toolCall.id,
          toolName: event.tool.name,
          args: event.args,
          ts: nowIso(),
        });
        return;
      }

      if (event.type === "tool_end") {
        await input.context.emit({
          type: "tool_execution_end",
          toolCallId: input.toolCall.id,
          toolName: event.toolName,
          result: event.result,
          isError: !event.result.ok,
          ts: nowIso(),
        });
      }
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
          phase: "execute",
          state: input.state,
          task: input.task,
          toolResults: input.toolResults,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: "execute",
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidExecuteToolResult(error);
    input.toolResults.push(result);
    await context.appendMessage(
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
    await context.appendMessage(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        scope: "execution",
      }),
    );
  }

  const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["execute"] | undefined;
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
  let collected: Awaited<ReturnType<typeof collectTextAndStructured>>;
  try {
    collected = await collectTextAndStructured({
      context,
      events: context.config.stream(
        context.config.model,
        {
          phase: "verify",
          state: input.state,
          task: input.task,
          taskOutput: input.taskOutput,
          criteria: input.criteria,
          runtime: input.runtime,
        },
        { signal: context.signal },
      ),
      metadataPhase: "verify",
    });
  } catch (error) {
    if (!isInvalidModelSchemaError(error)) {
      throw error;
    }
    const result = createInvalidModelVerification(input.task, error);
    return result;
  }

  const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["verify"] | undefined;
  const rawVerification = phaseOutput ?? collected.structured;
  const result = rawVerification
    ? parseVerificationResult(rawVerification)
    : {
        passed: false,
        message: "Verifier did not produce structured output.",
      };

  return result;
}

export type RunPhaseOutput<TPhase extends LoopPhase> =
  | { type: "output"; output: PhaseOutputMap[TPhase] }
  | { type: "abort"; outcome: Outcome };

function hasAbort(value: unknown): value is { abort: Outcome } {
  return isRecord(value) && isRecord(value.abort);
}

function hasSkip<TPhase extends LoopPhase>(value: unknown): value is { skip: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "skip" in value;
}

function hasInput<TPhase extends LoopPhase>(value: unknown): value is { input: PhaseInputMap[TPhase] } {
  return isRecord(value) && "input" in value;
}

function hasOutput<TPhase extends LoopPhase>(value: unknown): value is { output: PhaseOutputMap[TPhase] } {
  return isRecord(value) && "output" in value;
}

function hasRetry<TPhase extends LoopPhase>(value: unknown): value is { retry: PhaseInputMap[TPhase] } {
  return isRecord(value) && "retry" in value;
}

export async function runPhase<TPhase extends LoopPhase>(
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

export async function runConfiguredPhase(
  runtime: AgentLoopRuntime,
  definition: PhaseDefinition<any, any>,
  createRun: PhaseContext["createRun"],
): Promise<PhaseTransition> {
  const context = createAgentLoopContext(runtime);
  const phaseContext: PhaseContext = { ...context, createRun };
  const modelPhase = definition.modelPhase as LoopPhase | undefined;
  let retries = 0;
  let retryInput: unknown = undefined;

  while (true) {
    await emit(runtime, { type: "phase_start", phase: definition.id, ts: nowIso() });

    // 1. buildInput (always build defaults, then overlay retry input)
    let builtInput = await definition.buildInput(runtime);
    if (retryInput) {
      builtInput = { ...builtInput, ...(retryInput as object) };
      retryInput = undefined;
    }

    // 2. runtime beforePhase
    if (modelPhase && context.config.runtime?.beforePhase) {
      const before = await context.config.runtime.beforePhase(context, modelPhase, builtInput as never);
      if (hasAbort(before)) {
        await emit(runtime, { type: "phase_end", phase: definition.id, ts: nowIso() });
        return { type: "abort", outcome: before.abort };
      }
      if (hasSkip(before)) {
        const transition = definition.apply
          ? await definition.apply(runtime, before.skip, builtInput)
          : { type: "stop" as const, outcome: { id: "skip", passed: true, message: "Skipped." } };
        await emit(runtime, { type: "phase_end", phase: definition.id, ts: nowIso() });
        return transition;
      }
      if (before && "input" in before && before.input) {
        builtInput = before.input;
      }
    }

    // 3. run (definition runner or model stream)
    let output: unknown;
    if (definition.run) {
      output = await definition.run(phaseContext, builtInput);
    }

    // 4. parseOutput
    if (definition.parseOutput && output !== undefined) {
      output = definition.parseOutput(output, builtInput);
    }

    // 5. runtime afterPhase
    if (modelPhase && context.config.runtime?.afterPhase) {
      const after = await context.config.runtime.afterPhase(context, modelPhase, output as never);
      if (hasAbort(after)) {
        await emit(runtime, { type: "phase_end", phase: definition.id, ts: nowIso() });
        return { type: "abort", outcome: after.abort };
      }
      if (hasRetry(after) && after.retry) {
        retries += 1;
        if (retries > 3) {
          throw new Error(`Runtime requested too many ${definition.id} phase retries.`);
        }
        retryInput = after.retry;
        continue;
      }
      if (hasOutput(after) && after.output) {
        output = after.output;
      }
    }

    // 6. apply (definition effects and transition)
    if (definition.apply) {
      const transition = await definition.apply(runtime, output, builtInput);
      await emit(runtime, { type: "phase_end", phase: definition.id, ts: nowIso() });
      return transition;
    }

    // Default: stop
    await emit(runtime, { type: "phase_end", phase: definition.id, ts: nowIso() });
    return { type: "stop", outcome: { id: "default", passed: true, message: "Phase completed." } };
  }
}
