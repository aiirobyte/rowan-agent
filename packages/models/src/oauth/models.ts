import type { OAuthCredential, OAuthCredentialStore } from "../auth";
import { executeProviderRequest } from "../providers/http";
import {
  ProviderError,
  asNumber,
  asTrimmedString,
  isRecord,
  type ProviderFetch,
} from "../providers/shared";
import { copilotRequestAuth } from "./github-copilot";
import { resolveOAuthCredential } from "./credential";
import { codexRequestAuth } from "./openai-codex";
import { decodeJwtPayload } from "./shared";
import { xaiRequestAuth } from "./xai";

/** Codex CLI release whose model picker and visibility semantics this listing mirrors. */
const CODEX_CLI_VERSION = "0.166.0";
const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models";
const XAI_MODELS_URL = "https://cli-chat-proxy.grok.com/v1/models";

export type OAuthModel = Readonly<{
  id: string;
  name?: string;
  contextWindow?: number;
}>;

export type ListOAuthModelsOptions = {
  fetch?: ProviderFetch;
  signal?: AbortSignal;
};

function invalidResponse(providerId: string): ProviderError {
  return new ProviderError({
    code: "invalid_response",
    message: `The OAuth model catalog for provider "${providerId}" returned an invalid payload.`,
    details: { providerId },
  });
}

function modelId(value: Record<string, unknown>): string | undefined {
  return asTrimmedString(value.id)
    ?? asTrimmedString(value.slug)
    ?? asTrimmedString(value.model)
    ?? asTrimmedString(value.modelId);
}

function modelName(value: Record<string, unknown>): string | undefined {
  return asTrimmedString(value.name)
    ?? asTrimmedString(value.display_name)
    ?? asTrimmedString(value.displayName);
}

function modelContextWindow(value: Record<string, unknown>): number | undefined {
  return asNumber(value.contextWindow)
    ?? asNumber(value.context_window)
    ?? asNumber(value.contextLength);
}

function listedModel(value: unknown): OAuthModel | undefined {
  if (!isRecord(value)) return undefined;
  const id = modelId(value);
  if (!id) return undefined;
  const name = modelName(value);
  const contextWindow = modelContextWindow(value);
  return {
    id,
    ...(name ? { name } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
  };
}

async function readCatalog(
  providerId: string,
  url: string,
  headers: Record<string, string>,
  options: ListOAuthModelsOptions | undefined,
): Promise<Record<string, unknown>> {
  const payload = await executeProviderRequest({
    config: {
      model: `${providerId}:models`,
      maxRetries: 0,
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    },
    endpoint: url,
    signal: options?.signal,
    requestName: `${providerId} model catalog`,
    request: () => ({
      method: "GET",
      headers: {
        ...headers,
        accept: "application/json",
      },
    }),
  }, (response) => response.json<unknown>());
  if (!isRecord(payload)) throw invalidResponse(providerId);
  return payload;
}

async function listCodexModels(
  providerId: string,
  credential: OAuthCredential,
  options?: ListOAuthModelsOptions,
): Promise<OAuthModel[]> {
  const requestAuth = codexRequestAuth(credential);
  const url = new URL(CODEX_MODELS_URL);
  url.searchParams.set("client_version", CODEX_CLI_VERSION);
  const payload = await readCatalog(
    providerId,
    url.toString(),
    requestAuth.headers,
    options,
  );
  if (!Array.isArray(payload.models)) throw invalidResponse(providerId);
  return payload.models.flatMap((value) => {
    if (!isRecord(value) || value.visibility !== "list") return [];
    const model = listedModel(value);
    return model ? [model] : [];
  });
}

async function listXaiModels(
  providerId: string,
  credential: OAuthCredential,
  options?: ListOAuthModelsOptions,
): Promise<OAuthModel[]> {
  const requestAuth = xaiRequestAuth(credential, "");
  const claims = credential.idToken ? decodeJwtPayload(credential.idToken) : undefined;
  const userId = asTrimmedString(claims?.sub) ?? asTrimmedString(claims?.user_id);
  const email = asTrimmedString(claims?.email);
  const payload = await readCatalog(
    providerId,
    XAI_MODELS_URL,
    {
      ...requestAuth.headers,
      "x-grok-client-mode": "interactive",
      ...(userId ? { "x-userid": userId } : {}),
      ...(email ? { "x-email": email } : {}),
    },
    options,
  );
  if (!Array.isArray(payload.data)) throw invalidResponse(providerId);
  return payload.data.flatMap((value) => {
    const model = listedModel(value);
    return model ? [model] : [];
  });
}

function copilotContextWindow(value: Record<string, unknown>): number | undefined {
  const capabilities = isRecord(value.capabilities) ? value.capabilities : undefined;
  const limits = capabilities && isRecord(capabilities.limits) ? capabilities.limits : undefined;
  return asNumber(limits?.max_context_window_tokens) ?? asNumber(limits?.max_prompt_tokens);
}

async function listCopilotModels(
  providerId: string,
  credential: OAuthCredential,
  options?: ListOAuthModelsOptions,
): Promise<OAuthModel[]> {
  const requestAuth = copilotRequestAuth(credential);
  if (!requestAuth.baseUrl) throw invalidResponse(providerId);
  const payload = await readCatalog(
    providerId,
    `${requestAuth.baseUrl}/models`,
    requestAuth.headers,
    options,
  );
  if (!Array.isArray(payload.data)) throw invalidResponse(providerId);
  return payload.data.flatMap((value) => {
    if (!isRecord(value) || value.model_picker_enabled !== true) return [];
    const policy = isRecord(value.policy) ? value.policy : undefined;
    if (policy?.state === "disabled") return [];
    const capabilities = isRecord(value.capabilities) ? value.capabilities : undefined;
    if (capabilities?.type !== "chat") return [];
    const id = asTrimmedString(value.id);
    if (!id) return [];
    const name = asTrimmedString(value.name);
    const contextWindow = copilotContextWindow(value);
    return [{
      id,
      ...(name ? { name } : {}),
      ...(contextWindow !== undefined ? { contextWindow } : {}),
    }];
  });
}

/**
 * List the models available to the signed-in account. The stored credential's
 * flow selects the endpoint, headers, and picker filter.
 */
export async function listOAuthModels(
  providerId: string,
  store: OAuthCredentialStore,
  options: ListOAuthModelsOptions = {},
): Promise<OAuthModel[]> {
  const credential = await resolveOAuthCredential({
    providerId,
    store,
    fetchImpl: options.fetch ?? fetch,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (credential.flow === "openai-codex") return listCodexModels(providerId, credential, options);
  if (credential.flow === "xai") return listXaiModels(providerId, credential, options);
  return listCopilotModels(providerId, credential, options);
}
