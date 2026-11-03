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

function storeError(providerId: string, flow?: OAuthFlow): ProviderError {
  return new ProviderError({
    code: "oauth_credential_store_failed",
    message: `OAuth credentials could not be read or saved for provider "${providerId}".`,
    details: { providerId, ...(flow ? { flow } : {}) },
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
  store: OAuthCredentialStore,
  fetchImpl: ProviderFetch,
  now: () => number,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  let credential: OAuthCredential | undefined;
  try {
    credential = await store.load(providerId);
  } catch {
    throw storeError(providerId);
  }
  if (!credential || !credential.access) {
    throw new OAuthSignInRequiredError(providerId);
  }
  const flow = credential.flow;
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

  const operation = loadOrRefreshCredential(providerId, store, fetchImpl, now, signal);
  operations.set(providerId, operation);
  const clear = () => {
    if (operations?.get(providerId) === operation) operations.delete(providerId);
  };
  operation.then(clear, clear);
  return operation;
}

export type ResolveOAuthCredentialInput = {
  providerId: string;
  store?: OAuthCredentialStore;
  fetchImpl: ProviderFetch;
  now?: () => number;
  signal?: AbortSignal;
};

/** Load the provider credential, refresh it through the request path, and save rotations. */
export async function resolveOAuthCredential(
  input: ResolveOAuthCredentialInput,
): Promise<OAuthCredential> {
  if (!input.store) throw new OAuthSignInRequiredError(input.providerId);
  return currentCredential(
    input.providerId,
    input.store,
    input.fetchImpl,
    input.now ?? Date.now,
    input.signal,
  );
}

export async function resolveOAuthRequestAuth(input: {
  providerId: string;
  model: string;
  sessionId?: string;
  store?: OAuthCredentialStore;
  fetchImpl: ProviderFetch;
  now?: () => number;
  signal?: AbortSignal;
}): Promise<OAuthRequestAuth> {
  const credential = await resolveOAuthCredential(input);
  if (credential.flow === "xai") return xaiRequestAuth(credential, input.model);
  if (credential.flow === "github-copilot") return copilotRequestAuth(credential);
  if (!credential.accountId) {
    throw new OAuthSignInRequiredError(input.providerId, credential.flow);
  }
  return codexRequestAuth(credential, input.sessionId);
}
