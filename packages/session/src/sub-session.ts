import { createSession, nowIso, type Session, type Skill } from "./session";

export type SubSessionBudgetUsage = {
  modelCalls: number;
  toolCalls: number;
};

export type SubSessionBudgetEvent<TBudgetUsage extends SubSessionBudgetUsage = SubSessionBudgetUsage> =
  | { type: "budget_exceeded"; usage: TBudgetUsage }
  | { type: "model_requested" }
  | { type: "tool_start" }
  | { type: string };

export type SubSessionRunnerInput<TEvent extends object> = {
  parentSessionId: string;
  prompt: string;
  systemPrompt: string;
  skills?: Skill[];
  emit?: (event: TEvent) => void | Promise<void>;
};

export type SubSessionChildInput = {
  parentSessionId?: string;
  prompt: string;
  skills?: Skill[];
};

export type SessionSubSessionRunResult<
  TEvent extends object,
  TOutcome,
  TBudgetUsage extends SubSessionBudgetUsage,
> = {
  parentSessionId: string;
  session: Session<TEvent>;
  outcome: TOutcome;
  budgetUsage: TBudgetUsage;
};

export type CreateSubSessionRunnerOptions<
  TEvent extends object,
  TOutcome,
  TBudgetUsage extends SubSessionBudgetUsage,
  TRunInput extends SubSessionRunnerInput<TEvent>,
  TChildInput extends SubSessionChildInput,
> = {
  now?: () => string;
  summarizeBudgetUsage(events: readonly TEvent[]): TBudgetUsage;
  createStartEvent(input: {
    input: TRunInput;
    session: Session<TEvent>;
    ts: string;
  }): TEvent;
  createEndEvent(input: {
    input: TRunInput;
    session: Session<TEvent>;
    outcome: TOutcome;
    budgetUsage: TBudgetUsage;
    ts: string;
  }): TEvent;
  createChildInput(input: {
    parentInput: TRunInput;
    childInput: TChildInput;
    session: Session<TEvent>;
  }): TRunInput;
  run(input: {
    input: TRunInput;
    session: Session<TEvent>;
    runSubSession(input: TChildInput): Promise<SessionSubSessionRunResult<TEvent, TOutcome, TBudgetUsage>>;
  }): Promise<TOutcome>;
};

function cloneBudgetUsage<TBudgetUsage extends SubSessionBudgetUsage>(
  usage: TBudgetUsage,
): TBudgetUsage {
  return {
    modelCalls: usage.modelCalls,
    toolCalls: usage.toolCalls,
  } as TBudgetUsage;
}

export function summarizeSubSessionBudgetUsage<TBudgetUsage extends SubSessionBudgetUsage>(
  events: readonly SubSessionBudgetEvent<TBudgetUsage>[],
): TBudgetUsage {
  let exceeded: Extract<SubSessionBudgetEvent<TBudgetUsage>, { type: "budget_exceeded" }> | undefined;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (isBudgetExceededEvent(event)) {
      exceeded = event;
      break;
    }
  }

  if (exceeded) {
    return cloneBudgetUsage(exceeded.usage);
  }

  return {
    modelCalls: events.filter((event) => event.type === "model_requested").length,
    toolCalls: events.filter((event) => event.type === "tool_start").length,
  } as TBudgetUsage;
}

function isBudgetExceededEvent<TBudgetUsage extends SubSessionBudgetUsage>(
  event: SubSessionBudgetEvent<TBudgetUsage> | undefined,
): event is Extract<SubSessionBudgetEvent<TBudgetUsage>, { type: "budget_exceeded" }> {
  return event?.type === "budget_exceeded" && "usage" in event;
}

async function emitSubSessionEvent<TEvent extends object>(
  session: Session<TEvent>,
  event: TEvent,
  emit?: (event: TEvent) => void | Promise<void>,
): Promise<void> {
  session.log.push(event);
  const timestamp = "ts" in event ? event.ts : undefined;
  session.updatedAt = typeof timestamp === "string" ? timestamp : nowIso();
  await emit?.(event);
}

export function createSubSessionRunner<
  TEvent extends object,
  TOutcome,
  TBudgetUsage extends SubSessionBudgetUsage,
  TRunInput extends SubSessionRunnerInput<TEvent>,
  TChildInput extends SubSessionChildInput,
>(
  options: CreateSubSessionRunnerOptions<TEvent, TOutcome, TBudgetUsage, TRunInput, TChildInput>,
): (input: TRunInput) => Promise<SessionSubSessionRunResult<TEvent, TOutcome, TBudgetUsage>> {
  const currentTime = options.now ?? nowIso;

  const runSubSession = async (
    input: TRunInput,
  ): Promise<SessionSubSessionRunResult<TEvent, TOutcome, TBudgetUsage>> => {
    const session = createSession<TEvent>({
      systemPrompt: input.systemPrompt,
      userInput: input.prompt,
      skills: input.skills ?? [],
      parentSessionId: input.parentSessionId,
    });

    await emitSubSessionEvent(
      session,
      options.createStartEvent({ input, session, ts: currentTime() }),
      input.emit,
    );

    const runNestedSubSession = async (
      childInput: TChildInput,
    ): Promise<SessionSubSessionRunResult<TEvent, TOutcome, TBudgetUsage>> =>
      runSubSession(options.createChildInput({ parentInput: input, childInput, session }));

    const outcome = await options.run({
      input,
      session,
      runSubSession: runNestedSubSession,
    });

    const budgetUsage = options.summarizeBudgetUsage(session.log);
    await emitSubSessionEvent(
      session,
      options.createEndEvent({ input, session, outcome, budgetUsage, ts: currentTime() }),
      input.emit,
    );

    return {
      parentSessionId: input.parentSessionId,
      session,
      outcome,
      budgetUsage,
    };
  };

  return runSubSession;
}
