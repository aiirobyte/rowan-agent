import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "./harness/tools";
import type { JsonValue, Tool as RuntimeTool, ToolInvocationContext } from "./runtime/contracts";

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
export { loadExtensionsFromPath as loadExtensions } from "./extensions/loader";
export { parseAgentDefinition } from "./harness/definitions";
export { parseFrontmatter } from "./harness/loader";

export function createCoreTools(input: CoreToolContext = {}): RuntimeTool[] {
  return createLegacyCoreTools(input).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args: JsonValue, context: ToolInvocationContext, signal: AbortSignal) => {
      const result = await tool.execute(args, { skills: [], toolCallId: context.toolCallId }, signal);
      return result.ok
        ? { ok: true, content: result.content as JsonValue }
        : { ok: false, content: result.content as JsonValue, error: result.error ?? "Tool failed." };
    },
  }));
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
  HistorySeed,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Message,
  MessageBase,
  MessageCommitted,
  MessageContent,
  MessageDelta,
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
  PhaseOutput,
  PhaseRegistry,
  PhaseState,
} from "./harness/phases/types";
export type { PhaseExecution } from "./loop/execution";
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
