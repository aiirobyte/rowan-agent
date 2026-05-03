import {
  createSession,
  nowIso,
  type Session,
} from "@rowan-agent/session";
import { runAgentLoop } from "./loop";
import {
  createId,
  resolveMaxThreadDepth,
  Validators,
  type AgentBudgetUsage,
  type AgentEvent,
  type AgentEventListener,
  type AgentThreadInput,
  type ThreadRunInput,
  type ThreadRunResult,
} from "./types";

type AgentSession = Session<AgentEvent>;

function summarizeThreadBudgetUsage(events: readonly AgentEvent[]): AgentBudgetUsage {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "budget_exceeded") {
      return { ...event.usage };
    }
  }

  return {
    modelCalls: events.filter((event) => event.type === "model_requested").length,
    toolCalls: events.filter((event) => event.type === "tool_start").length,
  };
}

async function emitThreadEvent(
  session: AgentSession,
  event: AgentEvent,
  emit?: AgentEventListener,
): Promise<void> {
  session.log.push(event);
  session.updatedAt = event.ts;
  await emit?.(event);
}

export async function runAgentThread(input: ThreadRunInput): Promise<ThreadRunResult> {
  const threadDepth = input.threadDepth ?? 1;
  const maxThreadDepth = resolveMaxThreadDepth(input.budget);
  const verifyTasks = input.verify ?? true;
  const session = createSession<AgentEvent>({
    systemPrompt: input.systemPrompt,
    input: input.prompt,
    skills: input.skills ?? [],
    parentSessionId: input.parentSessionId,
    task: input.task,
    goal: input.goal,
  });

  await emitThreadEvent(
    session,
    {
      type: "thread_created",
      parentSessionId: input.parentSessionId,
      sessionId: session.id,
      prompt: input.prompt,
      ...(input.task ? { task: input.task } : {}),
      ...(input.goal ? { goal: input.goal } : {}),
      threadDepth,
      maxThreadDepth,
      ts: nowIso(),
    },
    input.emit,
  );

  if (threadDepth > maxThreadDepth) {
    const outcome = Validators.outcome.Parse({
      id: createId("out"),
      passed: false,
      message: `Thread depth limit exceeded (${threadDepth}/${maxThreadDepth}).`,
    });
    const budgetUsage = summarizeThreadBudgetUsage(session.log);
    await emitThreadEvent(
      session,
      {
        type: "thread_end",
        parentSessionId: input.parentSessionId,
        sessionId: session.id,
        outcome,
        budgetUsage,
        threadDepth,
        maxThreadDepth,
        ts: nowIso(),
      },
      input.emit,
    );

    return {
      parentSessionId: input.parentSessionId,
      session,
      outcome,
      budgetUsage,
      threadDepth,
      maxThreadDepth,
    };
  }

  const runNestedThread = (childInput: AgentThreadInput): Promise<ThreadRunResult> =>
    runAgentThread({
      ...childInput,
      parentSessionId: childInput.parentSessionId ?? session.id,
      threadDepth: threadDepth + 1,
      verify: childInput.verify ?? false,
      systemPrompt: input.systemPrompt,
      model: input.model,
      stream: input.stream,
      signal: input.signal,
      runtime: input.runtime,
      beforeToolCall: input.beforeToolCall,
      afterToolCall: input.afterToolCall,
      emit: input.emit,
    });

  const outcome = await runAgentLoop({
    session,
    model: input.model,
    stream: input.stream,
    tools: input.tools,
    maxAttempts: input.maxAttempts,
    budget: input.budget,
    threadDepth,
    verifyTasks,
    signal: input.signal,
    runtime: input.runtime,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    runThread: runNestedThread,
    emit: input.emit,
  });

  const budgetUsage = summarizeThreadBudgetUsage(session.log);
  await emitThreadEvent(
    session,
    {
      type: "thread_end",
      parentSessionId: input.parentSessionId,
      sessionId: session.id,
      outcome,
      budgetUsage,
      threadDepth,
      maxThreadDepth,
      ts: nowIso(),
    },
    input.emit,
  );

  return {
    parentSessionId: input.parentSessionId,
    session,
    outcome,
    budgetUsage,
    threadDepth,
    maxThreadDepth,
  };
}
