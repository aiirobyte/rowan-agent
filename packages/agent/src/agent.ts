import { runAgentLoop } from "./agent-loop";
import { createDefaultPhaseRegistry } from "./extensions";
import type { PhaseRegistry } from "./loop/phases";
import type {
  AgentMessage,
  LlmModelRef,
  AgentRunLimits,
  StreamFn,
  BeforeToolCall,
  Tool,
  AfterToolCall,
  RunResult,
  AgentEvent,
  AgentContext,
  AgentEventListener,
  Unsubscribe,
} from "./types";

export type AgentOptions = {
  context: AgentContext;
  model: LlmModelRef;
  stream: StreamFn;
  cwd?: string;
  phaseConfig?: PhaseRegistry;
  sessionId?: string;
  maxAttempts?: number;
  limits?: AgentRunLimits;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
};

export type RunOptions = Partial<Omit<AgentOptions, "context">> & {
  context: AgentContext;
};

export type AgentStatus = {
  sessionId?: string;
  context: AgentContext;
  model: LlmModelRef;
  tools: Tool[];
  isRunning: boolean;
  currentResult?: RunResult;
  error?: string;
};

export class Agent {
  readonly state: AgentStatus;
  private options: AgentOptions;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly pendingListenerTasks = new Set<Promise<void>>();
  private readonly listenerErrors: unknown[] = [];
  private activeRun?: { promise: Promise<RunResult>; resolve: (result: RunResult) => void; abortController: AbortController };

  constructor(options: AgentOptions) {
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

  private processEvents(event: AgentEvent): void {
    // State reducer
    switch (event.type) {
      case "message_start":
        this.state.currentResult = undefined;
        break;
      case "message_end":
        break;
      case "agent_end":
        break;
    }

    // Notify listeners
    this.emitToListeners(event);
  }

  private handleRunFailure(error: unknown, aborted: boolean): void {
    const message = error instanceof Error ? error.message : "Agent run failed.";
    this.state.error = message;
    // turn_end and agent_end are handled by runAgentLoop's phase turn() and finally block.
  }

  private async runWithLifecycle(
    executor: (signal: AbortSignal) => Promise<RunResult>,
  ): Promise<RunResult> {
    if (this.activeRun) {
      throw new Error("Agent is already running.");
    }

    let resolvePromise!: (result: RunResult) => void;
    const abortController = new AbortController();
    const promise = new Promise<RunResult>((resolve) => {
      resolvePromise = resolve;
    });
    this.activeRun = { promise, resolve: resolvePromise, abortController };
    this.state.isRunning = true;

    try {
      const result = await executor(abortController.signal);
      resolvePromise(result);
      return result;
    } catch (error) {
      this.handleRunFailure(error, abortController.signal.aborted);
      resolvePromise(undefined as unknown as RunResult);
      throw error;
    } finally {
      this.finishRun();
    }
  }

  private finishRun(): void {
    this.state.isRunning = false;
    this.activeRun = undefined;
  }

  async run(config?: RunOptions): Promise<RunResult> {
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

    return this.runWithLifecycle(async (signal) => {
      const emit = (event: AgentEvent) => {
        this.processEvents(event);
      };
      const phaseConfig = resolved.phaseConfig ?? await createDefaultPhaseRegistry({
        cwd: resolved.cwd ?? process.cwd(),
      });

      const result = await runAgentLoop({
        kind: "run",
        context: resolved.context,
        ...(sessionId ? { sessionId } : {}),
        model: resolved.model,
        stream: resolved.stream,
        maxAttempts: resolved.maxAttempts,
        limits: resolved.limits,
        threadDepth: 0,
        signal,
        beforeToolCall: resolved.beforeToolCall,
        afterToolCall: resolved.afterToolCall,
        phaseConfig,
        emit,
      });

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
    });
  }

  abort(reason = "Aborted by caller."): void {
    this.activeRun?.abortController.abort(reason);
  }

  async waitForIdle(): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    await this.activeRun.promise.catch(() => undefined);
    await this.flushEvents().catch(() => undefined);
  }

  private resolveRunConfig(config?: RunOptions): AgentOptions {
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
