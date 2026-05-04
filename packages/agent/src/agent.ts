import { runAgentLoop } from "./loop";
import {
  type AgentMessage,
} from "@rowan-agent/session";
import type {
  ModelRef,
  AgentRunLimits,
  AgentRuntimePort,
  StreamFn,
  BeforeToolCall,
  Tool,
  AfterToolCall,
  AgentRunResult,
  AgentEvent,
  AgentContext,
  ExecutionTurn,
  AgentEventListener,
  Unsubscribe,
} from "./types";

type AgentSession = Extract<AgentRunResult, { kind: "session" }>["session"];

export type AgentRunConfig = {
  context: AgentContext;
  model: ModelRef;
  stream: StreamFn;
  session?: AgentSession;
  maxAttempts?: number;
  limits?: AgentRunLimits;
  runtime?: AgentRuntimePort;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  recordStep?: (step: ExecutionTurn) => Promise<void>;
};

export type AgentRunOverride = Partial<Omit<AgentRunConfig, "context">> & {
  context: AgentContext;
};

export type AgentState = {
  session?: AgentSession;
  context: AgentContext;
  model: ModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentResult?: AgentRunResult;
  error?: string;
};

export class Agent {
  readonly state: AgentState;
  private options: AgentRunConfig;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private currentRun?: Promise<AgentRunResult>;
  private abortController?: AbortController;
  private shouldEmitSessionLoaded: boolean;
  private shadowSessionId?: string;

  constructor(options: AgentRunConfig) {
    this.options = {
      ...options,
      context: cloneAgentContext(options.context),
    };
    this.shouldEmitSessionLoaded = Boolean(this.options.session);
    this.state = {
      ...(this.options.session ? { session: this.options.session } : {}),
      context: cloneAgentContext(this.options.context),
      model: this.options.model,
      tools: this.options.context.tools ?? [],
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

  async run(config?: AgentRunOverride): Promise<AgentRunResult> {
    if (this.state.isRunning) {
      throw new Error("Agent is already running.");
    }

    const resolved = this.resolveRunConfig(config);
    const session = resolved.session ?? this.state.session;
    const hadExistingSession = Boolean(session);
    const sessionLifecycle = hadExistingSession
      ? this.shouldEmitSessionLoaded
        ? "loaded"
        : "continued"
      : "created";
    this.shouldEmitSessionLoaded = false;
    this.options = resolved;
    if (session) {
      this.state.session = session;
    }
    this.state.context = cloneAgentContext(resolved.context);
    this.state.model = resolved.model;
    this.state.tools = resolved.context.tools ?? [];
    this.state.currentResult = undefined;
    this.state.error = undefined;
    this.state.isRunning = true;
    this.abortController = new AbortController();

    const emit = (event: AgentEvent) => {
      this.captureLoopSessionEvent(event, resolved.context);
      this.emitToListeners(event);
    };

    this.currentRun = runAgentLoop({
      kind: "session",
      context: resolved.context,
      ...(session ? { session } : {}),
      sessionLifecycle,
      model: resolved.model,
      stream: resolved.stream,
      maxAttempts: resolved.maxAttempts,
      limits: resolved.limits,
      runtime: resolved.runtime,
      threadDepth: 0,
      signal: this.abortController.signal,
      beforeToolCall: resolved.beforeToolCall,
      afterToolCall: resolved.afterToolCall,
      ...(resolved.recordStep ? { recordStep: resolved.recordStep } : {}),
      emit,
    });

    try {
      const result = await this.currentRun;
      this.state.session = result.session;
      this.shadowSessionId = undefined;
      this.state.context = contextFromSession(result.session, resolved.context.tools);
      this.state.currentResult = result;
      this.options = {
        ...resolved,
        session: result.session,
        context: cloneAgentContext(this.state.context),
      };
      return result;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : "Agent run failed.";
      throw error;
    } finally {
      this.state.isRunning = false;
      this.abortController = undefined;
    }
  }

  abort(reason = "Aborted by caller."): void {
    this.abortController?.abort(reason);
  }

  async waitForIdle(): Promise<void> {
    if (!this.currentRun) {
      return;
    }
    await this.currentRun.catch(() => undefined);
    await this.flushEvents().catch(() => undefined);
  }

  private resolveRunConfig(config?: AgentRunOverride): AgentRunConfig {
    const context = cloneAgentContext(config?.context ?? this.createContextSnapshot());
    return {
      ...this.options,
      ...config,
      context,
      session: config?.session ?? this.state.session ?? this.options.session,
    };
  }

  private createContextSnapshot(): AgentContext {
    if (this.state.session) {
      return contextFromSession(this.state.session, this.state.tools);
    }
    return cloneAgentContext(this.state.context);
  }

  private captureLoopSessionEvent(event: AgentEvent, context: AgentContext): void {
    if (event.type === "session_created" && !this.state.session) {
      this.state.session = sessionFromSnapshot(event.session, context, event);
      this.shadowSessionId = event.session.id;
      return;
    }

    if (!this.shadowSessionId || this.state.session?.id !== this.shadowSessionId) {
      return;
    }

    this.state.session.log.push(event);
    this.state.session.updatedAt = event.ts;
  }
}

function cloneMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    ...(message.metadata ? { metadata: { ...message.metadata } } : {}),
  };
}

function cloneMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(cloneMessage);
}

function cloneAgentContext(context: AgentContext): AgentContext {
  return {
    systemPrompt: context.systemPrompt,
    messages: cloneMessages(context.messages),
    ...(context.tools ? { tools: context.tools.slice() } : {}),
    ...(context.skills ? { skills: context.skills.slice() } : {}),
  };
}

function contextFromSession(session: AgentSession, tools?: Tool[]): AgentContext {
  return {
    systemPrompt: session.systemPrompt,
    messages: cloneMessages(session.messages),
    tools: tools?.slice() ?? [],
    skills: session.skills.slice(),
  };
}

function sessionFromSnapshot(
  snapshot: Extract<AgentEvent, { type: "session_created" | "session_loaded" }>["session"],
  context: AgentContext,
  event: AgentEvent,
): AgentSession {
  return {
    version: snapshot.version,
    id: snapshot.id,
    ...(snapshot.parentSessionId ? { parentSessionId: snapshot.parentSessionId } : {}),
    systemPrompt: snapshot.systemPrompt,
    input: snapshot.input,
    ...(snapshot.task ? { task: snapshot.task } : {}),
    ...(snapshot.goal ? { goal: snapshot.goal } : {}),
    messages: cloneMessages(context.messages),
    log: [event],
    skills: snapshot.skills.slice(),
    createdAt: event.ts,
    updatedAt: event.ts,
    ...(snapshot.title ? { title: snapshot.title } : {}),
  };
}
