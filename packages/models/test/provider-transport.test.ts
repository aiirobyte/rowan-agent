import { expect, test } from "bun:test";
import {
  executeProviderRequest,
  ProviderError,
  streamProviderRequest,
  type ProviderFetch,
  type ProviderRequestSpec,
} from "../src/providers";
import type { LlmStreamEvent } from "../src/protocol";

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const result: LlmStreamEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

test("an extension can execute a request through the public provider transport", async () => {
  let requestHeaders: Record<string, string> | undefined;
  const fetch: ProviderFetch = async (_url, init) => {
    requestHeaders = init?.headers as Record<string, string>;
    return Response.json({ value: "ok" });
  };
  const spec: ProviderRequestSpec = {
    config: {
      model: "extension-model",
      headers: { authorization: "Extension token" },
      fetch,
    },
    endpoint: "https://provider.example/generate",
    request: () => ({
      method: "POST",
      headers: { authorization: "Default token" },
    }),
  };

  const result = await executeProviderRequest(
    spec,
    (response) => response.json<{ value: string }>(),
  );

  expect(result).toEqual({ value: "ok" });
  expect(requestHeaders?.authorization).toBe("Extension token");
});

test("an extension stream receives the shared structured error contract", async () => {
  const events = await collect(streamProviderRequest({
    config: {
      model: "extension-model",
      maxRetries: 0,
      fetch: async () => new Response("<html>forbidden</html>", {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "text/html" },
      }),
    },
    endpoint: "https://provider.example/generate",
    llmRequest: {
      model: { provider: "extension", id: "extension-model" },
      messages: [{ role: "user", content: "hello" }],
    },
    request: () => ({ method: "POST" }),
  }, async function* () {
    throw new Error("The decoder must not run for an HTTP error.");
  }));

  const error = events.find((event) => event.type === "error");
  expect(error?.type === "error" ? error.error.message : undefined)
    .toBe("Request failed with status 403 Forbidden.");
  expect(events.at(-1)).toMatchObject({ type: "done", response: { stopReason: "error" } });
});

test("a never-settling body cancellation cannot block timeout delivery", async () => {
  const encoder = new TextEncoder();
  let cancelCalled = false;
  let finishCancel: () => void = () => undefined;
  const cancelPending = new Promise<void>((resolve) => {
    finishCancel = resolve;
  });
  const fetch: ProviderFetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("partial"));
    },
    cancel() {
      cancelCalled = true;
      return cancelPending;
    },
  }));

  const request = executeProviderRequest({
    config: {
      model: "extension-model",
      timeoutMs: 10,
      maxRetries: 0,
      fetch,
    },
    endpoint: "https://provider.example/generate",
    request: () => ({ method: "POST" }),
  }, (response) => response.text()).then(
    () => "resolved" as const,
    (error: unknown) => error,
  );

  const result = await Promise.race([
    request,
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 100)),
  ]);
  finishCancel();

  expect(result).toBeInstanceOf(ProviderError);
  expect(result).toMatchObject({ code: "request_timeout", retryable: true });
  expect(cancelCalled).toBe(true);
});

test("an unsupported timeout is rejected before the request starts", async () => {
  let fetchCalled = false;
  const result = await executeProviderRequest({
    config: {
      model: "extension-model",
      timeoutMs: Number.POSITIVE_INFINITY,
      maxRetries: 0,
      fetch: async () => {
        fetchCalled = true;
        return Response.json({ value: "unexpected" });
      },
    },
    endpoint: "https://provider.example/generate",
    request: () => ({ method: "POST" }),
  }, (response) => response.json()).then(
    () => "resolved" as const,
    (error: unknown) => error,
  );

  expect(result).toBeInstanceOf(ProviderError);
  expect(result).toMatchObject({
    code: "invalid_config",
    retryable: false,
    details: {
      field: "timeoutMs",
      endpoint: "https://provider.example/generate",
      model: "extension-model",
    },
  });
  expect(fetchCalled).toBe(false);
});
