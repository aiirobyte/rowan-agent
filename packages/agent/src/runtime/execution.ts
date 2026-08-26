import type {
  AgentContext,
  AgentMessage,
  AfterToolCall,
  BeforeToolCall,
  ModelRef,
  Outcome,
  StreamFn,
} from "../types";
import { snapshotMessages } from "../loop/state";
import { startPhaseLoop } from "../loop/runners";
import type {
  AfterPhaseHook,
  AgentRuntimePort,
  BeforePhaseHook,
  BeforePromptHook,
  ExecutionState,
  MessageDeltaNotification,
  ThinkingDeltaNotification,
} from "../loop/types";
import { PhaseInteractionBoundary, type PhaseInteraction, type PhaseInteractionState } from "../harness/phases/interactions";
import type { PhaseExecutionIdentity, PhaseRegistry, PhaseStatus } from "../harness/phases/types";
import type { ModelTranscript } from "../protocol/turn";
import type { JsonValue } from "../runtime-events";
import type { ThinkingLevel } from "@rowan-agent/models";
import { assertJsonValue, canonicalJson, isJsonValue } from "./json";
import type { ExecutionCheckpoint } from "./contracts";

export const EXECUTION_CHECKPOINT_CODEC = "rowan.agent.execution";
export const EXECUTION_CHECKPOINT_VERSION = 1 as const;

export type ExecutionInputRequest = Readonly<{
  phase: string;
  prompt: string;
  requestedAt: string;
}>;

export type ExecutionModelContext = Readonly<{
  systemPrompt: string;
  tools: AgentContext["tools"];
  skills: AgentContext["skills"];
  phases?: PhaseRegistry;
}>;

export type OneShotExecutionInput = Readonly<{
  /** Immutable messages supplied by the durable Run projection. */
  canonicalMessages: readonly AgentMessage[];
  /** Execution-local capabilities and prompts; messages are supplied separately. */
  context: ExecutionModelContext;
  /** Durable identity exposed to Phase callbacks. */
  execution: PhaseExecutionIdentity;
  model: ModelRef;
  thinkingLevel?: ThinkingLevel;
  stream: StreamFn;
  checkpoint?: ExecutionCheckpoint;
  interactionAnswers?: Readonly<Record<string, JsonValue>>;
  maxAttempts?: number;
  signal?: AbortSignal;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  onMessage?: (message: AgentMessage) => Promise<void>;
  onMessageDelta?: (event: MessageDeltaNotification) => void;
  onThinkingDelta?: (event: ThinkingDeltaNotification) => void;
  onOutcome?: (outcome: Outcome) => Promise<void>;
  onModelTranscript?: (transcript: ModelTranscript, meta: { phase: string; model: ModelRef }) => Promise<void>;
  onPhaseStatus?: (phaseId: string, status: PhaseStatus) => void | Promise<void>;
  runtime?: AgentRuntimePort;
  onContext?: (context: AgentContext) => void;
}>;

export type OneShotExecutionResult =
  | Readonly<{
      type: "input_required";
      request: ExecutionInputRequest;
      interactions: readonly PhaseInteraction[];
      checkpoint: ExecutionCheckpoint;
      messages: readonly AgentMessage[];
    }>
  | Readonly<{
      type: "completed";
      outcome: Outcome;
      messages: readonly AgentMessage[];
    }>
  | Readonly<{
      type: "failed";
      error: unknown;
      messages: readonly AgentMessage[];
      checkpoint?: ExecutionCheckpoint;
    }>;

type CheckpointMetrics = Readonly<{
  iterations: number;
  phaseTransitions: readonly Readonly<{ from: string; to: string; ts: string }>[];
  compactionCount: number;
  retryCount: number;
  startedAt: string;
  startedAtMs: number;
  endedAt?: string;
  durationMs?: number;
}>;

type CheckpointContinuation = Readonly<{
  isContinuing: boolean;
  previousPayload?: JsonValue;
  previousResults: readonly Readonly<{ name: string; output?: JsonValue }>[];
  pendingInstruction?: string;
  previousPhaseMessageId?: string;
}>;

type CheckpointData = Readonly<{
  currentPhase: string;
  attempt: number;
  metrics: CheckpointMetrics;
  continuation?: CheckpointContinuation;
  phaseInteractions?: PhaseInteractionState;
}>;

export class ExecutionCheckpointError extends Error {
  readonly code = "checkpoint_incompatible" as const;

  constructor(message: string) {
    super(message);
    this.name = "ExecutionCheckpointError";
  }
}

class InputRequiredBoundary extends Error {
  constructor(
    readonly state: ExecutionState,
    readonly request: ExecutionInputRequest,
  ) {
    super("Execution requires input.");
    this.name = "InputRequiredBoundary";
  }
}

export function encodeExecutionCheckpoint(state: ExecutionState): ExecutionCheckpoint {
  if (state.status !== "suspended") {
    throw new ExecutionCheckpointError("Only a suspended execution can be checkpointed.");
  }
  const metrics = {
    iterations: state.metrics.iterations,
    phaseTransitions: state.metrics.phaseTransitions.map((transition) => ({ ...transition })),
    compactionCount: state.metrics.compactionCount,
    retryCount: state.metrics.retryCount,
    startedAt: state.metrics.startedAt,
    startedAtMs: state.metrics.startedAtMs,
    ...(state.metrics.endedAt !== undefined ? { endedAt: state.metrics.endedAt } : {}),
    ...(state.metrics.durationMs !== undefined ? { durationMs: state.metrics.durationMs } : {}),
  };
  const continuation = state.continuation
    ? {
        isContinuing: state.continuation.isContinuing,
        previousResults: state.continuation.previousResults.map((result) => ({
          name: result.name,
          ...(result.output !== undefined ? { output: result.output } : {}),
        })),
        ...(state.continuation.previousPayload !== undefined ? { previousPayload: state.continuation.previousPayload } : {}),
        ...(state.continuation.pendingInstruction !== undefined ? { pendingInstruction: state.continuation.pendingInstruction } : {}),
        ...(state.continuation.previousPhaseMessageId !== undefined ? { previousPhaseMessageId: state.continuation.previousPhaseMessageId } : {}),
      }
    : undefined;
  const data = {
    currentPhase: state.currentPhase,
    attempt: state.attempt,
    metrics,
    ...(continuation ? { continuation } : {}),
    ...(state.phaseInteractions === undefined ? {} : { phaseInteractions: state.phaseInteractions }),
  } as unknown as CheckpointData;
  assertJsonValue(data, "execution checkpoint");
  return {
    codec: EXECUTION_CHECKPOINT_CODEC,
    version: EXECUTION_CHECKPOINT_VERSION,
    data: JSON.parse(canonicalJson(data)) as JsonValue,
  };
}

export function decodeExecutionCheckpoint(checkpoint: ExecutionCheckpoint): ExecutionState {
  if (checkpoint.codec !== EXECUTION_CHECKPOINT_CODEC || checkpoint.version !== EXECUTION_CHECKPOINT_VERSION) {
    throw new ExecutionCheckpointError(
      `Unsupported execution checkpoint ${checkpoint.codec}@${checkpoint.version}.`,
    );
  }
  if (!isCheckpointData(checkpoint.data)) {
    throw new ExecutionCheckpointError("Execution checkpoint payload is invalid.");
  }
  return {
    currentPhase: checkpoint.data.currentPhase,
    attempt: checkpoint.data.attempt,
    metrics: {
      ...checkpoint.data.metrics,
      phaseTransitions: checkpoint.data.metrics.phaseTransitions.map((transition) => ({ ...transition })),
    },
    status: "suspended",
    ...(checkpoint.data.continuation ? {
      continuation: {
        ...checkpoint.data.continuation,
        previousResults: checkpoint.data.continuation.previousResults.map((result) => ({ ...result })),
      },
    } : {}),
    ...(checkpoint.data.phaseInteractions ? {
      phaseInteractions: {
        requests: checkpoint.data.phaseInteractions.requests.map((request) => ({ ...request })),
        answers: { ...checkpoint.data.phaseInteractions.answers },
        ...(checkpoint.data.phaseInteractions.checkpoint === undefined
          ? {}
          : { checkpoint: checkpoint.data.phaseInteractions.checkpoint }),
      },
    } : {}),
  };
}

export async function executeOnce(input: OneShotExecutionInput): Promise<OneShotExecutionResult> {
  let restored: ExecutionState | undefined;
  const messages = snapshotMessages([...input.canonicalMessages]);
  try {
    restored = input.checkpoint ? decodeExecutionCheckpoint(input.checkpoint) : undefined;
  } catch (error) {
    return { type: "failed", error, messages };
  }

  const context: AgentContext = {
    systemPrompt: input.context.systemPrompt,
    messages,
    tools: [...input.context.tools],
    skills: [...input.context.skills],
    ...(input.context.phases ? { phases: input.context.phases } : {}),
  };
  input.onContext?.(context);
  const state: ExecutionState = restored ?? {
    currentPhase: "",
    attempt: 0,
    status: "running",
    metrics: createMetrics(),
  };
  if (input.interactionAnswers) {
    state.phaseInteractions = {
      requests: state.phaseInteractions?.requests ?? [],
      answers: {
        ...(state.phaseInteractions?.answers ?? {}),
        ...input.interactionAnswers,
      },
      ...(state.phaseInteractions?.checkpoint === undefined
        ? {}
        : { checkpoint: state.phaseInteractions.checkpoint }),
    };
  }
  const config = {
    context,
    execution: input.execution,
    model: input.model,
    ...(input.thinkingLevel === undefined ? {} : { thinkingLevel: input.thinkingLevel }),
    stream: input.stream,
    maxAttempts: input.maxAttempts,
    signal: input.signal,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    beforePhase: input.beforePhase,
    afterPhase: input.afterPhase,
    beforePrompt: input.beforePrompt,
    onMessage: input.onMessage,
    onMessageDelta: input.onMessageDelta,
    onThinkingDelta: input.onThinkingDelta,
    onOutcome: input.onOutcome,
    onModelTranscript: input.onModelTranscript,
    onPhaseStatus: input.onPhaseStatus,
    runtime: input.runtime,
    waitForInput: async (nextState: ExecutionState | undefined, request: { phase: string; prompt: string; requestedAt: string } | undefined) => {
      if (!nextState || !request) throw new Error("Input boundary did not include execution state.");
      throw new InputRequiredBoundary(nextState, request);
    },
  };

  try {
    const result = await startPhaseLoop(config, state);
    return {
      type: "completed",
      outcome: result.outcome,
      messages: snapshotMessages(context.messages),
    };
  } catch (error) {
    if (error instanceof InputRequiredBoundary) {
      return {
        type: "input_required",
        request: error.request,
        interactions: [],
        checkpoint: encodeExecutionCheckpoint(error.state),
        messages: snapshotMessages(context.messages),
      };
    }
    if (error instanceof PhaseInteractionBoundary) {
      return {
        type: "input_required",
        request: {
          phase: error.interactions[0]?.phase ?? state.currentPhase,
          prompt: error.interactions.map((interaction) => interaction.prompt).join("\n"),
          requestedAt: error.interactions[0]?.createdAt ?? new Date().toISOString(),
        },
        interactions: error.interactions,
        checkpoint: encodeExecutionCheckpoint(error.state),
        messages: snapshotMessages(context.messages),
      };
    }
    return {
      type: "failed",
      error,
      messages: snapshotMessages(context.messages),
      ...(restored ? { checkpoint: input.checkpoint } : {}),
    };
  }
}

function createMetrics(): ExecutionState["metrics"] {
  return {
    iterations: 0,
    phaseTransitions: [],
    compactionCount: 0,
    retryCount: 0,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isCheckpointData(value: JsonValue): value is CheckpointData {
  if (!isRecord(value) || typeof value.currentPhase !== "string" || !Number.isInteger(value.attempt)) return false;
  if (!isMetrics(value.metrics)) return false;
  if (value.continuation !== undefined && !isContinuation(value.continuation)) return false;
  if (value.phaseInteractions !== undefined && !isPhaseInteractionState(value.phaseInteractions)) return false;
  return true;
}

function isPhaseInteractionState(value: unknown): value is PhaseInteractionState {
  if (!isRecord(value) || !Array.isArray(value.requests) || !isRecord(value.answers)) return false;
  if (!Object.values(value.answers).every((answer) => isJsonValue(answer))) return false;
  if (value.checkpoint !== undefined && !isJsonValue(value.checkpoint)) return false;
  return value.requests.every((request) => isRecord(request)
    && typeof request.id === "string"
    && typeof request.phase === "string"
    && ["user_input", "permission", "elicitation", "confirmation"].includes(request.kind as string)
    && typeof request.prompt === "string"
    && typeof request.createdAt === "string"
    && ["pending", "answered", "denied", "cancelled", "expired"].includes(request.status as string)
    && (request.payload === undefined || isJsonValue(request.payload)));
}

function isMetrics(value: unknown): value is CheckpointMetrics {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.iterations)
    && Array.isArray(value.phaseTransitions)
    && value.phaseTransitions.every((transition) => isRecord(transition)
      && typeof transition.from === "string"
      && typeof transition.to === "string"
      && typeof transition.ts === "string")
    && Number.isInteger(value.compactionCount)
    && Number.isInteger(value.retryCount)
    && typeof value.startedAt === "string"
    && Number.isFinite(value.startedAtMs)
    && (value.endedAt === undefined || typeof value.endedAt === "string")
    && (value.durationMs === undefined || Number.isFinite(value.durationMs));
}

function isContinuation(value: unknown): value is NonNullable<ExecutionState["continuation"]> {
  if (!isRecord(value) || typeof value.isContinuing !== "boolean" || !Array.isArray(value.previousResults)) return false;
  if (value.previousPayload !== undefined && !isJsonValue(value.previousPayload)) return false;
  return value.previousResults.every((result) => isRecord(result)
    && typeof result.name === "string"
    && (result.output === undefined || isJsonValue(result.output)))
    && (value.pendingInstruction === undefined || typeof value.pendingInstruction === "string")
    && (value.previousPhaseMessageId === undefined || typeof value.previousPhaseMessageId === "string");
}
