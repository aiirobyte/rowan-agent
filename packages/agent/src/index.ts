// ── core API ──────────────────────────────────────────────────
export { Agent } from "./agent";
export type { AgentOptions, RunOptions, AgentStatus } from "./agent";

export {
  createMessage,
  messageContentText,
} from "./types";

export { createId, createTimestamp } from "./utils";

export type {
  AgentMessage,
  AgentContext,
  Skill,
  Tool,
  ToolResult,
  AgentEvent,
  AgentEventListener,
  RunResult,
  StreamFn,
  LlmModelRef,
} from "./types";

// ── session ────────────────────────────────────────────────────
export {
  createSession,
  appendUserTurn,
  LocalJsonlSessionManager,
  type Session,
  type SessionListItem,
} from "./harness/session";

// ── tools / skills / env ───────────────────────────────────────
export { createCoreTools } from "./harness/tools";
export {
  resolveWorkspacePaths,
  resolveInWorkspace,
  type WorkspacePaths,
} from "./harness/env";

// ── config ─────────────────────────────────────────────────────
export {
  loadConfigFile,
  registerConfigModels,
  resolveDefaultModel,
  parseModelRef,
  interpolateEnvVars,
  type AgentConfigFile,
  type ProviderConfigFromFile,
  type ModelConfigFromFile,
} from "./harness/config";

// ── events ─────────────────────────────────────────────────────
export { EventStream, AgentEventStream } from "./event-stream";

// ── loop ───────────────────────────────────────────────────────
export type { LoopMetrics } from "./loop/types";

// ── extensions ─────────────────────────────────────────────────
export * from "./extensions";

// ── phases ─────────────────────────────────────────────────────
export type {
  PhaseRegistry,
  Phase,
  PhaseContext,
  PhaseState,
  PhaseOutput,
} from "./harness/phases/types";

export type {
  PhaseExecution,
} from "./loop/execution";

// ── prompt / context ───────────────────────────────────────────
export {
  buildSystemPrompt,
  buildModelRequest,
  conversationMessages,
  latestUserInput,
  serializeSkills,
} from "./harness/context";

// ── protocol ───────────────────────────────────────────────────
export type {
  ExecutionTurn,
  Outcome,
  ModelTranscript,
} from "./protocol";

// ── model dispatch ──────────────────────────────────────────────
export {
  createDispatchStream,
  registerBuiltInApiProviders,
} from "@rowan-agent/models";
