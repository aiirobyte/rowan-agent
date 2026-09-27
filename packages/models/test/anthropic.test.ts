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

  expect(events.map((event) => event.type)).toEqual(["model_requested", "start", "text_delta", "done"]);
  const done = events.find((event) => event.type === "done");
  expect(done?.type === "done" ? done.response : undefined).toEqual({
    content: "hello",
    stopReason: "end_turn",
    usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
  });
});

test("Anthropic preserves streamed thinking content", async () => {
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
        data: { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
      },
      {
        event: "content_block_delta",
        data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "First thought. " } },
      },
      {
        event: "content_block_delta",
        data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Second thought." } },
      },
      {
        event: "content_block_stop",
        data: { type: "content_block_stop", index: 0 },
      },
      {
        event: "content_block_start",
        data: { type: "content_block_start", index: 1, content_block: { type: "text" } },
      },
      {
        event: "content_block_delta",
        data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer." } },
      },
      {
        event: "content_block_stop",
        data: { type: "content_block_stop", index: 1 },
      },
      {
        event: "message_delta",
        data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
      },
      { event: "message_stop", data: { type: "message_stop" } },
    ]),
  });

  const events = await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(events.map((event) => event.type)).toEqual([
    "model_requested",
    "start",
    "thinking_delta",
    "thinking_delta",
    "text_delta",
    "done",
  ]);
  const thinkingEvents = events.filter((event) => event.type === "thinking_delta");
  expect(thinkingEvents.at(-1)?.partial.contentBlocks).toContainEqual({
    type: "thinking",
    thinking: "First thought. Second thought.",
  });

  const done = events.find((event) => event.type === "done");
  expect(done?.type).toBe("done");
  if (done?.type === "done") {
    expect(done.response?.thinking).toBe("First thought. Second thought.");
    expect(done.response?.content).toBe("Answer.");
  }
});

test("Anthropic converts the configured thinking level to a token budget", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    maxTokens: 4096,
    thinkingLevel: "low",
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
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
  });

  await collect(stream(
    { model: { provider: "anthropic", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(requestBody?.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
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

test("Anthropic surfaces an in-stream error event", async () => {
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 0,
    fetch: async () => anthropicSseResponse([
      {
        event: "message_start",
        data: { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 0 } } },
      },
      {
        event: "error",
        data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
      },
    ]),
  });

  const events = await collect(stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));
  const error = events.find((event) => event.type === "error");
  const done = events.find((event) => event.type === "done");

  expect(done?.type === "done" && done.response?.stopReason).toBe("error");
  expect(error?.type === "error" && error.error).toBeInstanceOf(ProviderError);
  expect(error?.type === "error" && error.error.message).toBe("Overloaded");
});

function capturingAnthropic(model: string, events: Array<{ event: string; data: object }> = []) {
  const bodies: Array<Record<string, unknown>> = [];
  const stream = createAnthropicStream({
    baseUrl: "https://api.example",
    apiKey: "test-key",
    model,
    maxRetries: 0,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return anthropicSseResponse(events);
    },
  });
  return { stream, bodies };
}

const tool = {
  name: "read",
  description: "Read a file",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
};

test("Anthropic uses adaptive thinking, effort and tool_choice on current models", async () => {
  const { stream, bodies } = capturingAnthropic("claude-opus-5");
  await collect(stream({
    model: { provider: "anthropic", id: "claude-opus-5" },
    messages: [{ role: "user", content: "hi" }],
    tools: [tool],
    toolChoice: "required",
    thinkingLevel: "max",
    temperature: 0.2,
  }, {}));

  expect(bodies[0]?.thinking).toEqual({ type: "adaptive", display: "summarized" });
  expect(bodies[0]?.output_config).toEqual({ effort: "max" });
  expect(bodies[0]?.temperature).toBeUndefined();
  expect(bodies[0]?.tool_choice).toEqual({ type: "any" });
  expect((bodies[0]?.tools as Array<{ input_schema: unknown }>)[0]?.input_schema).toEqual(tool.parameters);
});

test("Anthropic keeps budget thinking for earlier models", async () => {
  const { stream, bodies } = capturingAnthropic("claude-haiku-4-5");
  await collect(stream({
    model: { provider: "anthropic", id: "claude-haiku-4-5" },
    messages: [{ role: "user", content: "hi" }],
    thinkingLevel: "low",
  }, {}));

  expect(bodies[0]?.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
  expect(bodies[0]?.output_config).toBeUndefined();
});

test("Anthropic captures thinking signatures in order and replays only its own", async () => {
  const { stream, bodies } = capturingAnthropic("claude-opus-5", [
    { event: "message_start", data: { type: "message_start", message: { id: "m", usage: { input_tokens: 5, output_tokens: 0, cache_read_input_tokens: 3 } } } },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "plan" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-1" } } },
    { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "enc" } } },
    { event: "content_block_start", data: { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1", name: "read" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"path\":\"a\"}" } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 2 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } } },
  ]);
  const events = await collect(stream({ model: { provider: "anthropic", id: "claude-opus-5" }, messages: [{ role: "user", content: "hi" }] }, {}));
  const done = events.find((event) => event.type === "done");
  const blocks = [...events].reverse().find((event) => "partial" in event);

  expect(blocks && "partial" in blocks ? blocks.partial.contentBlocks : []).toEqual([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "thinking", thinking: "", signature: "anthropic-redacted:enc" },
    { type: "tool_call", id: "t1", name: "read", args: "{\"path\":\"a\"}" },
  ]);
  expect(done?.type === "done" && done.response?.usage).toEqual({ inputTokens: 5, outputTokens: 9, cacheReadTokens: 3, totalTokens: 14 });

  await collect(stream({
    model: { provider: "anthropic", id: "claude-opus-5" },
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [
        { type: "thinking", thinking: "plan", signature: "sig-1" },
        { type: "thinking", thinking: "", signature: "anthropic-redacted:enc" },
        { type: "thinking", thinking: "foreign", signature: "openai-reasoning:[]" },
        { type: "tool_use", id: "t1", name: "read", input: { path: "a" } },
      ] },
      { role: "tool", content: [{ type: "tool_result", toolUseId: "t1", content: "ok" }] },
    ],
  }, {}));

  expect((bodies[1]?.messages as Array<{ content: unknown }>)[1]?.content).toEqual([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "redacted_thinking", data: "enc" },
    { type: "tool_use", id: "t1", name: "read", input: { path: "a" } },
  ]);
});
