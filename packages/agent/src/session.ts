import { runAgentLoop } from "./agent-loop";
import type {
  AgentBudgetUsage,
  AgentEvent,
  AgentSubSessionInput,
  SubSessionRunInput,
  SubSessionRunResult,
} from "./types";
import { createSession as createSessionValue, nowIso } from "./types";

export { createMessage, createSession } from "./types";
export type { AgentMessage, Session } from "./types";

function cloneBudgetUsage(usage: AgentBudgetUsage): AgentBudgetUsage {
  return {
    modelCalls: usage.modelCalls,
    toolCalls: usage.toolCalls,
  };
}

export function summarizeAgentBudgetUsage(events: AgentEvent[]): AgentBudgetUsage {
  let exceeded: Extract<AgentEvent, { type: "budget_exceeded" }> | undefined;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type === "budget_exceeded") {
      exceeded = event;
      break;
    }
  }

  if (exceeded) {
    return cloneBudgetUsage(exceeded.usage);
  }

  return {
    modelCalls: events.filter((event) => event.type === "model_call").length,
    toolCalls: events.filter((event) => event.type === "tool_call_start").length,
  };
}

async function emitSubSessionEvent(
  session: SubSessionRunResult["session"],
  event: AgentEvent,
  emit?: SubSessionRunInput["emit"],
): Promise<void> {
  session.log.push(event);
  session.updatedAt = event.ts;
  await emit?.(event);
}

export async function runSubSession(input: SubSessionRunInput): Promise<SubSessionRunResult> {
  const session = createSessionValue({
    systemPrompt: input.systemPrompt,
    userInput: input.prompt,
    skills: input.skills ?? [],
    parentSessionId: input.parentSessionId,
  });

  await emitSubSessionEvent(
    session,
    {
      type: "sub_session_start",
      parentSessionId: input.parentSessionId,
      sessionId: session.id,
      prompt: input.prompt,
      ts: nowIso(),
    },
    input.emit,
  );

  const runNestedSubSession = async (
    childInput: AgentSubSessionInput,
  ): Promise<SubSessionRunResult> =>
    runSubSession({
      ...childInput,
      parentSessionId: childInput.parentSessionId ?? session.id,
      systemPrompt: input.systemPrompt,
      model: input.model,
      stream: input.stream,
      signal: input.signal,
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
    signal: input.signal,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    runSubSession: runNestedSubSession,
    emit: input.emit,
  });

  const budgetUsage = summarizeAgentBudgetUsage(session.log);
  await emitSubSessionEvent(
    session,
    {
      type: "sub_session_end",
      parentSessionId: input.parentSessionId,
      sessionId: session.id,
      outcome,
      budgetUsage,
      ts: nowIso(),
    },
    input.emit,
  );

  return {
    parentSessionId: input.parentSessionId,
    session,
    outcome,
    budgetUsage,
  };
}
