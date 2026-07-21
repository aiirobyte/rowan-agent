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

function sseResponse(
  events: Array<{ data: string | object; event?: string }>,
  contentType = "text/event-stream",
): Response {
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
    headers: { "content-type": contentType },
  });
}

function singleChunkSseResponse(events: Array<{ data: string | object }>): Response {
  const encoder = new TextEncoder();
  const payload = [
    ...events.map((event) => `data: ${typeof event.data === "string" ? event.data : JSON.stringify(event.data)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  }), {
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

function delayedSseResponse(
  chunks: Array<{ data: string | object; delayMs?: number }>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const chunk of chunks) {
          if (chunk.delayMs) await new Promise((resolve) => setTimeout(resolve, chunk.delayMs));
          const data = typeof chunk.data === "string" ? chunk.data : JSON.stringify(chunk.data);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
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

test("resolveOpenAICompletionsConfig uses flags and defaults base URL", () => {
  const config = resolveOpenAICompletionsConfig({
    apiKey: "flag-key",
    model: "flag-model",
    baseUrl: "https://env.example/v1",
  });

  expect(config.baseUrl).toBe("https://env.example/v1");
  expect(config.apiKey).toBe("flag-key");
  expect(config.model).toBe("flag-model");
});

test("resolveOpenAICompletionsConfig reports missing API key", () => {
  expect(() =>
    resolveOpenAICompletionsConfig({
      model: "test-model",
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
    { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
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
    { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
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
        maxRetries: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
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

test("callOpenAICompletions hides HTML embedded in a JSON provider error", async () => {
  const providerMessage = "<html><body><h1>Forbidden</h1></body></html>";
  const fetchMock: ProviderFetch = async () => new Response(JSON.stringify({
    error: { message: providerMessage, param: "upstream" },
  }), {
    status: 403,
    statusText: "Forbidden",
    headers: { "content-type": "application/json" },
  });

  try {
    await callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        maxRetries: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    );
    throw new Error("Expected request to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).toBe("Request failed with status 403 Forbidden.");
    expect((error as ProviderError).message).not.toContain("<html>");
    expect((error as ProviderError).details?.providerError).toEqual({
      message: providerMessage,
      param: "upstream",
    });
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
    { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
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
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    ),
  ).rejects.toThrow("Unable to connect");
  expect(attempts).toBe(1);
});

test("callOpenAICompletions treats maxRetries as additional attempts", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    throw new Error("Unable to connect.");
  };

  await expect(
    callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        maxRetries: 2,
        retryDelayMs: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    ),
  ).rejects.toThrow("Unable to connect");
  expect(attempts).toBe(3);
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
    { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    { signal: controller.signal },
  );
  controller.abort(new Error("test abort"));

  try {
    await promise;
    throw new Error("Expected request to be aborted.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("request_aborted");
    expect((error as ProviderError).retryable).toBe(false);
    expect((error as ProviderError).message).toBe("test abort");
    expect((error as ProviderError).details).toMatchObject({
      endpoint: "https://api.example/v1/chat/completions",
      model: "test-model",
    });
  }
});

test("callOpenAICompletions does not retry deterministic response decode failures", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    return new Response("null", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        retryDelayMs: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    );
    throw new Error("Expected response decoding to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("response_decode_error");
    expect((error as ProviderError).retryable).toBe(false);
    expect((error as ProviderError).details).toMatchObject({
      endpoint: "https://api.example/v1/chat/completions",
      model: "test-model",
    });
  }
  expect(attempts).toBe(1);
});

test("callOpenAICompletions times out while waiting for response headers", async () => {
  const fetchMock: ProviderFetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const guard = setTimeout(() => reject(new Error("timeout guard expired")), 50);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(guard);
        reject(init.signal?.reason);
      }, { once: true });
    });

  try {
    await callOpenAICompletions(
      {
        baseUrl: "https://api.example/v1",
        apiKey: "test-key",
        model: "test-model",
        timeoutMs: 10,
        maxRetries: 0,
        fetch: fetchMock,
      },
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hello" }] },
    );
    throw new Error("Expected request to time out.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("request_timeout");
    expect((error as ProviderError).message).toBe("Request timed out after 10ms.");
    expect((error as ProviderError).details).toMatchObject({
      endpoint: "https://api.example/v1/chat/completions",
      model: "test-model",
      timeoutMs: 10,
    });
  }
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
    model: { provider: "openai-compatible", id: "test-model" },
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

test("createOpenAICompletionsStream structures HTML HTTP errors", async () => {
  const responseBody = "<html><body><h1>403 Forbidden</h1></body></html>";
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
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
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));
  const error = events.find((event) => event.type === "error");

  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error).toBeInstanceOf(ProviderError);
    expect(error.error.message).toBe("Request failed with status 403 Forbidden.");
    expect(error.error.message).not.toContain("<html>");
    expect((error.error as ProviderError).details).toEqual({
      endpoint: "https://api.example/v1/chat/completions",
      model: "test-model",
      status: 403,
      responseContentType: "text/html",
      responseBody,
    });
  }
});

test("createOpenAICompletionsStream times out while waiting for response headers", async () => {
  const fetchMock: ProviderFetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const guard = setTimeout(() => reject(new Error("timeout guard expired")), 50);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(guard);
        reject(init.signal?.reason);
      }, { once: true });
    });
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 10,
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events = await collect(stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));
  const error = events.find((event) => event.type === "error");

  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error).toBeInstanceOf(ProviderError);
    expect((error.error as ProviderError).code).toBe("request_timeout");
    expect(error.error.message).toBe("Request timed out after 10ms.");
  }
  expect(events.at(-1)).toMatchObject({ type: "done", response: { stopReason: "error" } });
});

test("createOpenAICompletionsStream treats timeoutMs as an idle timeout", async () => {
  const fetchMock: ProviderFetch = async () => delayedSseResponse([
    { data: { choices: [{ delta: { content: "one" } }] } },
    { delayMs: 15, data: { choices: [{ delta: { content: "two" } }] } },
    { delayMs: 15, data: { choices: [{ delta: { content: "three" }, finish_reason: "stop" }] } },
  ]);
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 25,
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
      {},
    ),
  );

  expect(events.filter((event) => event.type === "text_delta").map((event) => event.type === "text_delta" ? event.text : "")).toEqual([
    "one",
    "two",
    "three",
  ]);
  expect(events.some((event) => event.type === "error")).toBe(false);
});

test("createOpenAICompletionsStream does not count consumer processing as network idle time", async () => {
  const fetchMock: ProviderFetch = async () => sseResponse([
    { data: { choices: [{ delta: { content: "one" } }] } },
    { data: { choices: [{ delta: { content: "two" }, finish_reason: "stop" }] } },
  ]);
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 10,
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events: LlmStreamEvent[] = [];
  for await (const event of stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  )) {
    events.push(event);
    if (event.type === "text_delta" && event.text === "one") {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  expect(events.filter((event) => event.type === "text_delta").map((event) => event.type === "text_delta" ? event.text : "")).toEqual(["one", "two"]);
  expect(events.some((event) => event.type === "error")).toBe(false);
});

test("createOpenAICompletionsStream stops buffered events after caller abort", async () => {
  const controller = new AbortController();
  const fetchMock: ProviderFetch = async () => singleChunkSseResponse([
    { data: { choices: [{ delta: { content: "one" } }] } },
    { data: { choices: [{ delta: { content: "two" }, finish_reason: "stop" }] } },
  ]);
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events: LlmStreamEvent[] = [];
  for await (const event of stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    { signal: controller.signal },
  )) {
    events.push(event);
    if (event.type === "text_delta") controller.abort(new Error("stop now"));
  }

  expect(events.filter((event) => event.type === "text_delta").map((event) => event.type === "text_delta" ? event.text : "")).toEqual(["one"]);
  expect(events.find((event) => event.type === "error")).toMatchObject({
    type: "error",
    error: { message: "stop now" },
  });
  expect(events.at(-1)).toMatchObject({ type: "done", response: { stopReason: "error" } });
});

test("createOpenAICompletionsStream cancels the response body when the consumer stops early", async () => {
  let cancelled = false;
  const encoder = new TextEncoder();
  const fetchMock: ProviderFetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"one"}}]}\n\n'));
    },
    cancel() {
      cancelled = true;
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  for await (const event of stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  )) {
    if (event.type === "text_delta") break;
  }
  await Promise.resolve();

  expect(cancelled).toBe(true);
});

test("createOpenAICompletionsStream accepts case-insensitive SSE content types", async () => {
  const fetchMock: ProviderFetch = async () => sseResponse([
    { data: { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] } },
  ], "Text/Event-Stream; Charset=UTF-8");
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const events = await collect(stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(events.find((event) => event.type === "text_delta")).toMatchObject({ type: "text_delta", text: "ok" });
  expect(events.some((event) => event.type === "error")).toBe(false);
});

test("createOpenAICompletionsStream reports idle timeout after first byte", async () => {
  const fetchMock: ProviderFetch = async () => delayedSseResponse([
    { data: { choices: [{ delta: { content: "partial" } }] } },
    { delayMs: 30, data: { choices: [{ delta: { content: "late" } }] } },
  ]);
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 10,
    maxRetries: 0,
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
      {},
    ),
  );

  const error = events.find((event) => event.type === "error");
  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error.message).toBe("Request timed out after 10ms.");
  }
});

test("createOpenAICompletionsStream preserves caller abort", async () => {
  const controller = new AbortController();
  const fetchMock: ProviderFetch = async (_url, init) => new Response(
    new ReadableStream({
      start(streamController) {
        init?.signal?.addEventListener("abort", () => streamController.error(init.signal?.reason), { once: true });
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 100,
    maxRetries: 0,
    fetch: fetchMock,
  });

  const promise = collect(
    stream(
      { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
      { signal: controller.signal },
    ),
  );
  controller.abort(new Error("test abort"));

  const events = await promise;
  const error = events.find((event) => event.type === "error");
  expect(error?.type).toBe("error");
  if (error?.type === "error") {
    expect(error.error.message).toBe("test abort");
  }
});

test("createOpenAICompletionsStream does not retry after partial output", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    return delayedSseResponse([
      { data: { choices: [{ delta: { content: "partial" } }] } },
      { delayMs: 30, data: { choices: [{ delta: { content: "late" } }] } },
    ]);
  };
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 10,
    maxRetries: 2,
    retryDelayMs: 0,
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
      {},
    ),
  );

  expect(attempts).toBe(1);
  expect(events.filter((event) => event.type === "text_delta").map((event) => event.type === "text_delta" ? event.text : "")).toEqual(["partial"]);
  expect(events.filter((event) => event.type === "error")).toHaveLength(1);
  const error = events.find((event) => event.type === "error");
  expect(error?.type === "error" ? (error.error as ProviderError).retryable : undefined).toBe(false);
  expect(error?.type === "error" ? (error.error as ProviderError).details : undefined).toMatchObject({
    partialOutput: true,
  });
});

test("createOpenAICompletionsStream retries before partial output without duplicating lifecycle events", async () => {
  let attempts = 0;
  const fetchMock: ProviderFetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.error(new Error("stream disconnected"));
        },
      }), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return sseChunkResponse("ok");
  };
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    maxRetries: 1,
    retryDelayMs: 0,
    fetch: fetchMock,
  });

  const events = await collect(stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(attempts).toBe(2);
  expect(events.filter((event) => event.type === "model_requested")).toHaveLength(1);
  expect(events.filter((event) => event.type === "start")).toHaveLength(1);
  expect(events.find((event) => event.type === "text_delta")).toMatchObject({ type: "text_delta", text: "ok" });
  expect(events.some((event) => event.type === "error")).toBe(false);
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
        model: { provider: "test", id: "test-model" },
        system: "Test system",
        messages: [{ role: "user", content: "hello" }],
        tools: [{ name: "echo", description: "Echoes input.", parameters: { type: "object", properties: {} } }],
      },
      {},
    ),
  );

  expect(requestBody?.tools).toBeDefined();
  expect((requestBody?.tools as unknown[]).length).toBe(1);
  expect((requestBody?.tools as Array<{ function: { name: string } }>)[0]?.function.name).toBe("echo");
  expect(requestBody?.stream).toBe(true);
});

test("createOpenAICompletionsStream applies custom request headers", async () => {
  let requestHeaders: Record<string, string> | undefined;
  const config = {
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    headers: { authorization: "Custom token", "x-tenant": "tenant-1" },
    fetch: async (_url: Parameters<ProviderFetch>[0], init?: Parameters<ProviderFetch>[1]) => {
      requestHeaders = init?.headers as Record<string, string>;
      return sseChunkResponse("ok");
    },
  };

  const stream = createOpenAICompletionsStream(config);
  await collect(stream(
    { model: { provider: "test", id: "test-model" }, messages: [{ role: "user", content: "hello" }] },
    {},
  ));

  expect(requestHeaders?.authorization).toBe("Custom token");
  expect(requestHeaders?.["x-tenant"]).toBe("tenant-1");
  expect(requestHeaders?.["content-type"]).toBe("application/json");
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
        model: { provider: "test", id: "test-model" },
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
      { model: { provider: "test", id: "test" }, messages: [{ role: "user", content: "hi" }] },
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
    model: { provider: "openai-compatible", id: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "hello" },
    ],
  };
  const events = await collect(stream(request, {}));

  const text = textDelta(events);
  expect(text).toBe("Just plain text without JSON.");
});
