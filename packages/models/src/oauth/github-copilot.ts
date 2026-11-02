import type { OAuthCredential } from "../auth";
import { OAuthLoginError } from "./errors";
import {
  formRequest,
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

const GITHUB_COPILOT_CLIENT_ID = atob("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const DEFAULT_COPILOT_BASE_URL = "https://api.individual.githubcopilot.com";
const MINIMUM_POLL_INTERVAL_MS = 1_000;

const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
} as const;

function githubVerificationUri(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OAuthLoginError("invalid_response", "GitHub device response is missing verification_uri.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OAuthLoginError("invalid_response", "GitHub device response returned an invalid verification_uri.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "github.com"
    || parsed.port
    || parsed.username
    || parsed.password
  ) {
    throw new OAuthLoginError("invalid_response", "GitHub device response returned an unsafe verification_uri.");
  }
  return parsed.toString();
}

function copilotBaseUrl(token: string): string {
  const proxyEndpoint = token.match(/proxy-ep=([^;]+)/)?.[1]?.trim();
  if (!proxyEndpoint) return DEFAULT_COPILOT_BASE_URL;
  const host = proxyEndpoint.replace(/^proxy\./, "api.");
  try {
    const url = new URL(`https://${host}`);
    if (
      url.protocol !== "https:"
      || !url.hostname.endsWith(".githubcopilot.com")
      || url.port
      || url.username
      || url.password
    ) {
      return DEFAULT_COPILOT_BASE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_COPILOT_BASE_URL;
  }
}

async function exchangeCopilotToken(
  fetchImpl: FetchLike,
  githubToken: string,
  options: {
    signal: AbortSignal;
    now: () => number;
    operation: "login" | "refresh";
  },
): Promise<OAuthCredential> {
  const response = await fetchImpl(COPILOT_TOKEN_URL, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${githubToken}`,
      ...COPILOT_HEADERS,
    },
    signal: requestSignal(options.signal),
  });
  if (options.operation === "refresh" && (response.status === 401 || response.status === 403)) {
    throw new OAuthLoginError(
      "sign_in_required",
      "GitHub Copilot authorization is no longer valid. Sign in again.",
    );
  }
  if (!response.ok) {
    throw new OAuthLoginError(
      options.operation === "refresh" ? "refresh_failed" : "token_exchange_failed",
      `GitHub Copilot token exchange failed with HTTP ${response.status}.`,
    );
  }
  const payload = await readObject(response, "GitHub OAuth endpoint");
  const access = typeof payload.token === "string" ? payload.token : "";
  const expiresAt = typeof payload.expires_at === "number" && Number.isFinite(payload.expires_at)
    ? payload.expires_at
    : null;
  if (!access || expiresAt === null || expiresAt <= 0) {
    throw new OAuthLoginError(
      "invalid_response",
      "GitHub Copilot token response is missing token or expires_at.",
    );
  }
  return {
    flow: "github-copilot",
    access,
    refresh: githubToken,
    expires: expiresAt * 1000,
  };
}

async function pollForGitHubToken(
  options: DeviceLoginOptions,
  input: {
    deviceCode: string;
    deadline: number;
    intervalSeconds: number;
  },
): Promise<string> {
  return pollDeviceToken<string>({
    intervalMs: Math.max(MINIMUM_POLL_INTERVAL_MS, Math.floor(input.intervalSeconds * 1000)),
    deadline: input.deadline,
    now: options.now,
    sleep: options.sleep,
    signal: options.signal,
    capDelayToDeadline: true,
    deniedError: () => new OAuthLoginError("access_denied", "GitHub authorization was denied."),
    expiredError: () => new OAuthLoginError("expired_token", "GitHub device code expired."),
    poll: async () => {
      const response = await options.fetchImpl(
        GITHUB_ACCESS_TOKEN_URL,
        formRequest({
          client_id: GITHUB_COPILOT_CLIENT_ID,
          device_code: input.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }, requestSignal(options.signal), {
          accept: "application/json",
          "user-agent": COPILOT_HEADERS["User-Agent"],
        }),
      );
      const payload = await readObject(response, "GitHub OAuth endpoint");
      if (response.ok && typeof payload.access_token === "string" && payload.access_token) {
        return { status: "complete", value: payload.access_token };
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
          `GitHub device token exchange failed with HTTP ${response.status}.`,
        ),
      };
    },
  });
}

export async function startCopilotLogin(options: DeviceLoginOptions): Promise<DeviceLoginStart> {
  throwIfAborted(options.signal);
  const response = await options.fetchImpl(
    GITHUB_DEVICE_CODE_URL,
    formRequest({
      client_id: GITHUB_COPILOT_CLIENT_ID,
      scope: "read:user",
    }, requestSignal(options.signal), {
      accept: "application/json",
      "user-agent": COPILOT_HEADERS["User-Agent"],
    }),
  );
  const payload = await readObject(response, "GitHub OAuth endpoint");
  if (!response.ok) {
    throw new OAuthLoginError(
      "device_authorization_failed",
      `GitHub device authorization failed with HTTP ${response.status}.`,
    );
  }

  const deviceCode = typeof payload.device_code === "string" ? payload.device_code : "";
  const userCode = typeof payload.user_code === "string" ? payload.user_code : "";
  const expiresIn = positiveSeconds(payload.expires_in);
  const interval = payload.interval === undefined ? 5 : positiveSeconds(payload.interval);
  if (!deviceCode || !userCode || expiresIn === null || interval === null) {
    throw new OAuthLoginError("invalid_response", "GitHub device authorization response is incomplete.");
  }

  const verificationUri = githubVerificationUri(payload.verification_uri);
  const expiresAt = options.now() + expiresIn * 1000;
  const credential = (async () => {
    const githubToken = await pollForGitHubToken(options, {
      deviceCode,
      deadline: expiresAt,
      intervalSeconds: interval,
    });
    return exchangeCopilotToken(options.fetchImpl, githubToken, {
      signal: options.signal,
      now: options.now,
      operation: "login",
    });
  })();

  return { userCode, verificationUri, expiresAt, credential };
}

export async function refreshCopilotCredential(
  credential: OAuthCredential,
  options: { fetchImpl: FetchLike; now: () => number; signal: AbortSignal },
): Promise<OAuthCredential> {
  if (!credential.refresh) {
    throw new OAuthLoginError("sign_in_required", "GitHub Copilot credentials are missing a GitHub token.");
  }
  return exchangeCopilotToken(options.fetchImpl, credential.refresh, {
    signal: options.signal,
    now: options.now,
    operation: "refresh",
  });
}

export function copilotRequestAuth(credential: OAuthCredential): FlowRequestAuth {
  return {
    baseUrl: copilotBaseUrl(credential.access),
    headers: {
      authorization: `Bearer ${credential.access}`,
      ...COPILOT_HEADERS,
    },
  };
}
