import type { OAuthCredential, OAuthCredentialStore, OAuthFlow } from "../auth";
import {
  OAuthSignInRequiredError,
  ProviderError,
  type ProviderFetch,
} from "../providers/shared";
import { OAuthLoginError } from "./errors";
import { copilotRequestAuth } from "./github-copilot";
import { codexRequestAuth } from "./openai-codex";
import { refreshOAuthCredential } from "./session";
import type { FlowRequestAuth } from "./shared";
import { xaiRequestAuth } from "./xai";

const EXPIRY_SKEW_MS = 60_000;

const credentialOperations = new WeakMap<
  OAuthCredentialStore,
  Map<string, Promise<OAuthCredential>>
>();

export type OAuthRequestAuth = FlowRequestAuth;

function isExpiring(credential: OAuthCredential, now: number): boolean {
  return !Number.isFinite(credential.expires) || credential.expires <= now + EXPIRY_SKEW_MS;
}

function storeError(providerId: string, flow: OAuthFlow): ProviderError {
  return new ProviderError({
    code: "oauth_credential_store_failed",
    message: `OAuth credentials could not be read or saved for provider "${providerId}".`,
    details: { providerId, flow },
  });
}

async function saveCredential(
  store: OAuthCredentialStore,
  providerId: string,
  flow: OAuthFlow,
  credential: OAuthCredential,
): Promise<void> {
  try {
    await store.save(providerId, credential);
  } catch {
    throw storeError(providerId, flow);
  }
}

async function loadOrRefreshCredential(
  providerId: string,
  flow: OAuthFlow,
  store: OAuthCredentialStore,
  fetchImpl: ProviderFetch,
  now: () => number,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  let credential: OAuthCredential | undefined;
  try {
    credential = await store.load(providerId);
  } catch {
    throw storeError(providerId, flow);
  }
  if (!credential || credential.flow !== flow || !credential.access) {
    throw new OAuthSignInRequiredError(providerId, flow);
  }
  if (!isExpiring(credential, now())) return credential;
  if (!credential.refresh) {
    throw new OAuthSignInRequiredError(providerId, flow);
  }

  let refreshed: OAuthCredential;
  try {
    refreshed = await refreshOAuthCredential(flow, credential, {
      fetch: fetchImpl,
      now,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new ProviderError({
        code: "request_aborted",
        message: "Request aborted.",
        details: { providerId, flow },
      });
    }
    if (error instanceof OAuthLoginError && error.code === "sign_in_required") {
      throw new OAuthSignInRequiredError(providerId, flow);
    }
    throw new ProviderError({
      code: "oauth_refresh_failed",
      message: `OAuth token refresh failed for provider "${providerId}".`,
      details: { providerId, flow },
    });
  }
  await saveCredential(store, providerId, flow, refreshed);
  return refreshed;
}

async function currentCredential(
  providerId: string,
  flow: OAuthFlow,
  store: OAuthCredentialStore,
  fetchImpl: ProviderFetch,
  now: () => number,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  let operations = credentialOperations.get(store);
  if (!operations) {
    operations = new Map();
    credentialOperations.set(store, operations);
  }
  const pending = operations.get(providerId);
  if (pending) return pending;

  const operation = loadOrRefreshCredential(providerId, flow, store, fetchImpl, now, signal);
  operations.set(providerId, operation);
  const clear = () => {
    if (operations?.get(providerId) === operation) operations.delete(providerId);
  };
  operation.then(clear, clear);
  return operation;
}

export async function resolveOAuthRequestAuth(input: {
  flow: OAuthFlow;
  providerId: string;
  model: string;
  sessionId?: string;
  store?: OAuthCredentialStore;
  fetchImpl: ProviderFetch;
  now?: () => number;
  signal?: AbortSignal;
}): Promise<OAuthRequestAuth> {
  if (!input.store) throw new OAuthSignInRequiredError(input.providerId, input.flow);
  const credential = await currentCredential(
    input.providerId,
    input.flow,
    input.store,
    input.fetchImpl,
    input.now ?? Date.now,
    input.signal,
  );
  if (input.flow === "xai") return xaiRequestAuth(credential, input.model);
  if (input.flow === "github-copilot") return copilotRequestAuth(credential);
  if (!credential.accountId) {
    throw new OAuthSignInRequiredError(input.providerId, input.flow);
  }
  return codexRequestAuth(credential, input.sessionId);
}
