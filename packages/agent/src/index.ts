// ── core API ──────────────────────────────────────────────────
export { Agent } from "./agent";
export type { AgentOptions, RunOptions, AgentStatus } from "./agent";

export {
  DEFAULT_MAX_THREAD_DEPTH,
  AGENT_STATE_SCHEMA_VERSION,
  createMessage,
  isConversationMessage,
  messageScope,
  isContextScope,
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
  CONTEXT_SCOPES,
  ContextScopeSchema,
  AgentMessageSchema,
  SkillSchema,
  createSession,
  appendUserTurn,
  type Session,
  type ContextScope,
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
export {
  createPhaseRegistry,
  definePhase,
  DEFAULT_PHASE_ID,
  type PhaseRegistry,
  type PhaseRegistryInput,
  type PhaseManifest,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseInput,
  type PhaseOutput,
  type PhaseRun,
  type ModelInvokeOutput,
  type ModelInvokeInput,
  type MessageSnapshot,
  type PhaseMessageManager,
  type PhaseToolExecutionManager,
} from "./loop/phases";

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
