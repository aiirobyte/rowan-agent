import {
  createFailedOutcome,
  createOutcome,
} from "../task";
import type {
  AgentRunResult,
  Outcome,
  Task,
  TaskRoutingDecision,
} from "../types";
import {
  createId,
  createMessage,
  latestUserInput,
  nowIso,
  Validators,
} from "../types";
import {
  createThreadTaskOutput,
  runtimeDepth,
  verifyPhase,
} from "./shared";
import type { AgentLoopRuntime } from "../loop";
import {
  appendMessage,
  createAgentLoopContext,
  emit,
} from "../loop";
import {
  runPhase,
  verifyTask,
} from "./phases";

type ThreadRunResult = Extract<AgentRunResult, { kind: "thread" }>;

function shortThreadTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function createThreadTask(decision: TaskRoutingDecision, fallbackPrompt: string): Task {
  const thread = decision.thread;
  const taskText = thread?.task ?? decision.message;
  const goalText = thread?.goal ?? `Thread outcome must satisfy: ${taskText || fallbackPrompt}`;

  return Validators.task.Parse({
    id: createId("task"),
    title: `Thread: ${shortThreadTitle(taskText || fallbackPrompt)}`,
    instruction: taskText || fallbackPrompt,
    acceptanceCriteria: [
      {
        id: createId("crit"),
        type: "model_judge",
        description: goalText,
        required: true,
      },
    ],
    toolNames: [],
    skillIds: [],
    status: "pending",
    attempts: 0,
  });
}

export async function executeThreadRoute(
  input: AgentLoopRuntime,
  decision: TaskRoutingDecision,
): Promise<Outcome> {
  if (input.threadDepth >= input.maxThreadDepth) {
    const task = createThreadTask(decision, latestUserInput(input.agentState));
    task.status = "failed";
    return createFailedOutcome(task, {
      passed: false,
      message: `Thread depth limit reached (${input.threadDepth}/${input.maxThreadDepth}).`,
    });
  }

  if (!input.runThread) {
    const task = createThreadTask(decision, latestUserInput(input.agentState));
    task.status = "failed";
    return createFailedOutcome(task, {
      passed: false,
      message: "Thread route was selected, but no thread runner is configured.",
    });
  }

  const currentInput = latestUserInput(input.agentState);
  const prompt = decision.thread?.prompt ?? currentInput;
  const threadTask = decision.thread?.task ?? currentInput;
  const goal = decision.thread?.goal ?? `Complete the delegated work and return a verifiable outcome for: ${threadTask}`;
  const task = createThreadTask(
    {
      ...decision,
      thread: { prompt, task: threadTask, goal },
    },
    currentInput,
  );

  await emit(input, {
    type: "task_created",
    task,
    ts: nowIso(),
  });

  task.status = "running";
  task.attempts = 1;
  await emit(input, {
    type: "task_start",
    taskId: task.id,
    attempt: 1,
    ts: nowIso(),
  });

  const thread = await input.runThread({
    prompt,
    task: threadTask,
    goal,
    tools: input.tools,
    skills: input.agentState.skills,
    maxAttempts: input.maxAttempts,
    limits: input.limits,
    threadDepth: input.threadDepth + 1,
  });
  const threadOutput = createThreadTaskOutput({
    thread: thread satisfies ThreadRunResult,
    prompt,
    task: threadTask,
    goal,
  });
  await appendMessage(
    input,
    createMessage("assistant", JSON.stringify(threadOutput), {
      kind: "thread_output",
      threadSessionId: thread.sessionId,
      parentSessionId: thread.parentSessionId,
      scope: "execution",
    }),
  );

  await emit(input, {
    type: "task_end",
    taskId: task.id,
    attempt: 1,
    ts: nowIso(),
  });

  input.status = "verifying";
  const verifyPhaseResult = await runPhase(
    createAgentLoopContext(input),
    verifyPhase,
    {
      state: input.agentState,
      task,
      taskOutput: threadOutput,
      criteria: task.acceptanceCriteria,
      runtime: runtimeDepth(input),
    },
    (phaseInput) => verifyTask(createAgentLoopContext(input), phaseInput),
  );
  if (verifyPhaseResult.type === "abort") {
    return verifyPhaseResult.outcome;
  }
  const verification = verifyPhaseResult.output;
  if (verification.passed) {
    task.status = "passed";
    return createOutcome(task, verification);
  }

  task.status = "failed";
  return createFailedOutcome(task, verification);
}
