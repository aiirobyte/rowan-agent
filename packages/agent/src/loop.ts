import {
  createDirectOutcome,
  createFailedOutcome,
  createOutcome,
} from "./task";
import type {
  AgentLoopInput,
  AgentRunResult,
  RunThread,
  TaskOutput,
  VerificationResult,
} from "./types";
import {
  latestUserInput,
  nowIso,
} from "./types";
import {
  executeTask,
  planTask,
  routeRequest,
  runPhase,
  verifyTask,
} from "./loop/phases";
import {
  assertNotAborted,
  createLimitExceededOutcome,
  createToolTaskOutput,
  createUnverifiedTaskOutcome,
  LimitExceededError,
  makeError,
  planPhase,
  routePhase,
  runtimeDepth,
  executePhase,
  verifyPhase,
} from "./loop/shared";
import {
  completeRun,
  completeThreadDepthExceeded,
  createAgentLoopContext,
  createLoopRuntime,
  emit,
  emitChatEnd,
  emitChatStart,
  emitThreadCreated,
  publishConversationAssistantMessage,
} from "./loop/runtime";
import type { AgentLoopRuntime } from "./loop/runtime";
import { executeThreadRoute } from "./loop/thread";

function createNestedRunThread(input: AgentLoopRuntime): RunThread {
  return async (threadInput) => {
    const result = await runAgentLoop({
      kind: "thread",
      ...threadInput,
      parentSessionId: threadInput.parentSessionId ?? input.agentState.id,
      systemPrompt: input.agentState.systemPrompt,
      model: input.model,
      stream: input.stream,
      signal: input.signal,
      limits: threadInput.limits ?? input.limits,
      threadDepth: threadInput.threadDepth ?? input.threadDepth + 1,
      verify: threadInput.verify ?? false,
      runtime: input.runtime,
      beforeToolCall: input.beforeToolCall,
      afterToolCall: input.afterToolCall,
      emit: input.emit,
    });
    if (result.kind !== "thread") {
      throw new Error("Nested thread runner returned a non-thread result.");
    }
    return result;
  };
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentRunResult> {
  const runtime = createLoopRuntime(input);
  runtime.runThread = runtime.runThread ?? createNestedRunThread(runtime);
  const maxAttempts = runtime.maxAttempts ?? 2;
  let chatLogEnded = false;
  const endChatLog = async () => {
    if (!chatLogEnded) {
      await emitChatEnd(runtime);
      chatLogEnded = true;
    }
  };

  try {
    await emitThreadCreated(runtime);
    if (runtime.kind === "thread" && runtime.threadDepth > runtime.maxThreadDepth) {
      return completeThreadDepthExceeded(runtime);
    }

    assertNotAborted(runtime.signal);
    await emitChatStart(runtime);

    runtime.status = "routing";
    const canStartThreadRoute = runtime.threadDepth < runtime.maxThreadDepth;
    const routePhaseResult = await runPhase(
      createAgentLoopContext(runtime),
      routePhase,
      {
        state: runtime.agentState,
        runtime: runtimeDepth(runtime),
        tools: runtime.tools,
        canStartThreadRoute,
        shouldDefaultToThreadRoute:
          canStartThreadRoute &&
          !runtime.agentState.parentSessionId &&
          !runtime.agentState.task &&
          !runtime.agentState.goal,
        workerTask: runtime.threadDepth > 0 ? runtime.agentState.task : undefined,
        workerGoal: runtime.threadDepth > 0 ? runtime.agentState.goal : undefined,
      },
      (phaseInput) => routeRequest(createAgentLoopContext(runtime), phaseInput),
    );
    if (routePhaseResult.type === "abort") {
      return completeRun(runtime, routePhaseResult.outcome, endChatLog);
    }
    const routed = routePhaseResult.output;
    if (routed.route === "direct") {
      const outcome = createDirectOutcome(routed.message);
      await publishConversationAssistantMessage(runtime, outcome.message, { kind: "direct_answer" });
      return completeRun(runtime, outcome, endChatLog);
    }

    if (routed.route === "thread") {
      const outcome = await executeThreadRoute(runtime, routed);
      if (outcome.passed) {
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
        });
      }
      return completeRun(runtime, outcome, endChatLog);
    }

    runtime.status = "planning";
    const planPhaseResult = await runPhase(
      createAgentLoopContext(runtime),
      planPhase,
      {
        state: runtime.agentState,
        runtime: runtimeDepth(runtime),
      },
      (phaseInput) => planTask(createAgentLoopContext(runtime), phaseInput),
    );
    if (planPhaseResult.type === "abort") {
      return completeRun(runtime, planPhaseResult.outcome, endChatLog);
    }
    const task = planPhaseResult.output.task;
    runtime.currentTask = task;

    await emit(runtime, {
      type: "task_created",
      task,
      ts: nowIso(),
    });

    let lastVerification: VerificationResult | undefined;
    let lastTaskOutput: TaskOutput = createToolTaskOutput(runtime.toolResults);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      assertNotAborted(runtime.signal);
      runtime.status = "executing";
      runtime.attempt = attempt;
      task.status = "running";
      task.attempts = attempt;

      await emit(runtime, {
        type: "task_start",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      const executePhaseResult = await runPhase(
        createAgentLoopContext(runtime),
        executePhase,
        {
          state: runtime.agentState,
          task,
          toolResults: runtime.toolResults,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => executeTask(createAgentLoopContext(runtime), phaseInput),
      );
      if (executePhaseResult.type === "abort") {
        return completeRun(runtime, executePhaseResult.outcome, endChatLog);
      }
      if (executePhaseResult.output.text.trim().length > 0) {
        runtime.lastExecuteText = executePhaseResult.output.text;
      }
      lastTaskOutput = executePhaseResult.output.taskOutput;

      await emit(runtime, {
        type: "task_end",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      if (!runtime.verifyTasks) {
        const outcome = createUnverifiedTaskOutcome(runtime, task, runtime.toolResults);
        task.status = outcome.passed ? "passed" : "failed";
        if (outcome.passed) {
          await publishConversationAssistantMessage(runtime, outcome.message, {
            kind: "task_outcome",
            taskId: task.id,
          });
        }
        return completeRun(runtime, outcome, endChatLog);
      }

      runtime.status = "verifying";
      const verifyPhaseResult = await runPhase(
        createAgentLoopContext(runtime),
        verifyPhase,
        {
          state: runtime.agentState,
          task,
          taskOutput: lastTaskOutput,
          criteria: task.acceptanceCriteria,
          runtime: runtimeDepth(runtime),
        },
        (phaseInput) => verifyTask(createAgentLoopContext(runtime), phaseInput),
      );
      if (verifyPhaseResult.type === "abort") {
        return completeRun(runtime, verifyPhaseResult.outcome, endChatLog);
      }
      lastVerification = verifyPhaseResult.output;
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await publishConversationAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          taskId: task.id,
        });
        return completeRun(runtime, outcome, endChatLog);
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    return completeRun(runtime, outcome, endChatLog);
  } catch (error) {
    if (error instanceof LimitExceededError) {
      const outcome = createLimitExceededOutcome(error, runtime.currentTask);
      await emit(runtime, {
        type: "limit_exceeded",
        resource: error.resource,
        limit: error.limit,
        usage: error.usage,
        message: error.message,
        ...(runtime.currentTask ? { taskId: runtime.currentTask.id } : {}),
        ts: nowIso(),
      });
      return completeRun(runtime, outcome, endChatLog);
    }

    const errorInfo = makeError(error);
    await endChatLog();
    await emit(runtime, { type: "error", error: errorInfo, ts: nowIso() });
    throw error;
  }
}
