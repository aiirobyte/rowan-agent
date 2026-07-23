import { createCoreTools as createLegacyCoreTools, type CoreToolContext } from "./harness/tools";
import type { JsonValue, Tool as RuntimeTool, ToolInvocationContext } from "./runtime/contracts";

export { AgentRuntime } from "./runtime/durable-runtime";
export { InMemoryStore } from "./runtime/durable-store";
export { SqliteStore } from "./runtime/sqlite-durable-store";
export { InMemoryConfigProvider, brandConfigToken } from "./runtime/config-provider";
export { RuntimeError, isRuntimeError } from "./runtime/errors";
export { loadSkills } from "./harness/skills";
export { loadPhases } from "./harness/phases/loader";
export { loadExtensionsFromPath as loadExtensions } from "./extensions/loader";

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
  AgentDefinitionContext,
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
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Message,
  MessageBase,
  MessageCommitted,
  MessageContent,
  MessageId,
  Metadata,
  OpaqueId,
  Outcome,
  OwnerLease,
  OwnerToken,
  Page,
  RunBoundary,
  RunClaim,
  RunFailure,
  RunId,
  RunListCursor,
  RunRecord,
  RunSnapshot,
  RunState,
  RunSummary,
  RunTransitioned,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCallId,
  ToolCallSnapshot,
  ToolCallState,
  ToolExecutionResult,
  ToolInvocationContext,
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
  AnyRuntimeError,
  RuntimeErrorCode,
  RuntimeErrorDetails,
} from "./runtime/errors";

export type { ModelConfig, ModelRef, StreamFn } from "@rowan-agent/models";
export type {
  Skill,
} from "./protocol";

export type {
  ExtensionAPI,
  ExtensionFactory,
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
  PhaseInvocation,
  PhaseOutput,
  PhaseRegistry,
  PhaseState,
} from "./harness/phases/types";
export type { CoreToolContext } from "./harness/tools";
