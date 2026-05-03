import { runAgentLoop } from "./loop";
import { runThread } from "./thread";
export { runThread } from "./thread";
import {
  appendUserTurn,
  createSession,
  type Session,
  type Skill,
} from "@rowan-agent/session";
import type { AgentStore } from "@rowan-agent/store";
import type {
  AfterToolCall,
  AgentEvent,
  AgentEventListener,
  AgentThreadInput,
  BeforeToolCall,
  AgentRunBudget,
  ModelRef,
  Outcome,
  StreamFn,
  ThreadRunResult,
  Tool,
  Unsubscribe,
} from "./types";

type AgentSession = Session<AgentEvent>;

export type AgentOptions = {
  systemPrompt: string;
  model: ModelRef;
  stream: StreamFn;
  tools?: Tool[];
  skills?: Skill[];
  session?: AgentSession;
  agentStore?: AgentStore<AgentSession>;
  maxAttempts?: number;
  budget?: AgentRunBudget;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
};

export type AgentState = {
  session?: AgentSession;
  model: ModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentOutcome?: Outcome;
  error?: string;
};

export class Agent {
  readonly state: AgentState;
  private readonly options: AgentOptions;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private currentRun?: Promise<Outcome>;
  private abortController?: AbortController;
  private shouldEmitSessionLoaded: boolean;

  constructor(options: AgentOptions) {
    this.options = options;
    this.shouldEmitSessionLoaded = Boolean(options.session);
    this.state = {
      ...(options.session ? { session: options.session } : {}),
      model: options.model,
      tools: options.tools ?? [],
      isRunning: false,
    };
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitToListeners(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result && typeof result === "object" && "then" in result) {
          const task = Promise.resolve(result)
            .catch((error) => {
              this.listenerErrors.push(error);
            })
            .finally(() => {
              this.pendingListenerTasks.delete(task);
            });
          this.pendingListenerTasks.add(task);
        }
      } catch (error) {
        this.listenerErrors.push(error);
      }
    }
  }

  async flushEvents(): Promise<void> {
    while (this.pendingListenerTasks.size > 0) {
      await Promise.all([...this.pendingListenerTasks]);
    }

    for (const listener of this.listeners) {
      try {
        await listener.flush?.();
      } catch (error) {
        this.listenerErrors.push(error);
      }
    }

    if (this.listenerErrors.length > 0) {
      const [error] = this.listenerErrors;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async prompt(input: string): Promise<Outcome> {
    if (this.state.isRunning) {
      throw new Error("Agent is already running.");
    }

    const hadExistingSession = Boolean(this.state.session);
    const sessionLifecycle = hadExistingSession
      ? this.shouldEmitSessionLoaded
        ? "loaded"
        : "continued"
      : "created";
    this.shouldEmitSessionLoaded = false;
    const session = this.state.session
      ? appendUserTurn(this.state.session, input)
      : createSession<AgentEvent>({
          systemPrompt: this.options.systemPrompt,
          input,
          skills: this.options.skills,
        });
    this.state.session = session;
    this.state.currentOutcome = undefined;
    this.state.error = undefined;
    this.state.isRunning = true;
    this.abortController = new AbortController();
    await this.options.agentStore?.save(session);

    const emit = (event: AgentEvent) => {
      this.emitToListeners(event);
    };

    this.currentRun = runAgentLoop({
      session,
      sessionLifecycle,
      model: this.options.model,
      stream: this.options.stream,
      tools: this.state.tools,
      maxAttempts: this.options.maxAttempts,
      budget: this.options.budget,
      threadDepth: 0,
      signal: this.abortController.signal,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      runThread: (input) =>
        this.startThread({
          ...input,
          parentSessionId: input.parentSessionId ?? session.id,
        }),
      ...(this.options.agentStore
        ? { recordStep: (step) => this.options.agentStore!.appendStep(session.id, step) }
        : {}),
      emit,
    });

    try {
      const outcome = await this.currentRun;
      this.state.currentOutcome = outcome;
      await this.saveSession();
      return outcome;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : "Agent run failed.";
      await this.saveSession().catch(() => undefined);
      throw error;
    } finally {
      this.state.isRunning = false;
      this.abortController = undefined;
    }
  }

  abort(reason = "Aborted by caller."): void {
    this.abortController?.abort(reason);
  }

  async startThread(input: AgentThreadInput): Promise<ThreadRunResult> {
    const parentSessionId = input.parentSessionId ?? this.state.session?.id;
    if (!parentSessionId) {
      throw new Error("Threads require a parent session.");
    }

    return runThread({
      ...input,
      parentSessionId,
      systemPrompt: this.options.systemPrompt,
      model: this.options.model,
      stream: this.options.stream,
      signal: this.abortController?.signal,
      budget: input.budget ?? this.options.budget,
      threadDepth: input.threadDepth ?? 1,
      verify: input.verify,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      emit: (event) => {
        this.emitToListeners(event);
      },
    });
  }

  async waitForIdle(): Promise<void> {
    if (!this.currentRun) {
      return;
    }
    await this.currentRun.catch(() => undefined);
    await this.flushEvents().catch(() => undefined);
  }

  async loadSession(sessionId: string): Promise<void> {
    if (!this.options.agentStore) {
      throw new Error("Agent has no AgentStore.");
    }
    const session = await this.options.agentStore.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.state.session = session;
    this.shouldEmitSessionLoaded = true;
  }

  async saveSession(): Promise<void> {
    if (!this.options.agentStore || !this.state.session) {
      return;
    }
    await this.options.agentStore.save(this.state.session);
  }
}
