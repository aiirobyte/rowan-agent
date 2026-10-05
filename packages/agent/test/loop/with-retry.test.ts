import { expect, test } from "bun:test";
import { withRetry, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS } from "../../src/loop/runners";

test("DEFAULT_MAX_RETRIES is 10 and DEFAULT_RETRY_DELAY_MS is 5000", () => {
  expect(DEFAULT_MAX_RETRIES).toBe(10);
  expect(DEFAULT_RETRY_DELAY_MS).toBe(5_000);
});

test("retries up to 10 times then throws when all attempts fail with retryable error", async () => {
  let calls = 0;
  const retryEvents: Array<{ attempt: number; error: unknown; delayMs: number; maxRetries: number }> = [];

  const error = new Error("500 Internal Server Error");
  await expect(
    withRetry(
      async () => {
        calls += 1;
        throw error;
      },
      {
        retryDelayMs: 1,
        onRetry: (attempt, err, delayMs, maxRetries) => {
          retryEvents.push({ attempt, error: err, delayMs, maxRetries });
        },
      },
    ),
  ).rejects.toThrow("500 Internal Server Error");

  // 1 initial call + 10 retries = 11 total calls
  expect(calls).toBe(11);
  expect(retryEvents.length).toBe(10);
  expect(retryEvents.map((e) => e.attempt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(retryEvents.every((e) => e.maxRetries === 10)).toBe(true);
  expect(retryEvents.every((e) => e.delayMs === 1)).toBe(true);
  expect(retryEvents.every((e) => e.error === error)).toBe(true);
});

test("a success on attempt k stops retrying", async () => {
  let calls = 0;
  const retryEvents: number[] = [];

  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 4) {
        throw new Error("429 rate limit");
      }
      return "success-value";
    },
    {
      retryDelayMs: 1,
      onRetry: (attempt) => {
        retryEvents.push(attempt);
      },
    },
  );

  expect(result).toBe("success-value");
  expect(calls).toBe(4);
  expect(retryEvents).toEqual([1, 2, 3]);
});

test("abort during the wait stops promptly", async () => {
  let calls = 0;
  const controller = new AbortController();
  const startTime = Date.now();

  const promise = withRetry(
    async () => {
      calls += 1;
      throw new Error("503 Service Unavailable");
    },
    {
      retryDelayMs: 10_000, // 10 second delay
      signal: controller.signal,
      onRetry: () => {
        // Abort promptly during the wait
        setTimeout(() => controller.abort(), 20);
      },
    },
  );

  await expect(promise).rejects.toThrow("503 Service Unavailable");
  const elapsed = Date.now() - startTime;
  expect(calls).toBe(1);
  // Must finish promptly rather than sleeping through the 10 s delay
  expect(elapsed).toBeLessThan(1_000);
});

test("pre-aborted signal aborts immediately without retrying", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  let retried = false;

  await expect(
    withRetry(
      async () => {
        calls += 1;
        throw new Error("502 bad gateway");
      },
      {
        retryDelayMs: 1,
        signal: controller.signal,
        onRetry: () => {
          retried = true;
        },
      },
    ),
  ).rejects.toThrow("502 bad gateway");

  expect(calls).toBe(1);
  expect(retried).toBe(false);
});

test("non-retryable errors throw immediately without retrying", async () => {
  let calls = 0;
  let retried = false;

  await expect(
    withRetry(
      async () => {
        calls += 1;
        throw new Error("syntax error: unexpected token");
      },
      {
        retryDelayMs: 1,
        onRetry: () => {
          retried = true;
        },
      },
    ),
  ).rejects.toThrow("syntax error: unexpected token");

  expect(calls).toBe(1);
  expect(retried).toBe(false);
});

test("retries network drop and transport errors", async () => {
  const networkErrors = [
    "The socket connection was closed unexpectedly",
    "fetch failed",
    "connect ETIMEDOUT 1.2.3.4:443",
    "socket hang up",
    "network connection reset",
    "read connection reset by peer",
  ];
  for (const message of networkErrors) {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error(message);
        return "ok";
      },
      { retryDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  }
});

