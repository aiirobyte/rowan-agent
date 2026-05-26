import { expect, test } from "bun:test";
import {
  callOpenAICompatibleChatCompletion,
  createOpenAICompatibleStream,
  OpenAICompatibleError,
  type OpenAICompatibleFetch,
  resolveOpenAICompatibleConfig,
} from "../src/openai-compatible";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

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

test("resolveOpenAICompatibleConfig uses flags over env and defaults base URL", () => {
  const config = resolveOpenAICompatibleConfig({
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

test("resolveOpenAICompatibleConfig reports missing API key", () => {
  expect(() =>
    resolveOpenAICompatibleConfig({
      model: "test-model",
      env: {},
    }),
  ).toThrow("Missing API key");
});

test("callOpenAICompatibleChatCompletion posts chat completions request", async () => {
  const fetchMock: OpenAICompatibleFetch = async (url, init) => {
    expect(String(url)).toBe("https://api.example/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    return jsonResponse("{\"ok\":true}");
  };

  const result = await callOpenAICompatibleChatCompletion(
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

test("callOpenAICompatibleChatCompletion returns provider token usage", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse("{\"ok\":true}", {
      prompt_tokens: 12,
      completion_tokens: 5,
      total_tokens: 17,
    });

  const result = await callOpenAICompatibleChatCompletion(
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

test("callOpenAICompatibleChatCompletion normalizes HTTP errors", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "content-type": "application/json" },
    });

  try {
    await callOpenAICompatibleChatCompletion(
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
    expect(error).toBeInstanceOf(OpenAICompatibleError);
    expect((error as OpenAICompatibleError).code).toBe("http_error");
    expect((error as OpenAICompatibleError).message).toBe(
      "OpenAI-compatible request failed with status 429 Too Many Requests: rate limited",
    );
    expect((error as OpenAICompatibleError).status).toBe(429);
    expect((error as OpenAICompatibleError).retryable).toBe(true);
    expect((error as OpenAICompatibleError).details).toMatchObject({
      endpoint: "https://api.example/v1/chat/completions",
      model: "test-model",
      status: 429,
      statusText: "Too Many Requests",
      providerError: { message: "rate limited" },
      body: { error: "rate limited" },
    });
  }
});

test("callOpenAICompatibleChatCompletion retries retryable request failures", async () => {
  let attempts = 0;
  const fetchMock: OpenAICompatibleFetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Unable to connect. Is the computer able to access the url?");
    }
    return jsonResponse("{\"ok\":true}");
  };

  const result = await callOpenAICompatibleChatCompletion(
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

test("callOpenAICompatibleChatCompletion can disable retries", async () => {
  let attempts = 0;
  const fetchMock: OpenAICompatibleFetch = async () => {
    attempts += 1;
    throw new Error("Unable to connect. Is the computer able to access the url?");
  };

  await expect(
    callOpenAICompatibleChatCompletion(
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

test("callOpenAICompatibleChatCompletion exposes nested provider error details", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Invalid value for response_format.",
          type: "invalid_request_error",
          code: "invalid_response_format",
          param: "response_format",
        },
      }),
      {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      },
    );

  try {
    await callOpenAICompatibleChatCompletion(
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
    expect(error).toBeInstanceOf(OpenAICompatibleError);
    expect((error as OpenAICompatibleError).message).toBe(
      "OpenAI-compatible request failed with status 400 Bad Request: Invalid value for response_format.",
    );
    expect((error as OpenAICompatibleError).retryable).toBe(false);
    expect((error as OpenAICompatibleError).details?.providerError).toEqual({
      message: "Invalid value for response_format.",
      type: "invalid_request_error",
      code: "invalid_response_format",
      param: "response_format",
    });
  }
});

test("callOpenAICompatibleChatCompletion supports abort signal", async () => {
  const controller = new AbortController();
  const fetchMock: OpenAICompatibleFetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("fetch aborted")), {
        once: true,
      });
    });

  const promise = callOpenAICompatibleChatCompletion(
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

test("createOpenAICompatibleStream yields raw events for JSON response", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Hello directly.",
        route: "direct",
      }),
      { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [echoToolDefinition],
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "Phase: chat\n\nCurrent user request:\n\"hello\"" },
    ],
  };
  const events = await collect(stream(request, {}));

  const modelRequested = events.find((e) => e.type === "model_requested");
  expect(modelRequested?.type).toBe("model_requested");
  if (modelRequested?.type === "model_requested") {
    expect(modelRequested.usage.inputMessages).toBe(2);
    expect(modelRequested.usage.inputTokens).toBe(10);
    expect(modelRequested.usage.outputTokens).toBe(5);
    expect(modelRequested.usage.totalTokens).toBe(15);
  }

  const text = textDelta(events);
  expect(text).toBe("{\"message\":\"Hello directly.\",\"route\":\"direct\"}");

  expect(events[events.length - 1]).toMatchObject({ type: "done" });
});

test("createOpenAICompatibleStream accepts provider-neutral llm request input", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock: OpenAICompatibleFetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse(
      JSON.stringify({
        message: "Hello directly.",
        route: "direct",
      }),
    );
  };
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "configured-model",
    fetch: fetchMock,
  });

  const events = await collect(
    stream(
      {
        model: { provider: "test-provider", name: "requested-model" },
        system: "Test system",
        messages: [
          { role: "user", content: "hello" },
        ],
        tools: [{ name: "echo", description: "Echoes input.", parameters: {} }],
      },
      {},
    ),
  );

  expect(requestBody?.messages).toEqual([
    { role: "system", content: "Test system" },
    { role: "user", content: "hello" },
  ]);
  const modelRequested = events.find((event) => event.type === "model_requested");
  expect(modelRequested).toMatchObject({
    type: "model_requested",
    model: { provider: "test-provider", name: "requested-model" },
    usage: { inputMessages: 2 },
  });
});

test("createOpenAICompatibleStream yields text_delta with raw content for task response", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Planning echo.",
        task: {
          title: "Use echo",
          instruction: "use echo tool",
          acceptanceCriteria: ["Echo evidence is present."],
          toolNames: ["echo"],
          skillIds: [],
        },
      }),
      { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [echoToolDefinition],
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "Phase: plan\n\nCurrent user request:\n\"use echo tool\"" },
    ],
  };
  const events = await collect(stream(request, {}));

  const modelRequested = events.find((e) => e.type === "model_requested");
  expect(modelRequested?.type).toBe("model_requested");
  if (modelRequested?.type === "model_requested") {
    expect(modelRequested.usage).toMatchObject({
      inputMessages: 2,
      inputTokens: 30,
      outputTokens: 20,
      totalTokens: 50,
    });
  }

  const text = textDelta(events);
  expect(text).toContain("Planning echo.");
  expect(text).toContain('"task"');
});

test("createOpenAICompatibleStream yields text_delta with raw content for tool calls", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Calling echo.",
        toolCalls: [{ name: "echo", args: { message: "hello" } }],
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [echoToolDefinition],
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "Phase: execute\n\nTask:\n{\"instruction\":\"use echo tool\"}" },
    ],
  };
  const events = await collect(stream(request, {}));

  const text = textDelta(events);
  expect(text).toContain('"toolCalls"');
  expect(text).toContain('"echo"');
});

test("createOpenAICompatibleStream yields text_delta with raw content for verification result", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        passed: true,
        message: "Looks good.",
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "Phase: verify\n\nTask:\n{\"instruction\":\"use echo tool\"}" },
    ],
  };
  const events = await collect(stream(request, {}));

  const text = textDelta(events);
  expect(text).toContain('"passed"');
  expect(text).toContain('"message"');
});

test("createOpenAICompatibleStream yields raw JSON without normalization", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        RoutingDecision: {
          Message: "Hello directly.",
          Route: "direct",
        },
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const request: LlmRequest = {
    model: { provider: "openai-compatible", name: "test-model" },
    system: "Test system",
    messages: [
      { role: "user", content: "Phase: chat\n\nCurrent user request:\n\"hello\"" },
    ],
  };
  const events = await collect(stream(request, {}));

  // Engine yields raw text without extracting or normalizing JSON
  const text = textDelta(events);
  expect(text).toContain("RoutingDecision");
});

test("createOpenAICompatibleStream yields text_delta for non-JSON text", async () => {
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse("Just plain text without JSON.");
  const stream = createOpenAICompatibleStream({
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
