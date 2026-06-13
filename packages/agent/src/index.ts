// ── core API ──────────────────────────────────────────────────
export { Agent } from "./agent";
export type { AgentOptions, RunOptions, AgentStatus } from "./agent";

export {
  AGENT_STATE_SCHEMA_VERSION,
  createMessage,
  createAgentState,
} from "./types";

export { createId, createTimestamp, createJson } from "./utils";

export type {
  AgentMessage,
  Skill,
  AgentState,
  CreateAgentStateInput,
  AgentContext,
  Tool,
  ToolExecutionMode,
  BeforeToolCall,
  AfterToolCall,
  AgentEvent,
  AgentEventListener,
  RunResult,
  Unsubscribe,
  LlmModelRef,
  StreamFn,
  AgentRunLimits,
  LoopMetrics,
} from "./types";

export { EventStream, AgentEventStream } from "./event-stream";

// ── session ────────────────────────────────────────────────────
export {
  SESSION_SCHEMA_VERSION,
  AgentMessageSchema,
  SkillSchema,
  createSession,
  appendUserTurn,
  type Session,
  type AgentMessageMetadata,
  type SessionListItem,
  LocalJsonlSessionManager,
} from "./harness/session";

// ── session manager ────────────────────────────────────────────
export {
  SESSION_MANAGER_SCHEMA_VERSION,
  InMemorySessionManager,
  createSessionHeader,
  summarizeSessionManagerRecords,
  type SessionHeader,
  type MessageSessionEntry,
  type OutcomeSessionEntry,
  type ExecutionTurnSessionEntry,
  type CompactionSessionEntry,
  type BranchSummarySessionEntry,
  type SessionInfoSessionEntry,
  type CustomSessionEntry,
  type SessionEntry,
  type SessionRecord,
  type SessionAgentContext,
  type BuildAgentContextInput,
  type CreateSessionManagerInput,
  type SessionManager,
} from "./harness/session/session-manager";

// ── tools / skills / env ───────────────────────────────────────
export { createCoreTools, type CoreToolContext } from "./harness/tools";
export { resolveSkillPath, loadSkill, loadSkills } from "./harness/skills";
export {
  resolveWorkspacePaths,
  resolveInWorkspace,
  type WorkspacePaths,
} from "./harness/env";

// ── extensions ─────────────────────────────────────────────────
export * from "./extensions";

// Re-export ExtensionRunnerRef from agent
export type { ExtensionRunnerRef } from "./agent";

// ── phases ─────────────────────────────────────────────────────
export type {
  PhaseRegistry,
  Phase,
  PhaseFrontmatter,
  PhaseState,
  PhaseTransition,
} from "./harness/phases/types";

export type {
  PhaseInput,
  PhaseOutput,
} from "./protocol/context";

export type {
  PhaseContext,
  PhaseMessageManager,
  PhaseToolExecutionManager,
  ModelInvokeOutput,
  ModelInvokeInput,
  MessageSnapshot,
} from "./loop/execution";

// ── prompt / context ───────────────────────────────────────────
export {
  buildSystemPrompt,
  buildModelRequest,
  conversationMessages,
  latestUserInput,
  serializeSkills,
  type PromptTool,
  type SerializableTool,
  type SystemPromptOptions,
} from "./harness/context";

// ── protocol (session manager & tool dependencies) ─────────────
export type {
  ExecutionTurn,
  ExecutionTurnEntry,
  StepFilter,
  Outcome,
  ToolResult,
} from "./protocol";
