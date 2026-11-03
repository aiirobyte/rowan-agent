import type { OAuthCredential } from "../auth";
import { OAuthLoginError } from "./errors";
import {
  abortError,
  decodeJwtPayload,
  formRequest,
  isRecord,
  positiveSeconds,
  readObject,
  requestSignal,
  throwIfAborted,
  type FetchLike,
  type FlowRequestAuth,
  type LoginOptions,
} from "./shared";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback";
const CODEX_SCOPE = "openid profile email offline_access";
const CODEX_CALLBACK_HOST = "127.0.0.1";
const CODEX_CALLBACK_PORT = 1455;
const CODEX_LOGIN_LIFETIME_MS = 10 * 60 * 1000;
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export type CodexLoginStart = {
  url: string;
  expiresAt: number;
  credential: Promise<OAuthCredential>;
};

function accountIdFromAccessToken(accessToken: string): string {
  const claims = decodeJwtPayload(accessToken)?.[JWT_CLAIM_PATH];
  if (!isRecord(claims)) {
    throw new OAuthLoginError("invalid_response", "OpenAI Codex access token has no account claim.");
  }
  const accountId = claims.chatgpt_account_id;
  if (typeof accountId !== "string" || !accountId) {
    throw new OAuthLoginError("invalid_response", "OpenAI Codex access token has no account id.");
  }
  return accountId;
}

function credentialFromToken(
  payload: Record<string, unknown>,
  now: () => number,
  operation: "exchange" | "refresh",
): OAuthCredential {
  const access = typeof payload.access_token === "string" ? payload.access_token : "";
  const refresh = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const expiresIn = positiveSeconds(payload.expires_in, Number.POSITIVE_INFINITY);
  if (!access || !refresh || expiresIn === null) {
    throw new OAuthLoginError(
      "invalid_response",
      `OpenAI Codex token ${operation} response is missing access_token, refresh_token, or expires_in.`,
    );
  }
  return {
    flow: "openai-codex",
    access,
    refresh,
    expires: now() + expiresIn * 1000,
    accountId: accountIdFromAccessToken(access),
    ...(typeof payload.id_token === "string" && payload.id_token ? { idToken: payload.id_token } : {}),
  };
}

async function readTokenResponse(
  response: Response,
  operation: "exchange" | "refresh",
  now: () => number,
): Promise<OAuthCredential> {
  if (!response.ok) {
    throw new OAuthLoginError(
      operation === "refresh" ? "refresh_failed" : "token_exchange_failed",
      `OpenAI Codex token ${operation} failed with HTTP ${response.status}.`,
    );
  }
  return credentialFromToken(
    await readObject(response, `OpenAI Codex token ${operation}`),
    now,
    operation,
  );
}

async function authorizationFlow(
  now: () => number,
): Promise<{ url: string; verifier: string; state: string; expiresAt: number }> {
  const { randomBytes, createHash } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  const url = new URL(CODEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CODEX_CLIENT_ID);
  url.searchParams.set("redirect_uri", CODEX_REDIRECT_URI);
  url.searchParams.set("scope", CODEX_SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "rowan");
  return {
    url: url.toString(),
    verifier,
    state,
    expiresAt: now() + CODEX_LOGIN_LIFETIME_MS,
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function startLoopback(
  state: string,
  options: LoginOptions,
): Promise<{ code: Promise<string>; close(): void }> {
  const { createServer } = await import("node:http");
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/auth/callback") {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Callback route not found.");
      return;
    }
    if (url.searchParams.get("state") !== state) {
      response.statusCode = 400;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Invalid OAuth state.");
      return;
    }
    const authorizationCode = url.searchParams.get("code");
    if (!authorizationCode) {
      response.statusCode = 400;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Missing authorization code.");
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("OpenAI authentication completed. You can close this window.");
    if (settled) return;
    settled = true;
    clearLoginTimer();
    close();
    resolveCode(authorizationCode);
  });

  function clearLoginTimer(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function close(): void {
    clearLoginTimer();
    options.signal.removeEventListener("abort", onAbort);
    try {
      server.close();
    } catch {
      // Closing an already-closed listener is harmless cleanup.
    }
  }

  function fail(error: Error): void {
    if (settled) return;
    settled = true;
    close();
    rejectCode(error);
  }

  function onAbort(): void {
    fail(abortError(options.signal));
  }

  await new Promise<void>((resolve, reject) => {
    const onListenError = (error: unknown) => {
      server.off("listening", onListening);
      const code = errorCode(error);
      reject(new OAuthLoginError(
        code === "EADDRINUSE" ? "port_in_use" : "discovery_failed",
        code === "EADDRINUSE"
          ? `OpenAI Codex login requires ${CODEX_CALLBACK_HOST}:${CODEX_CALLBACK_PORT}, but the port is already in use.`
          : "OpenAI Codex login could not start its local callback listener.",
      ));
    };
    const onListening = () => {
      server.off("error", onListenError);
      resolve();
    };
    server.once("error", onListenError);
    server.once("listening", onListening);
    server.listen(CODEX_CALLBACK_PORT, CODEX_CALLBACK_HOST);
  });

  options.signal.addEventListener("abort", onAbort, { once: true });
  timer = setTimeout(() => {
    fail(new OAuthLoginError("expired_token", "OpenAI Codex login expired."));
  }, CODEX_LOGIN_LIFETIME_MS);
  server.on("error", () => {
    fail(new OAuthLoginError("discovery_failed", "OpenAI Codex callback listener failed."));
  });
  return { code, close };
}

export async function startCodexLogin(options: LoginOptions): Promise<CodexLoginStart> {
  throwIfAborted(options.signal);
  const flow = await authorizationFlow(options.now);
  const loopback = await startLoopback(flow.state, options);
  const credential = loopback.code
    .then(async (code) => {
      const response = await options.fetchImpl(
        CODEX_TOKEN_URL,
        formRequest({
          grant_type: "authorization_code",
          client_id: CODEX_CLIENT_ID,
          code,
          code_verifier: flow.verifier,
          redirect_uri: CODEX_REDIRECT_URI,
        }, requestSignal(options.signal)),
      );
      return readTokenResponse(response, "exchange", options.now);
    })
    .finally(() => {
      loopback.close();
    });
  return { url: flow.url, expiresAt: flow.expiresAt, credential };
}

export async function refreshCodexCredential(
  credential: OAuthCredential,
  options: { fetchImpl: FetchLike; now: () => number; signal: AbortSignal },
): Promise<OAuthCredential> {
  if (!credential.refresh) {
    throw new OAuthLoginError("refresh_failed", "OpenAI Codex credentials are missing a refresh token.");
  }
  const response = await options.fetchImpl(
    CODEX_TOKEN_URL,
    formRequest({
      grant_type: "refresh_token",
      refresh_token: credential.refresh,
      client_id: CODEX_CLIENT_ID,
    }, requestSignal(options.signal)),
  );
  return readTokenResponse(response, "refresh", options.now);
}

export function codexRequestAuth(credential: OAuthCredential, sessionId?: string): FlowRequestAuth {
  if (!credential.accountId) {
    throw new OAuthLoginError("invalid_response", "OpenAI Codex credential is missing its account id.");
  }
  return {
    flow: "openai-codex",
    headers: {
      authorization: `Bearer ${credential.access}`,
      "chatgpt-account-id": credential.accountId,
      "OpenAI-Beta": "responses=experimental",
      originator: "rowan",
      accept: "text/event-stream",
      ...(sessionId ? {
        "session-id": sessionId,
        "x-client-request-id": sessionId,
      } : {}),
    },
  };
}
