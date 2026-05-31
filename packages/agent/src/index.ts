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
  createBuiltinPhaseRegistry,
  createDefaultPhaseRegistry,
  createExtensionRuntime,
  defineExtension,
  discoverAndLoadExtensions,
  ExtensionRunner,
  getBuiltinExtensions,
  getBuiltinRuntime,
  loadExtensionFromFactory,
  loadExtensionFromFactorySync,
  loadExtensions,
  type CreateDefaultPhaseRegistryOptions,
  type ExecOptions,
  type ExecResult,
  type Extension,
  type ExtensionAPI,
  type ExtensionFactory,
  type ExtensionHandler,
  type ExtensionPackageManifest,
  type ExtensionPhaseHandler,
  type ExtensionRuntime,
  type LoadExtensionsResult,
  type PhaseRegistration,
  type RegisteredPhase,
  type BeforePhaseHookContext,
  type AfterPhaseHookContext,
} from "./extensions";

// ── phases ─────────────────────────────────────────────────────
export {
  createPhaseRegistry,
  definePhase,
  DEFAULT_PHASE_ID,
  type PhaseRegistry,
  type PhaseRegistryInput,
  type PhaseHandler,
  type PhaseManifest,
  type PhaseContext,
  type PhaseDefinition,
  type PhaseInput,
  type PhaseOutput,
  type PhaseRun,
  type ModelCollectedOutput,
  type ModelCollectInput,
  type PhaseMessageManager,
  type PhaseToolExecutionManager,
} from "./loop/phases";

// ── prompt / context ───────────────────────────────────────────
export {
  createPromptBuilder,
  buildSystemPrompt,
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
