import { AgentExecution } from "./agent-execution";
import type { LoadedExtension } from "./extensions";
import { createMessage } from "./types";
import type {
  AfterToolCall,
  AgentContext,
  AgentEventListener,
  AgentMessage,
  BeforeToolCall,
  LlmModelRef,
  StreamFn,
  ToolResult,
  Unsubscribe,
} from "./types";
import type { AgentId, AgentRunId } from "./runtime/domain";
import type { AgentRun } from "./runtime/agent-run";
import type { RuntimeToolExecutionInput } from "./runtime/tool-runtime";
import type { Outcome } from "./protocol";
import type { ModelTranscript } from "./protocol/turn";
import type { SessionManager } from "./harness/session/session-manager";
import type { ModelConfig } from "@rowan-agent/models";

type AgentCommonOptions = {
  context: AgentContext;
  cwd?: string;
  extensions?: LoadedExtension[];
  maxAttempts?: number;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onOutcome?: (outcome: Outcome) => Promise<void>;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: LlmModelRef }) => Promise<void>;
};

type AgentModelOptions =
  | { model: ModelConfig; stream?: never }
  | { model: LlmModelRef; stream: StreamFn };

export type AgentOptions = AgentCommonOptions & AgentModelOptions;

export type StreamAgentOptions = AgentCommonOptions & {
  model: LlmModelRef;
  stream: StreamFn;
};

export type AgentCreateOptions = AgentOptions & {
  input?: string;
  factoryId?: string;
};

export type AgentRunControl = {
  suspend(reason?: string): Promise<void>;
};

const AGENT_CONSTRUCTION = Symbol("rowan.agent.construction");
const ATTACH_AGENT = Symbol("rowan.agent.attach");

export type AttachedAgentBinding = {
  abort(reason?: string): void;
  execute(input: AgentMessage, runId: AgentRunId, control: AgentRunControl): Promise<Outcome>;
};

export type AttachAgentInput = {
  options: StreamAgentOptions;
  agentId: AgentId;
  sessionId: string;
  manager: SessionManager;
  submit(input: AgentMessage, persist: () => Promise<void>): Promise<AgentRun>;
  executeTool(input: RuntimeToolExecutionInput): Promise<ToolResult>;
};

export class Agent {
  private constructor(
    token: typeof AGENT_CONSTRUCTION,
    readonly id: AgentId,
    readonly sessionId: string,
    private readonly execution: AgentExecution,
    private readonly submitInput: (input: AgentMessage) => Promise<AgentRun>,
  ) {
    if (token !== AGENT_CONSTRUCTION) {
      throw new Error("Agent lifecycle is owned by AgentRuntime.");
    }
  }

  static [ATTACH_AGENT](
    id: AgentId,
    sessionId: string,
    execution: AgentExecution,
    submitInput: (input: AgentMessage) => Promise<AgentRun>,
  ): Agent {
    return new Agent(AGENT_CONSTRUCTION, id, sessionId, execution, submitInput);
  }

  static loadSkills(targetPath: string): Promise<AgentContext["skills"]> {
    return AgentExecution.loadSkills(targetPath);
  }

  static loadPhases(targetPath: Parameters<typeof AgentExecution.loadPhases>[0]) {
    return AgentExecution.loadPhases(targetPath);
  }

  static loadExtensions(targetPath: string) {
    return AgentExecution.loadExtensions(targetPath);
  }

  subscribe(listener: AgentEventListener): Unsubscribe {
    return this.execution.subscribe(listener);
  }

  flushEvents(): Promise<void> {
    return this.execution.flushEvents();
  }

  send(input: string | AgentMessage): Promise<AgentRun> {
    const message = typeof input === "string" ? createMessage("user", input) : input;
    return this.submitInput(message);
  }
}

export async function attachAgent(input: AttachAgentInput): Promise<{
  agent: Agent;
  binding: AttachedAgentBinding;
}> {
  const restoredContext = await input.manager.buildAgentContext({
    tools: input.options.context.tools,
    skills: input.options.context.skills,
  });
  const context: AgentContext = {
    ...restoredContext,
    systemPrompt: input.options.context.systemPrompt || restoredContext.systemPrompt,
    phases: input.options.context.phases,
  };
  const persistInput = async (message: AgentMessage) => {
    await input.manager.appendMessage(message);
  };
  let execution: AgentExecution;
  execution = new AgentExecution({
    ...input.options,
    context,
    agentId: input.agentId,
    sessionId: input.sessionId,
    runtime: {
      tools: async ({ config, toolCall }) => {
        const tool = config.context.tools.find((candidate) => candidate.name === toolCall.name);
        const runId = execution.getRuntimeRunId();
        if (!tool || !runId) {
          const message = `Tool ${toolCall.name} is not available to this Agent Run.`;
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            ok: false,
            content: message,
            error: message,
          };
        }
        return input.executeTool({
          agentId: input.agentId,
          runId,
          tool,
          toolCall,
          context: config.context,
          beforeToolCall: config.beforeToolCall,
          afterToolCall: config.afterToolCall,
          signal: config.signal,
        });
      },
    },
    onMessage: async (message) => {
      await input.manager.appendMessage(message);
      await input.options.onMessage?.(message);
    },
    onInput: persistInput,
    onOutcome: async (outcome) => {
      await input.manager.appendOutcome(outcome);
      await input.options.onOutcome?.(outcome);
    },
    onModelTranscript: async (transcript, meta) => {
      await input.manager.appendModelTranscript(transcript, meta);
      await input.options.onModelTranscript?.(transcript, meta);
    },
  });
  const agent = Agent[ATTACH_AGENT](
    input.agentId,
    input.sessionId,
    execution,
    (message) => input.submit(message, () => persistInput(message)),
  );
  return {
    agent,
    binding: {
      abort: (reason) => execution.abortFromRuntime(reason),
      execute: (message, runId, control) => execution.executeAgentInput(message, runId, control),
    },
  };
}
