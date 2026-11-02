import type { OAuthCredential } from "../auth";
import { isRecord } from "../providers/shared";
import { OAuthLoginError } from "./errors";

export { isRecord } from "../providers/shared";

export const MAX_TIMER_MILLISECONDS = 2_147_483_647;

export type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

export type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export type LoginOptions = {
  fetchImpl: FetchLike;
  now: () => number;
  signal: AbortSignal;
};

export type DeviceLoginOptions = LoginOptions & {
  sleep: Sleep;
};

export type DeviceLoginStart = {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  credential: Promise<OAuthCredential>;
};

export type FlowRequestAuth = {
  headers: Record<string, string>;
  baseUrl?: string;
};

export function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("OAuth login cancelled.");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

export function requestSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
}

export function positiveSeconds(
  value: unknown,
  maximumMilliseconds = MAX_TIMER_MILLISECONDS,
): number | null {
  const seconds = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof seconds === "number"
    && Number.isFinite(seconds)
    && seconds > 0
    && seconds * 1000 <= maximumMilliseconds
    ? seconds
    : null;
}

export async function readObject(
  response: Response,
  label: string,
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthLoginError("invalid_response", `${label} returned invalid JSON.`);
  }
  if (!isRecord(payload)) {
    throw new OAuthLoginError("invalid_response", `${label} returned an invalid payload.`);
  }
  return payload;
}

export function formRequest(
  body: Record<string, string>,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
    signal,
  };
}

export type DevicePollResult<T> =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "access_denied" }
  | { status: "expired_token" }
  | { status: "failed"; error: Error }
  | { status: "complete"; value: T };

export async function pollDeviceToken<T>(input: {
  intervalMs: number;
  deadline: number;
  now: () => number;
  sleep: Sleep;
  signal: AbortSignal;
  poll: () => Promise<DevicePollResult<T>>;
  deniedError: () => Error;
  expiredError: () => Error;
  beforeFirstPoll?: "poll" | "sleep";
  capDelayToDeadline?: boolean;
  slowDownIntervalMs?: (intervalMs: number) => number;
}): Promise<T> {
  let intervalMs = input.intervalMs;
  if (input.beforeFirstPoll === "sleep" && input.now() < input.deadline) {
    await input.sleep(intervalMs, input.signal);
    throwIfAborted(input.signal);
  }

  while (input.now() < input.deadline) {
    throwIfAborted(input.signal);
    const result = await input.poll();
    if (result.status === "complete") return result.value;
    if (result.status === "access_denied") throw input.deniedError();
    if (result.status === "expired_token") throw input.expiredError();
    if (result.status === "failed") throw result.error;
    if (result.status === "slow_down") {
      intervalMs = input.slowDownIntervalMs
        ? input.slowDownIntervalMs(intervalMs)
        : intervalMs + 5_000;
    }

    const remainingMs = input.deadline - input.now();
    if (remainingMs <= 0) break;
    await input.sleep(
      input.capDelayToDeadline ? Math.min(intervalMs, remainingMs) : intervalMs,
      input.signal,
    );
    throwIfAborted(input.signal);
  }
  throwIfAborted(input.signal);
  throw input.expiredError();
}
