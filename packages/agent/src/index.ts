// ── core API ──────────────────────────────────────────────────
export { Agent } from "./agent";
export type { AgentOptions, RunOptions, AgentStatus } from "./agent";

export {
  DEFAULT_MAX_THREAD_DEPTH,
  AGENT_STATE_SCHEMA_VERSION,
  createId,
  createMessage,
  formatLocalTimestamp,
  isConversationMessage,
  messageScope,
  isContextScope,
  createAgentState,
} from "./types";

export type {
  AgentMessage,
  Skill,
  AgentState,
  CreateAgentStateInput,
  AgentContext,
  Tool,
  BeforeToolCall,
  AfterToolCall,
  AgentEvent,
  AgentEventListener,
  RunResult,
  Unsubscribe,
  LlmModelRef,
  StreamFn,
  AgentRunLimits,
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
export {
  ExtensionRunner,
  type ExtensionAPI,
  type ExtensionFactory,
  type ExtensionPhaseHandler,
  type PhaseManifest,
  type BeforePhaseHookContext,
  type AfterPhaseHookContext,
} from "./extensions";

// ── phases ─────────────────────────────────────────────────────
export {
  buildMessages,
  buildPrompt,
  createPhaseConfig,
  createBuiltinPromptBuilder,
  createBuiltinPhaseConfig,
  createBuiltinPhasePlugin,
  createDefaultPhaseConfig,
  definePhase,
  definePhasePlugin,
  resolvePhase,
  validatePhaseConfig,
  DEFAULT_PHASE_ID,
  type PhaseConfig,
  type PhaseConfigInput,
  type PhasePlugin,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseHandler,
  type PhaseInput,
  type PhaseOutput,
  type CollectedModelOutput,
  type ModelCollectInput,
  type PhaseMessageManager,
  type PhaseToolExecutionManager,
} from "./loop/phases";

// ── prompt / context ───────────────────────────────────────────
export {
  createPromptBuilder,
  buildSystemPrompt,
  toJson,
  serializeTools,
  serializeSkills,
  type Prompt,
  type PromptMessage,
  type PromptTool,
  type SerializableTool,
  type PhasePromptBuildInput,
  type PhasePromptBuilder,
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
