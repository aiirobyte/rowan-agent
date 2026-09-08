import { type CoreToolContext } from "./harness/tools";
import type { Tool as RuntimeTool } from "./runtime/contracts";
import { createRuntimeCoreTools } from "./runtime/core-tools";

export { AgentRuntime } from "./runtime/durable-runtime";
export { ResourceRegistry, ResourceRegistryError } from "./runtime/resource-registry";
export { resolveConfigurationSnapshot } from "./runtime/configuration-snapshot";
export { materializeConfigurationSnapshot } from "./runtime/configuration-snapshot";
export {
  ExtensionLifetimeError,
  RuntimeBootstrapRegistry,
  RuntimeExtensionLifetime,
} from "./runtime/extension-lifetime";
export type {
  ExtensionActivationError,
  ExtensionActivationResult,
  ExtensionContribution,
  ExtensionLoadInput,
  ExtensionLifetimeErrorCode,
} from "./runtime/extension-lifetime";
export { InMemoryStore } from "./runtime/durable-store";
export { SqliteStore } from "./runtime/sqlite-durable-store";
export { InMemoryConfigProvider, brandConfigToken } from "./runtime/config-provider";
export { RuntimeError, isRuntimeError } from "./runtime/errors";
export { loadSkill, loadSkills } from "./harness/skills";
export { loadPhase } from "./harness/phases/loader";
export { loadPhases } from "./harness/phases/loader";
export {
  COMPACT_PHASE_ID,
  DEFAULT_PHASE_ID,
  STOP_PHASE_ID,
  createCompactPhase,
  createCorePhases,
  createDefaultPhase,
  createStopPhase,
} from "./harness/phases/core-phases";
export { loadExtensionsFromPath as loadExtensions } from "./extensions/loader";
export { parseAgentDefinition } from "./harness/definitions";
export { parseFrontmatter } from "./harness/loader";

export function createCoreTools(input: CoreToolContext = {}): RuntimeTool[] {
  return createRuntimeCoreTools(input);
}

export type {
  AgentConfig,
  AgentConfigRequest,
  AgentResources,
  AgentId,
  AgentListCursor,
  AgentRecord,
  AgentRun,
  AgentRuntimeOptions,
  AgentSummary,
  AfterToolCall,
  AssistantContent,
  AssistantMessage,
  BeforeToolCall,
  ConfigProvider,
  ConfigPutResult,
  ConfigResolution,
  ConfigToken,
  ContextCompactionRecord,
  ContextStatus,
  ContextCandidate,
  DurableConsumer,
  DurableRunEvent,
  DurableStore,
  DurableToolResult,
  EventCursor,
  EventId,
  ExecutionCheckpoint,
  ExecutionId,
  ExecutionToken,
  InputRequest,
  InputRequestId,
  InputRequiredCommit,
  InvocationCatalogEntry,
  InvocationSource,
  HistorySeed,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Message,
  MessageBase,
  MessageCommitted,
  MessageContent,
  MessageDelta,
  ThinkingDelta,
  MessageId,
  MessageRevisionResult,
  MessageRevised,
  RetentionResult,
  Metadata,
  OpaqueId,
  Outcome,
  OwnerLease,
  OwnerToken,
  Page,
  RunBoundary,
  RunClaim,
  RunEvent,
  RunFailure,
  RunId,
  RunListCursor,
  RunRecord,
  RunSnapshot,
  RunState,
  RunSummary,
  RunStateChanged,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCallId,
  ToolCallSnapshot,
  ToolCallState,
  ToolExecutionResult,
  ToolInvocationContext,
  ToolProgress,
  ToolMessage,
  ToolMessageContent,
  ToolResultContent,
  ToolStateChanged,
  ToolUseContent,
  UserContent,
  UserInput,
  UserMessage,
} from "./runtime/contracts";
export type {
  LoadInput,
  LoadResult,
  PhaseContribution,
  ResourceDiagnostic,
  ResourceKind,
  ResourceRef,
  ResourceRegistryErrorCode,
  ResourceSourceId,
  ResourceView,
  ResolvedResourceView,
  ToolContribution,
} from "./runtime/resource-registry";
export type {
  AgentConfiguration,
  ConfigurationSnapshot,
  DefinitionLayer,
} from "./runtime/configuration-snapshot";

export type { AgentDefinition, PhaseRegistrySelection } from "./harness/definitions";
export type { FrontmatterResult } from "./harness/loader";

export type {
  AnyRuntimeError,
  RuntimeErrorCode,
  RuntimeErrorDetails,
} from "./runtime/errors";

export type { ModelConfig, ModelRef, StreamFn, ThinkingLevel } from "@rowan-agent/models";
export type {
  Skill,
} from "./protocol";

export type {
  ExtensionAPI,
  ExtensionDisposer,
  ExtensionFactory,
  ExtensionFactoryResult,
  HookEvent,
  HookEventType,
  HookHandler,
  LoadExtensionsResult,
  LoadedExtension,
  ToolDefinition,
} from "./extensions";

export type {
  Phase,
  PhaseContext,
  PhaseExecutionIdentity,
  PhaseInvocation,
  PhaseStatusState,
  PhaseOutput,
  PhaseStatus,
  PhaseRegistry,
  PhaseState,
} from "./harness/phases/types";
export type { PhaseExecution, PhaseMessageManager } from "./loop/execution";
export type {
  PhaseInteraction,
  PhaseInteractionDriver,
  PhaseInteractionKind,
  PhaseInteractionState,
  PhaseInteractionStatus,
} from "./harness/phases/interactions";
export {
  PhaseInteractionBoundary,
  PhaseInteractionCancelledError,
} from "./harness/phases/interactions";
export type { CoreToolContext } from "./harness/tools";
