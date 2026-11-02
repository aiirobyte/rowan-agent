import type { OAuthCredential, OAuthFlow } from "../auth";
import { refreshCopilotCredential, startCopilotLogin } from "./github-copilot";
import { refreshCodexCredential, startCodexLogin } from "./openai-codex";
import { abortError } from "./shared";
import { refreshXaiCredential, startXaiLogin } from "./xai";

export type OAuthLoginOptions = {
  fetch?: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>;
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
};

export type OAuthRefreshOptions = {
  fetch?: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>;
  now?: () => number;
  signal?: AbortSignal;
};

export type OAuthLoginSession = {
  /** Browser authorization URL for redirect-based flows. */
  url?: string;
  /** Device flow code shown to the person. */
  userCode?: string;
  /** Device flow verification URL. */
  verificationUri?: string;
  /** Unix epoch milliseconds. */
  expiresAt: number;
  credential: Promise<OAuthCredential>;
  cancel(): void;
};

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function startOAuthLogin(
  flow: OAuthFlow,
  options: OAuthLoginOptions = {},
): Promise<OAuthLoginSession> {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  let session: OAuthLoginSession;
  try {
    if (flow === "xai") {
      const started = await startXaiLogin({ fetchImpl, now, sleep, signal });
      session = {
        userCode: started.userCode,
        verificationUri: started.verificationUri,
        expiresAt: started.expiresAt,
        credential: started.credential,
        cancel: () => controller.abort(),
      };
    } else if (flow === "github-copilot") {
      const started = await startCopilotLogin({ fetchImpl, now, sleep, signal });
      session = {
        userCode: started.userCode,
        verificationUri: started.verificationUri,
        expiresAt: started.expiresAt,
        credential: started.credential,
        cancel: () => controller.abort(),
      };
    } else {
      const started = await startCodexLogin({ fetchImpl, now, signal });
      session = {
        url: started.url,
        expiresAt: started.expiresAt,
        credential: started.credential,
        cancel: () => controller.abort(),
      };
    }
  } catch (error) {
    controller.abort();
    throw error;
  }
  return session;
}

export async function refreshOAuthCredential(
  flow: OAuthFlow,
  credential: OAuthCredential,
  options: OAuthRefreshOptions = {},
): Promise<OAuthCredential> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const signal = options.signal ?? new AbortController().signal;
  if (flow === "xai") return refreshXaiCredential(credential, { fetchImpl, now, signal });
  if (flow === "github-copilot") return refreshCopilotCredential(credential, { fetchImpl, now, signal });
  return refreshCodexCredential(credential, { fetchImpl, now, signal });
}
