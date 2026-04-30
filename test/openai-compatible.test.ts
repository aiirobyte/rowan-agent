import { expect, test } from "bun:test";
import {
  callOpenAICompatibleChatCompletion,
  createOpenAICompatibleStream,
  OpenAICompatibleError,
  type OpenAICompatibleFetch,
  resolveOpenAICompatibleConfig,
} from "../src/openai-compatible";
import { createDefaultCriteria } from "../src/task";
import { createSession } from "../src/session";
import { echoTool } from "../src/tools";
import type { LlmContext, ModelStreamEvent, Task } from "../src/types";
import { createId } from "../src/types";

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function createTask(): Task {
  return {
    id: createId("task"),
    title: "Echo task",
    instruction: "use echo tool",
    acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
    toolNames: ["echo"],
    skillIds: [],
    status: "pending",
    attempts: 0,
  };
}

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

  const content = await callOpenAICompatibleChatCompletion(
    {
      baseUrl: "https://api.example/v1/",
      apiKey: "test-key",
      model: "test-model",
      fetch: fetchMock,
    },
    [{ role: "user", content: "hello" }],
  );

  expect(content).toBe("{\"ok\":true}");
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
      [{ role: "user", content: "hello" }],
    );
    throw new Error("Expected request to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(OpenAICompatibleError);
    expect((error as OpenAICompatibleError).code).toBe("http_error");
    expect((error as OpenAICompatibleError).status).toBe(429);
    expect((error as OpenAICompatibleError).retryable).toBe(true);
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
    [{ role: "user", content: "hello" }],
    { signal: controller.signal },
  );
  controller.abort(new Error("test abort"));

  await expect(promise).rejects.toThrow("test abort");
});

test("createOpenAICompatibleStream maps plan response to structured task", async () => {
  const session = createSession({ systemPrompt: "Test", userInput: "use echo tool" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        task: {
          title: "Use echo",
          instruction: "use echo tool",
          acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
          toolNames: ["echo"],
          skillIds: [],
        },
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [echoTool],
  });

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", session }, {}),
  );
  const structured = events.find((event) => event.type === "structured_output");

  expect(structured?.type).toBe("structured_output");
  expect((structured as Extract<ModelStreamEvent, { type: "structured_output" }>).value).toMatchObject({
    title: "Use echo",
    status: "pending",
    attempts: 0,
    toolNames: ["echo"],
  });
});

test("createOpenAICompatibleStream maps execute response to text and tool calls", async () => {
  const session = createSession({ systemPrompt: "Test", userInput: "use echo tool" });
  const task = createTask();
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
    tools: [echoTool],
  });

  const context: LlmContext = { phase: "execute", session, task, toolResults: [] };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));

  expect(events.some((event) => event.type === "text_delta")).toBe(true);
  const toolCall = events.find((event) => event.type === "tool_call");
  expect(toolCall?.type).toBe("tool_call");
  expect((toolCall as Extract<ModelStreamEvent, { type: "tool_call" }>).toolCall).toMatchObject({
    name: "echo",
    args: { message: "hello" },
  });
});

test("createOpenAICompatibleStream maps verify response to verification result", async () => {
  const session = createSession({ systemPrompt: "Test", userInput: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        passed: true,
        message: "Looks good.",
        evidence: [],
        failedCriteria: [],
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const context: LlmContext = {
    phase: "verify",
    session,
    task,
    toolResults: [],
    criteria: task.acceptanceCriteria,
  };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));
  const structured = events.find((event) => event.type === "structured_output");

  expect((structured as Extract<ModelStreamEvent, { type: "structured_output" }>).value).toMatchObject({
    passed: true,
    message: "Looks good.",
  });
});

test("createOpenAICompatibleStream reports invalid model schema", async () => {
  const session = createSession({ systemPrompt: "Test", userInput: "hello" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(JSON.stringify({ task: { title: "Missing fields" } }));
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", session }, {})),
  ).rejects.toThrow("expected schema");
});
