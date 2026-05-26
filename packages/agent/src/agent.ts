import { runAgentLoop } from "./agent-loop";
import type {
  AgentMessage,
  LlmModelRef,
  AgentRunLimits,
  StreamFn,
  BeforeToolCall,
  Tool,
  AfterToolCall,
  AgentRunResult,
  AgentEvent,
  AgentContext,
  AgentEventListener,
  Unsubscribe,
} from "./types";

export type AgentRunConfig = {
  context: AgentContext;
  model: LlmModelRef;
  stream: StreamFn;
  sessionId?: string;
  maxAttempts?: number;
  limits?: AgentRunLimits;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
};

export type AgentRunOverride = Partial<Omit<AgentRunConfig, "context">> & {
  context: AgentContext;
};

export type AgentControllerState = {
  sessionId?: string;
  context: AgentContext;
  model: LlmModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentResult?: AgentRunResult;
  error?: string;
};

export class Agent {
  readonly state: AgentControllerState;
  private options: AgentRunConfig;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private currentRun?: Promise<AgentRunResult>;
  private abortController?: AbortController;

  constructor(options: AgentRunConfig) {
    this.options = {
      ...options,
      context: cloneAgentContext(options.context),
    };
    this.state = {
      ...(this.options.sessionId ? { sessionId: this.options.sessionId } : {}),
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
    const previousSessionId = this.state.sessionId ?? this.options.sessionId;
    const sessionId = resolved.sessionId ?? this.state.sessionId;
    const hadExistingSession = Boolean(sessionId && previousSessionId === sessionId);
    this.options = resolved;
    if (sessionId) {
      this.state.sessionId = sessionId;
    }
    this.state.context = cloneAgentContext(resolved.context);
    this.state.model = resolved.model;
    this.state.tools = resolved.context.tools ?? [];
    this.state.currentResult = undefined;
    this.state.error = undefined;
    this.state.isRunning = true;
    this.abortController = new AbortController();

    const emit = (event: AgentEvent) => {
      this.emitToListeners(event);
    };

    this.currentRun = runAgentLoop({
      kind: "run",
      context: resolved.context,
      ...(sessionId ? { sessionId } : {}),
      model: resolved.model,
      stream: resolved.stream,
      maxAttempts: resolved.maxAttempts,
      limits: resolved.limits,
      threadDepth: 0,
      signal: this.abortController.signal,
      beforeToolCall: resolved.beforeToolCall,
      afterToolCall: resolved.afterToolCall,
      emit,
    });

    try {
      const result = await this.currentRun;
      this.state.sessionId = result.sessionId;
      this.state.context = {
        ...cloneAgentContext(resolved.context),
        messages: cloneMessages(result.messages),
      };
      this.state.currentResult = result;
      this.options = {
        ...resolved,
        sessionId: result.sessionId,
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
      sessionId: config?.sessionId ?? this.state.sessionId ?? this.options.sessionId,
    };
  }

  private createContextSnapshot(): AgentContext {
    return cloneAgentContext(this.state.context);
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
