import { expect, test } from "bun:test";
import {
  callOpenAICompletions,
  createOpenAICompletionsStream,
  resolveOpenAICompletionsConfig,
} from "../src/providers/openai-completions";
import { ProviderError } from "../src/providers/shared";
import type { ProviderFetch } from "../src/providers/shared";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function jsonResponse(content: string, usage?: Record<string, number>): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      ...(usage ? { usage } : {}),
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function sseResponse(events: Array<{ data: string | object; event?: string }>): Response {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => {
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    const eventLine = e.event ? `event: ${e.event}\n` : "";
    return `${eventLine}data: ${data}\n\n`;
  });
  // Add [DONE] terminator
  chunks.push("data: [DONE]\n\n");

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function sseChunkResponse(content: string, usage?: Record<string, number>): Response {
  const events: Array<{ data: string | object }> = [
    {
      data: {
        choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
      },
    },
  ];
  if (usage) {
    events.push({
      data: { choices: [], usage },
    });
  }
  return sseResponse(events);
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const collected: LlmStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function textDelta(events: LlmStreamEvent[]): string | undefined {
  const event = events.find((e) => e.type === "text_delta");
  return event?.type === "text_delta" ? event.text : undefined;
}

const echoToolDefinition = {
  name: "echo",
  description: "Echoes input.",
  parameters: {},
};

// ---------------------------------------------------------------------------
// Config resolution tests
// ---------------------------------------------------------------------------

test("resolveOpenAICompletionsConfig uses flags over env and defaults base URL", () => {
  const config = resolveOpenAICompletionsConfig({
    apiKey: "flag-key",
    model: "flag-model",
    env: {
      ROWAN_OPENAI_BASE_URL: "https://env.example/v1",
      ROWAN_OPENAI_API_KEY: "env-key",
      ROWAN_MODEL: "env-model",
    },
  });

  expect(config.baseUrl).toBe("https://env.example/v1");
  expect(config.apiKey).toBe("flag-key");
  expect(config.model).toBe("flag-model");
});

test("resolveOpenAICompletionsConfig reports missing API key", () => {
  expect(() =>
    resolveOpenAICompletionsConfig({
      model: "test-model",
      env: {},
    }),
  ).toThrow("Missing API key");
});

// ---------------------------------------------------------------------------
// Non-streaming API tests
// ---------------------------------------------------------------------------

test("callOpenAICompletions posts chat completions request", async () => {
  const fetchMock: ProviderFetch = async (url, init) => {
    expect(String(url)).toBe("https://api.example/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(false);
    return jsonResponse("{\"ok\":true}");
  };

  const result = await callOpenAICompletions(
    {
      baseUrl: "https://api.example/v1/",
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
    },
    { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
  );

  expect(result.content).toBe("{\"ok\":true}");
});

test("callOpenAICompletions returns provider token usage", async () => {
  const fetchMock: ProviderFetch = async () =>
    jsonResponse("{\"ok\":true}", {
      prompt_tokens: 12,
      completion_tokens: 5,
      total_tokens: 17,
    });

  const result = await callOpenAICompletions(
    {
      baseUrl: "https://api.example/v1/",
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
    },
    { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
  );

  expect(result.usage).toEqual({
    inputTokens: 12,
    outputTokens: 5,
    totalTokens: 17,
  });
});

test("callOpenAICompletions normalizes HTTP errors", async () => {
  const fetchMock: ProviderFetch = async () =>
    new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "content-type": "application/json" },
    });

  try {
    await callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        fetch: fetchMock,
      },
      { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
    );
    throw new Error("Expected request to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("http_error");
    expect((error as ProviderError).status).toBe(429);
    expect((error as ProviderError).retryable).toBe(true);
    expect((error as ProviderError).message).toContain("rate limited");
  }
});

test("callOpenAICompletions retries retryable request failures", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Unable to connect. Is the computer able to access the url?");
    }
    return jsonResponse("{\"ok\":true}");
  };

  const result = await callOpenAICompletions(
    {
      baseUrl: "https://api.example/v1",
      apiKey: "test-key",
      model: "test-model",
      retryDelayMs: 0,
      fetch: fetchMock,
    },
    { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
  );

  expect(result.content).toBe("{\"ok\":true}");
  expect(attempts).toBe(2);
});

test("callOpenAICompletions can disable retries", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    throw new Error("Unable to connect. Is the computer able to access the url?");
  };

  await expect(
    callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        maxRetries: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
    ),
  ).rejects.toThrow("Unable to connect");
  expect(attempts).toBe(1);
});

test("callOpenAICompletions supports abort signal", async () => {
  const controller = new AbortController();
  const fetchMock: ProviderFetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("fetch aborted")), {
        once: true,
      });
    });

  const promise = callOpenAICompletions(
    {
      baseUrl: "https://api.example/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
    },
    { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hello" }] },
    { signal: controller.signal },
  );
  controller.abort(new Error("test abort"));

  await expect(promise).rejects.toThrow("test abort");
});

// ---------------------------------------------------------------------------
// Streaming API tests
// ---------------------------------------------------------------------------

test("createOpenAICompletionsStream yields SSE streaming events", async () => {
  const fetchMock: ProviderFetch = async () =>
    sseChunkResponse(
      '{"message":"Hello directly.","route":"direct"}',
      { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    );
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "hello" },
    ],
  };
  const events = await collect(stream(request, {}));

  const modelRequested = events.find((e) => e.type === "model_requested");
  expect(modelRequested?.type).toBe("model_requested");
  if (modelRequested?.type === "model_requested") {
    expect(modelRequested.usage.inputMessages).toBe(2);
  }

  const text = textDelta(events);
  expect(text).toBe('{"message":"Hello directly.","route":"direct"}');

  const done = events.find((e) => e.type === "done");
  expect(done?.type).toBe("done");
  if (done?.type === "done") {
    expect(done.response?.usage?.inputTokens).toBe(10);
    expect(done.response?.usage?.outputTokens).toBe(5);
    expect(done.response?.usage?.totalTokens).toBe(15);
    expect(done.response?.stopReason).toBe("end_turn");
  }
});

test("createOpenAICompletionsStream sends tools in request body", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock: ProviderFetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return sseChunkResponse("ok");
  };
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  await collect(
    stream(
      {
        model: { provider: "test", name: "test-model" },
        system: "Test system",
        messages: [{ role: "user", content: "hello" }],
        tools: [{ name: "echo", description: "Echoes input.", parameters: { type: "object", properties: {} } }],
      },
      {},
    ),
  );

  expect(requestBody?.tools).toBeDefined();
  expect((requestBody?.tools as unknown[]).length).toBe(1);
  expect((requestBody?.tools as Array<{ function: { name: string } }>[0]).function.name).toBe("echo");
  expect(requestBody?.stream).toBe(true);
});

test("createOpenAICompletionsStream handles tool calls from SSE stream", async () => {
  const fetchMock: ProviderFetch = async () =>
    sseResponse([
      {
        data: {
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [{
                index: 0,
                id: "call_abc123",
                type: "function",
                function: { name: "echo", arguments: '{"msg' },
              }],
            },
            finish_reason: null,
          }],
        },
      },
      {
        data: {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '":"hello"}' },
              }],
            },
            finish_reason: null,
          }],
        },
      },
      {
        data: {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: "tool_calls",
          }],
        },
      },
    ]);

  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      {
        model: { provider: "test", name: "test-model" },
        messages: [{ role: "user", content: "hello" }],
        tools: [{ name: "echo", description: "Echoes input.", parameters: {} }],
      },
      {},
    ),
  );

  const starts = events.filter((e) => e.type === "tool_call_start");
  expect(starts.length).toBe(1);
  expect(starts[0]).toMatchObject({ type: "tool_call_start", id: "call_abc123", name: "echo" });

  const deltas = events.filter((e) => e.type === "tool_call_delta");
  expect(deltas.length).toBe(2);

  const ends = events.filter((e) => e.type === "tool_call_end");
  expect(ends.length).toBe(1);
  expect(ends[0]).toMatchObject({
    type: "tool_call_end",
    id: "call_abc123",
    name: "echo",
    arguments: '{"msg":"hello"}',
  });

  const done = events.find((e) => e.type === "done");
  expect(done?.type).toBe("done");
  if (done?.type === "done") {
    expect(done.response?.stopReason).toBe("tool_use");
    expect(done.response?.toolCalls?.length).toBe(1);
    expect(done.response?.toolCalls?.[0]).toMatchObject({
      id: "call_abc123",
      name: "echo",
      arguments: { msg: "hello" },
    });
  }
});

test("createOpenAICompletionsStream yields error event on HTTP failure", async () => {
  const fetchMock: ProviderFetch = async () =>
    new Response(JSON.stringify({ error: { message: "bad request" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      { model: { provider: "test", name: "test" }, messages: [{ role: "user", content: "hi" }] },
      {},
    ),
  );

  const error = events.find((e) => e.type === "error");
  expect(error?.type).toBe("error");

  const done = events.find((e) => e.type === "done");
  expect(done?.type).toBe("done");
  if (done?.type === "done") {
    expect(done.response?.stopReason).toBe("error");
  }
});

test("createOpenAICompletionsStream yields text_delta for non-JSON text", async () => {
  const fetchMock: ProviderFetch = async () =>
    sseChunkResponse("Just plain text without JSON.");
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "hello" },
    ],
  };
  const events = await collect(stream(request, {}));

  const text = textDelta(events);
  expect(text).toBe("Just plain text without JSON.");
});
