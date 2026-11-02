import type { OAuthCredential } from "../auth";
import { OAuthLoginError } from "./errors";
import {
  formRequest,
  isRecord,
  pollDeviceToken,
  positiveSeconds,
  readObject,
  requestSignal,
  throwIfAborted,
  type DeviceLoginOptions,
  type DeviceLoginStart,
  type FetchLike,
  type FlowRequestAuth,
} from "./shared";

export const XAI_OAUTH_RESOURCE_URL = "https://cli-chat-proxy.grok.com/v1";

const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_OAUTH_DISCOVERY_URL = "https://auth.x.ai/.well-known/openid-configuration";
const XAI_OAUTH_SCOPES = "openid profile email offline_access grok-cli:access api:access";
const XAI_CLI_TOKEN_AUTH = "xai-grok-cli";
const XAI_CLI_CLIENT_VERSION = "0.2.95";
const XAI_CLI_CLIENT_IDENTIFIER = "rowan";

type TokenPayload = Record<string, unknown>;

function trustedAuthEndpoint(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OAuthLoginError("invalid_response", `xAI OAuth discovery is missing ${label}.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OAuthLoginError("invalid_response", `xAI OAuth discovery returned an invalid ${label}.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "auth.x.ai"
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new OAuthLoginError("invalid_response", `xAI OAuth discovery returned an untrusted ${label}.`);
  }
  return parsed.toString();
}

function trustedVerificationUri(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OAuthLoginError("invalid_response", "xAI OAuth device response is missing verification_uri.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OAuthLoginError("invalid_response", "xAI OAuth device response returned an invalid verification_uri.");
  }
  if (
    parsed.protocol !== "https:"
    || (parsed.hostname !== "x.ai" && !parsed.hostname.endsWith(".x.ai"))
    || parsed.port
    || parsed.username
    || parsed.password
  ) {
    throw new OAuthLoginError("invalid_response", "xAI OAuth device response returned an unsafe verification_uri.");
  }
  return parsed.toString();
}

function jwtExpiry(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload: unknown = JSON.parse(atob(padded));
    if (!isRecord(payload) || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function tokenExpiry(payload: TokenPayload, accessToken: string, now: () => number): number {
  const expiresIn = positiveSeconds(payload.expires_in);
  if (expiresIn !== null) return now() + expiresIn * 1000;
  const expires = jwtExpiry(accessToken);
  if (expires !== null && expires > now()) return expires;
  throw new OAuthLoginError("invalid_response", "xAI OAuth token response is missing a valid expiration.");
}

function buildCredential(
  payload: TokenPayload,
  input: {
    now: () => number;
    tokenEndpoint: string;
    previousRefresh?: string;
    requireRefresh: boolean;
  },
): OAuthCredential {
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new OAuthLoginError("invalid_response", "xAI OAuth token response is missing access_token.");
  }
  const refresh = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token
    : input.previousRefresh;
  if ((input.requireRefresh && !refresh) || !refresh) {
    throw new OAuthLoginError("invalid_response", "xAI OAuth token response has no usable refresh token.");
  }
  return {
    flow: "xai",
    access: payload.access_token,
    refresh,
    expires: tokenExpiry(payload, payload.access_token, input.now),
    tokenEndpoint: input.tokenEndpoint,
    ...(typeof payload.id_token === "string" && payload.id_token ? { idToken: payload.id_token } : {}),
  };
}

async function discover(fetchImpl: FetchLike, signal: AbortSignal) {
  throwIfAborted(signal);
  const response = await fetchImpl(XAI_OAUTH_DISCOVERY_URL, {
    headers: { accept: "application/json" },
    signal: requestSignal(signal),
  });
  if (!response.ok) {
    throw new OAuthLoginError("discovery_failed", `xAI OAuth discovery failed with HTTP ${response.status}.`);
  }
  const payload = await readObject(response, "xAI OAuth endpoint");
  return {
    deviceEndpoint: trustedAuthEndpoint(payload.device_authorization_endpoint, "device_authorization_endpoint"),
    tokenEndpoint: trustedAuthEndpoint(payload.token_endpoint, "token_endpoint"),
  };
}

async function postToken(
  fetchImpl: FetchLike,
  tokenEndpoint: string,
  values: Record<string, string>,
  signal: AbortSignal,
) {
  throwIfAborted(signal);
  const response = await fetchImpl(tokenEndpoint, formRequest(values, requestSignal(signal)));
  return { response, payload: await readObject(response, "xAI OAuth endpoint") };
}

async function pollXaiLogin(
  options: DeviceLoginOptions,
  input: {
    deviceCode: string;
    tokenEndpoint: string;
    deadline: number;
    intervalSeconds: number;
  },
): Promise<OAuthCredential> {
  return pollDeviceToken<OAuthCredential>({
    intervalMs: input.intervalSeconds * 1000,
    deadline: input.deadline,
    now: options.now,
    sleep: options.sleep,
    signal: options.signal,
    beforeFirstPoll: "sleep",
    deniedError: () => new OAuthLoginError("access_denied", "xAI OAuth authorization was denied."),
    expiredError: () => new OAuthLoginError("expired_token", "xAI OAuth device code expired."),
    slowDownIntervalMs: (intervalMs) => {
      const slowed = positiveSeconds(intervalMs / 1000 + 5);
      if (slowed === null) {
        throw new OAuthLoginError("invalid_response", "xAI OAuth polling interval exceeds the safe timer range.");
      }
      return slowed * 1000;
    },
    poll: async () => {
      const { response, payload } = await postToken(
        options.fetchImpl,
        input.tokenEndpoint,
        {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: input.deviceCode,
          client_id: XAI_OAUTH_CLIENT_ID,
        },
        options.signal,
      );
      if (response.ok && payload.error === undefined) {
        return {
          status: "complete",
          value: buildCredential(payload, {
            now: options.now,
            tokenEndpoint: input.tokenEndpoint,
            requireRefresh: true,
          }),
        };
      }

      const code = typeof payload.error === "string" ? payload.error : "";
      if (code === "authorization_pending") return { status: "pending" };
      if (code === "slow_down") return { status: "slow_down" };
      if (code === "access_denied" || code === "authorization_denied") {
        return { status: "access_denied" };
      }
      if (code === "expired_token") return { status: "expired_token" };
      return {
        status: "failed",
        error: new OAuthLoginError(
          "token_exchange_failed",
          `xAI OAuth token exchange failed with HTTP ${response.status}.`,
        ),
      };
    },
  });
}

export async function startXaiLogin(options: DeviceLoginOptions): Promise<DeviceLoginStart> {
  const { deviceEndpoint, tokenEndpoint } = await discover(options.fetchImpl, options.signal);
  const response = await options.fetchImpl(
    deviceEndpoint,
    formRequest({
      client_id: XAI_OAUTH_CLIENT_ID,
      scope: XAI_OAUTH_SCOPES,
    }, requestSignal(options.signal)),
  );
  const payload = await readObject(response, "xAI OAuth endpoint");
  if (!response.ok) {
    throw new OAuthLoginError(
      "device_authorization_failed",
      `xAI OAuth device authorization failed with HTTP ${response.status}.`,
    );
  }

  const deviceCode = typeof payload.device_code === "string" ? payload.device_code : "";
  const userCode = typeof payload.user_code === "string" ? payload.user_code : "";
  const rawVerificationUri = typeof payload.verification_uri === "string"
    ? payload.verification_uri
    : payload.verification_url;
  const expiresIn = positiveSeconds(payload.expires_in);
  const interval = payload.interval === undefined ? 5 : positiveSeconds(payload.interval);
  if (!deviceCode || !userCode || expiresIn === null || interval === null) {
    throw new OAuthLoginError("invalid_response", "xAI OAuth device authorization response is incomplete.");
  }

  const verificationUri = trustedVerificationUri(rawVerificationUri);
  const expiresAt = options.now() + expiresIn * 1000;
  return {
    userCode,
    verificationUri,
    expiresAt,
    credential: pollXaiLogin(options, {
      deviceCode,
      tokenEndpoint,
      deadline: expiresAt,
      intervalSeconds: interval,
    }),
  };
}

export async function refreshXaiCredential(
  credential: OAuthCredential,
  options: { fetchImpl: FetchLike; now: () => number; signal: AbortSignal },
): Promise<OAuthCredential> {
  if (!credential.refresh) {
    throw new OAuthLoginError("refresh_failed", "xAI OAuth credential is missing its refresh token.");
  }
  if (!credential.tokenEndpoint) {
    throw new OAuthLoginError("refresh_failed", "xAI OAuth credential is missing its token endpoint.");
  }
  const tokenEndpoint = trustedAuthEndpoint(credential.tokenEndpoint, "token_endpoint");
  const { response, payload } = await postToken(
    options.fetchImpl,
    tokenEndpoint,
    {
      grant_type: "refresh_token",
      refresh_token: credential.refresh,
      client_id: XAI_OAUTH_CLIENT_ID,
    },
    options.signal,
  );
  if (!response.ok || payload.error !== undefined) {
    throw new OAuthLoginError(
      "refresh_failed",
      `xAI OAuth token refresh failed with HTTP ${response.status}.`,
    );
  }
  return buildCredential(payload, {
    now: options.now,
    tokenEndpoint,
    previousRefresh: credential.refresh,
    requireRefresh: false,
  });
}

export function xaiRequestAuth(credential: OAuthCredential, modelId: string): FlowRequestAuth {
  const normalizedModel = modelId.trim().toLowerCase().split("/").pop() ?? "";
  return {
    baseUrl: XAI_OAUTH_RESOURCE_URL,
    headers: {
      authorization: `Bearer ${credential.access}`,
      "x-xai-token-auth": XAI_CLI_TOKEN_AUTH,
      "x-grok-client-version": XAI_CLI_CLIENT_VERSION,
      "x-grok-client-identifier": XAI_CLI_CLIENT_IDENTIFIER,
      ...(normalizedModel ? { "x-grok-model-override": normalizedModel } : {}),
    },
  };
}
