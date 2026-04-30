import { runAgentLoop } from "./agent-loop";
import type {
  AfterToolCall,
  AgentEvent,
  AgentEventListener,
  BeforeToolCall,
  ModelRef,
  Outcome,
  Session,
  Skill,
  StreamFn,
  Tool,
  Unsubscribe,
} from "./types";
import { createSession } from "./types";

export type AgentOptions = {
  systemPrompt: string;
  model: ModelRef;
  stream: StreamFn;
  tools?: Tool[];
  skills?: Skill[];
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
};

export type AgentState = {
  session?: Session;
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
  private currentRun?: Promise<Outcome>;
  private abortController?: AbortController;

  constructor(options: AgentOptions) {
    this.options = options;
    this.state = {
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

  async prompt(input: string): Promise<Outcome> {
    if (this.state.isRunning) {
      throw new Error("Agent is already running.");
    }

    const session = createSession({
      systemPrompt: this.options.systemPrompt,
      userInput: input,
      skills: this.options.skills,
    });
    this.state.session = session;
    this.state.currentOutcome = undefined;
    this.state.error = undefined;
    this.state.isRunning = true;
    this.abortController = new AbortController();

    const emit = async (event: AgentEvent) => {
      for (const listener of this.listeners) {
        await listener(event);
      }
    };

    this.currentRun = runAgentLoop({
      session,
      model: this.options.model,
      stream: this.options.stream,
      tools: this.state.tools,
      maxAttempts: this.options.maxAttempts,
      signal: this.abortController.signal,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      emit,
    });

    try {
      const outcome = await this.currentRun;
      this.state.currentOutcome = outcome;
      return outcome;
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
  }
}
