import {
  createDirectOutcome,
  createFailedOutcome,
  createOutcome,
} from "../task";
import type {
  AgentRunResult,
  Outcome,
  RoutingDecision,
  VerificationResult,
} from "../types";
import {
  createId,
  createMessage,
  latestUserInput,
  nowIso,
  Validators,
} from "../types";
import type {
  AgentPhaseDefinition,
  AgentPhaseTransition,
} from "./phase-config";
import type { AgentLoopRuntime } from "../loop";
import {
  appendMessage,
  createAgentLoopContext,
  emit,
  appendAssistantMessage,
} from "../loop";
import {
  executeTask,
  planTask,
  routeRequest,
  verifyTask,
} from "./phases";
import {
  createToolTaskOutput,
  createUnverifiedTaskOutcome,
  runtimeDepth,
} from "./shared";
import type { ExecuteOutput, RouteInput } from "./types";
import { executeThreadRoute } from "./thread";

export type RoutePhaseInput = RouteInput;

export type RoutePhaseOutput = RoutingDecision & { text: string };

export const routePhaseDefinition: AgentPhaseDefinition<RoutePhaseInput, RoutePhaseOutput> = {
  id: "route",
  modelPhase: "route",

  buildInput(runtime) {
    const canStartThreadRoute = runtime.threadDepth < runtime.maxThreadDepth;
    return {
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
    };
  },

  async run(context, input) {
    return routeRequest(context, input);
  },

  async apply(runtime, output): Promise<AgentPhaseTransition> {
    if (output.route === "direct") {
      const outcome = createDirectOutcome(output.message);
      await appendAssistantMessage(runtime, outcome.message, { kind: "direct_answer" });
      return { type: "stop", outcome };
    }

    // Route to the target phase (e.g., "plan", "thread", "execute", or custom phase)
    runtime.lastRouteDecision = output;
    runtime.status = output.route as AgentLoopRuntime["status"];
    return { type: "next", phaseId: output.route };
  },
};

export type PlanPhaseInput = {
  state: AgentLoopRuntime["agentState"];
  runtime: ReturnType<typeof runtimeDepth>;
};

export type PlanPhaseOutput = {
  task: AgentRunResult["outcome"] extends { taskId?: infer T } ? any : any;
  text: string;
};

export const planPhaseDefinition: AgentPhaseDefinition<
  PlanPhaseInput,
  { task: NonNullable<AgentLoopRuntime["currentTask"]>; text: string }
> = {
  id: "plan",
  modelPhase: "plan",

  buildInput(runtime) {
    return {
      state: runtime.agentState,
      runtime: runtimeDepth(runtime),
    };
  },

  async run(context, input) {
    return planTask(context, input);
  },

  async apply(runtime, output): Promise<AgentPhaseTransition> {
    runtime.currentTask = output.task;
    await emit(runtime, {
      type: "task_created",
      task: output.task,
      ts: nowIso(),
    });
    return { type: "next", phaseId: "execute" };
  },
};

export type ExecutePhaseInput = {
  state: AgentLoopRuntime["agentState"];
  task: NonNullable<AgentLoopRuntime["currentTask"]>;
  toolResults: AgentLoopRuntime["toolResults"];
  runtime: ReturnType<typeof runtimeDepth>;
};

export const executePhaseDefinition: AgentPhaseDefinition<ExecutePhaseInput, ExecuteOutput> = {
  id: "execute",
  modelPhase: "execute",

  async buildInput(runtime) {
    const task = runtime.currentTask!;
    runtime.attempt = (runtime.attempt || 0) + 1;
    task.status = "running";
    task.attempts = runtime.attempt;

    await emit(runtime, {
      type: "task_start",
      taskId: task.id,
      attempt: runtime.attempt,
      ts: nowIso(),
    });

    return {
      state: runtime.agentState,
      task,
      toolResults: runtime.toolResults,
      runtime: runtimeDepth(runtime),
    };
  },

  async run(context, input) {
    return executeTask(context, input);
  },

  async apply(runtime, output, input): Promise<AgentPhaseTransition> {
    if (output.text.trim().length > 0) {
      runtime.lastExecuteText = output.text;
    }

    await emit(runtime, {
      type: "task_end",
      taskId: input.task.id,
      attempt: runtime.attempt,
      ts: nowIso(),
    });

    // Check if verify phase exists in the phase config
    const hasVerifyPhase = runtime.phaseConfig?.phases.some((p) => p.id === "verify") ?? true;
    if (!hasVerifyPhase) {
      // If no verify phase, create unverified outcome based on tool results
      const outcome = createUnverifiedTaskOutcome(runtime, input.task, runtime.toolResults);
      input.task.status = outcome.passed ? "passed" : "failed";
      if (outcome.passed) {
        await appendAssistantMessage(runtime, outcome.message, {
          kind: "task_outcome",
          taskId: input.task.id,
        });
      }
      return { type: "stop", outcome };
    }

    return { type: "next", phaseId: "verify" };
  },
};

export type VerifyPhaseInput = {
  state: AgentLoopRuntime["agentState"];
  task: NonNullable<AgentLoopRuntime["currentTask"]>;
  taskOutput: ExecuteOutput["taskOutput"];
  criteria: NonNullable<AgentLoopRuntime["currentTask"]>["acceptanceCriteria"];
  runtime: ReturnType<typeof runtimeDepth>;
};

export const verifyPhaseDefinition: AgentPhaseDefinition<VerifyPhaseInput, VerificationResult> = {
  id: "verify",
  modelPhase: "verify",

  buildInput(runtime) {
    const task = runtime.currentTask!;
    const taskOutput = createToolTaskOutput(runtime.toolResults);

    return {
      state: runtime.agentState,
      task,
      taskOutput,
      criteria: task.acceptanceCriteria,
      runtime: runtimeDepth(runtime),
    };
  },

  async run(context, input) {
    return verifyTask(context, input);
  },

  async apply(runtime, output, input): Promise<AgentPhaseTransition> {
    if (output.passed) {
      input.task.status = "passed";
      const outcome = createOutcome(input.task, output);
      await appendAssistantMessage(runtime, outcome.message, {
        kind: "task_outcome",
        taskId: input.task.id,
      });
      return { type: "stop", outcome };
    }

    const maxAttempts = runtime.maxAttempts ?? 2;
    if (runtime.attempt < maxAttempts) {
      return { type: "next", phaseId: "execute" };
    }

    input.task.status = "failed";
    const outcome = createFailedOutcome(input.task, output);
    return { type: "stop", outcome };
  },
};

export type ThreadPhaseInput = {
  decision: RoutingDecision;
};

export const threadPhaseDefinition: AgentPhaseDefinition<ThreadPhaseInput, Outcome> = {
  id: "thread",

  buildInput(runtime) {
    const decision = runtime.lastRouteDecision ?? { route: "plan" as const, message: "" };
    return { decision };
  },

  async apply(runtime, _output, input): Promise<AgentPhaseTransition> {
    const outcome = await executeThreadRoute(runtime, input.decision);
    return { type: "stop", outcome };
  },
};

export function createBuiltinPhaseConfig() {
  return {
    entryPhaseId: "route",
    phases: [
      routePhaseDefinition,
      threadPhaseDefinition,
      planPhaseDefinition,
      executePhaseDefinition,
      verifyPhaseDefinition,
    ],
  };
}
