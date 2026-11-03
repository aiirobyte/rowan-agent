import type { AuthMode, OAuthCredentialStore } from "../auth";
import { resolveOAuthRequestAuth, type OAuthRequestAuth } from "../oauth/credential";
import type { ProviderFetch } from "./shared";
import { ProviderError, requireValue } from "./shared";

type AuthConfig = {
  auth?: AuthMode;
  apiKey?: string;
  fetch?: ProviderFetch;
};

function apiKey(config: AuthConfig): string {
  return requireValue(
    "API key",
    config.apiKey,
    "model.apiKey is required (set apiKey in config.yaml or pass --api-key)",
  );
}

async function requestAuth(
  config: AuthConfig,
  headers: {
    required: () => Record<string, string>;
    none: Record<string, string>;
  },
  providerId: string,
  model: string,
  store?: OAuthCredentialStore,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<OAuthRequestAuth> {
  const auth = config.auth;
  if (auth === undefined) return { headers: headers.required() };
  if (auth === "none") return { headers: headers.none };
  return resolveOAuthRequestAuth({
    providerId,
    model,
    ...(store ? { store } : {}),
    fetchImpl: config.fetch ?? fetch,
    ...(signal ? { signal } : {}),
    ...(sessionId ? { sessionId } : {}),
  });
}

export async function bearerRequestAuth(
  config: AuthConfig,
  providerId: string,
  model: string,
  store?: OAuthCredentialStore,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<OAuthRequestAuth> {
  return requestAuth(config, {
    required: () => ({ authorization: `Bearer ${apiKey(config)}` }),
    none: {},
  }, providerId, model, store, signal, sessionId);
}

export function googleRequestAuth(
  config: AuthConfig,
  providerId: string,
): OAuthRequestAuth {
  const auth = config.auth;
  if (auth === undefined) {
    return { headers: { "x-goog-api-key": apiKey(config) } };
  }
  if (auth === "none") return { headers: {} };
  throw new ProviderError({
    code: "invalid_config",
    message: `The gemini-compatible protocol does not support OAuth credentials for provider "${providerId}".`,
    details: { field: "auth", providerId },
  });
}

export async function anthropicRequestAuth(
  config: AuthConfig,
  providerId: string,
  model: string,
  store?: OAuthCredentialStore,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<OAuthRequestAuth> {
  return requestAuth(config, {
    required: () => ({
      "x-api-key": apiKey(config),
      "anthropic-version": "2023-06-01",
    }),
    none: { "anthropic-version": "2023-06-01" },
  }, providerId, model, store, signal, sessionId);
}
