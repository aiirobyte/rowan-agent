// Public model, provider, and stream contract. Provider implementations and
// transport helpers remain private to this package.
export {
  calculateCost,
  getAllModels,
  getModel,
  getModels,
  getProviders,
  registerModel,
  resolveModel,
  unregisterProviderModels,
} from "./models";
export { MODELS } from "./models.generated";
export {
  getApiProvider,
  listApiProviders,
  parseModelRef,
  registerApiProvider,
  registerBuiltInApiProviders,
  unregisterApiProvider,
  stream,
  streamByRef,
  createModelStream,
} from "./registry";
export { OAuthSignInRequiredError, ProviderError } from "./providers/shared";
export { parseAuthMode } from "./auth";
export { OAuthLoginError } from "./oauth/errors";
export { refreshOAuthCredential, startOAuthLogin } from "./oauth/session";
export { listOAuthModels } from "./oauth/models";
// Used by the agent runtime to validate provider tool progress.
export { isValidToolProgress } from "./protocol";

export type {
  ApiProvider,
  ModelStreamOptions,
} from "./registry";

export type {
  AssistantMessagePartial,
  AudioBlock,
  ContentBlock,
  ImageBlock,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  KnownProtocol,
  KnownProvider,
  LlmContentBlock,
  LlmMessage,
  LlmModelUsage,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmStreamEvent,
  LlmTokenUsage,
  LlmToolCall,
  LlmToolChoice,
  LlmToolDefinition,
  LlmToolResultBlock,
  LlmToolUseBlock,
  Model,
  ModelConfig,
  ModelCost,
  ModelCostRates,
  ModelCostTier,
  ModelRef,
  Protocol,
  Provider,
  ProviderCallContext,
  ProviderConfig,
  ProviderModelConfig,
  ProviderStreamFn,
  ResourceBlock,
  ResourceLinkBlock,
  RunInteractionKind,
  RunInteractionRequest,
  ScopeRef,
  StreamBlock,
  StreamFn,
  TextBlock,
  ThinkingBlock,
  ThinkingLevel,
  ToolAnnotations,
  ToolCall,
  ToolCallBlock,
  ToolCallContent,
  ToolCallLocation,
  ToolCallOptions,
  ToolCallStatus,
  ToolCallUpdate,
  ToolKind,
  ToolProgress,
  ToolResult,
} from "./protocol";
export type {
  AuthMode,
  OAuthCredential,
  OAuthCredentialStore,
  OAuthFlow,
} from "./auth";
export type { OAuthLoginErrorCode } from "./oauth/errors";
export type {
  OAuthLoginOptions,
  OAuthLoginSession,
  OAuthRefreshOptions,
} from "./oauth/session";
export type {
  ListOAuthModelsOptions,
  OAuthModel,
} from "./oauth/models";
