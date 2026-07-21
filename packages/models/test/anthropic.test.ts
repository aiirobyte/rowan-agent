import { expect, test } from "bun:test";
import { createAnthropicStream } from "../src/providers/anthropic";
import type { LlmStreamEvent } from "../src/protocol";
import { ProviderError } from "../src/providers/shared";
import type { ProviderFetch } from "../src/providers/shared";

function anthropicSseResponse(events: Array<{ event: string; data: object }>): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
      }
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const collected: LlmStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

test("Anthropic structures HTML HTTP errors", async () => {
  const responseBody = "<html><body><h1>403 Forbidden</h1></body></html>";
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 0,
    fetch: async () => new Response(responseBody, {
      status: 403,
      statusText: "Forbidden",
      headers: { "content-type": "text/html" },
    }),
  });

  const events = await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));
  const error = events.find((event) => event.type === "error");

  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error).toBeInstanceOf(ProviderError);
    expect(error.error.message).toBe("Anthropic request failed with status 403 Forbidden.");
    expect((error.error as ProviderError).details).toEqual({
      endpoint: "https://api.example/v1/messages",
      model: "test-model",
      status: 403,
      responseContentType: "text/html",
      responseBody,
    });
  }
});

test("Anthropic normalizes a string provider error", async () => {
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 0,
    fetch: async () => new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "content-type": "application/json" },
    }),
  });

  const events = await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));
  const error = events.find((event) => event.type === "error");

  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error.message).toBe("Anthropic request failed (429 Too Many Requests): rate limited");
    expect((error.error as ProviderError).details?.providerError).toEqual({ message: "rate limited" });
  }
});

test("Anthropic preserves successful stream events", async () => {
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    fetch: async () => anthropicSseResponse([
      {
        event: "message_start",
        data: { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 0 } } },
      },
      {
        event: "content_block_start",
        data: { type: "content_block_start", index: 0, content_block: { type: "text" } },
      },
      {
        event: "content_block_delta",
        data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      },
      {
        event: "content_block_stop",
        data: { type: "content_block_stop", index: 0 },
      },
      {
        event: "message_delta",
        data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
      },
      { event: "message_stop", data: { type: "message_stop" } },
    ]),
  });

  const events = await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(events.map((event) => event.type)).toEqual(["model_requested", "text_delta", "done"]);
  const done = events.find((event) => event.type === "done");
  expect(done?.type === "done" ? done.response : undefined).toEqual({
    content: "hello",
    stopReason: "end_turn",
    usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
  });
});

test("Anthropic applies custom request headers", async () => {
  let requestHeaders: Record<string, string> | undefined;
  const config = {
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    headers: { "x-api-key": "custom-key", "x-tenant": "tenant-1" },
    fetch: async (_url: Parameters<ProviderFetch>[0], init?: Parameters<ProviderFetch>[1]) => {
      requestHeaders = init?.headers as Record<string, string>;
      return anthropicSseResponse([
        {
          event: "message_start",
          data: { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 1, output_tokens: 0 } } },
        },
        {
          event: "message_delta",
          data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 0 } },
        },
        { event: "message_stop", data: { type: "message_stop" } },
      ]);
    },
  };

  const stream = createAnthropicStream(config);
  await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(requestHeaders?.["x-api-key"]).toBe("custom-key");
  expect(requestHeaders?.["x-tenant"]).toBe("tenant-1");
  expect(requestHeaders?.["anthropic-version"]).toBe("2023-06-01");
});
