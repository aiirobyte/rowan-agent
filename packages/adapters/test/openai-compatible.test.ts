import { expect, test } from "bun:test";
import Type from "typebox";
import {
  callOpenAICompatibleChatCompletion,
  createOpenAICompatibleStream,
  OpenAICompatibleError,
  type OpenAICompatibleFetch,
  resolveOpenAICompatibleConfig,
} from "../src/openai-compatible";
import {
  createDefaultCriteria,
  type LlmContext,
  type LlmPhase,
  type LlmPhaseOutputMap,
  type ModelStreamEvent,
  type Task,
} from "@rowan-agent/agent";
import { createId, createSession } from "@rowan-agent/agent";
import type { Tool } from "@rowan-agent/agent";
import { echoTool } from "../../agent/test/support/echo-tool";

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

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function phaseOutput<TPhase extends LlmPhase>(
  events: ModelStreamEvent[],
  phase: TPhase,
): LlmPhaseOutputMap[TPhase] | undefined {
  const event = events.find((entry) => entry.type === "phase_output" && entry.phase === phase);
  return event?.type === "phase_output" ? event.output as LlmPhaseOutputMap[TPhase] : undefined;
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

const bashTool: Tool<{ command: string }> = {
  name: "bash",
  description: "Runs a bash command within the workspace.",
  parameters: Type.Object({ command: Type.String() }),
  async execute(args, context) {
    return {
      toolCallId: context.toolCallId,
      toolName: "bash",
      ok: true,
      content: args.command,
    };
  },
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
    [{ role: "user", content: "hello" }],
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
    [{ role: "user", content: "hello" }],
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
      [{ role: "user", content: "hello" }],
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
    [{ role: "user", content: "hello" }],
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
      [{ role: "user", content: "hello" }],
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
      [{ role: "user", content: "hello" }],
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
    [{ role: "user", content: "hello" }],
    { signal: controller.signal },
  );
  controller.abort(new Error("test abort"));

  await expect(promise).rejects.toThrow("test abort");
});

test("createOpenAICompatibleStream maps route response to a task routing decision", async () => {
  const session = createSession({ systemPrompt: "Test", input: "hello" });
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
    tools: [echoTool],
  });

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "route", state: session }, {}),
  );
  const promptMessage = events.find((event) => event.type === "prompt_message");
  const modelCall = events.find((event) => event.type === "model_requested");
  const output = phaseOutput(events, "route");

  expect(promptMessage).toEqual(
    expect.objectContaining({
      type: "prompt_message",
      phase: "route",
      message: expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Phase: route"),
      }),
    }),
  );
  expect(events.findIndex((event) => event.type === "prompt_message")).toBeLessThan(
    events.findIndex((event) => event.type === "model_requested"),
  );
  expect(modelCall?.type).toBe("model_requested");
  expect((modelCall as Extract<ModelStreamEvent, { type: "model_requested" }>).phase).toBe("route");
  expect(events.some((event) => event.type === "text_delta")).toBe(false);
  expect(output).toEqual({
    message: "Hello directly.",
    route: "direct",
    text: "Hello directly.",
  });
});

test("createOpenAICompatibleStream normalizes case-insensitive route keys", async () => {
  const session = createSession({ systemPrompt: "Test", input: "hello" });
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

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "route", state: session }, {}),
  );
  const output = phaseOutput(events, "route");

  expect(output).toEqual({
    message: "Hello directly.",
    route: "direct",
    text: "Hello directly.",
  });
});

test("createOpenAICompatibleStream preserves model route decisions without scheduling policy", async () => {
  const session = createSession({ systemPrompt: "Test", input: "使用bash查看当前日期" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Use bash to check the current date: $(date)",
        route: "direct",
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [bashTool],
  });

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "route", state: session }, {}),
  );
  const output = phaseOutput(events, "route");

  expect(output).toEqual({
    message: "Use bash to check the current date: $(date)",
    route: "direct",
    text: "Use bash to check the current date: $(date)",
  });
});

test("createOpenAICompatibleStream maps plan response to structured task", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Planning echo.",
        task: {
          title: "Use echo",
          instruction: "use echo tool",
          acceptanceCriteria: createDefaultCriteria("Echo evidence is present."),
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
    tools: [echoTool],
  });

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", state: session }, {}),
  );
  const modelCall = events.find((event) => event.type === "model_requested");
  const text = events.find((event) => event.type === "text_delta");
  const output = phaseOutput(events, "plan");

  expect(modelCall?.type).toBe("model_requested");
  expect((modelCall as Extract<ModelStreamEvent, { type: "model_requested" }>).usage).toMatchObject({
    inputMessages: 3,
    inputTokens: 30,
    outputTokens: 20,
    totalTokens: 50,
  });
  expect(text?.type).toBe("text_delta");
  expect(JSON.parse((text as Extract<ModelStreamEvent, { type: "text_delta" }>).text)).toMatchObject({
    message: "Planning echo.",
    task: { title: "Use echo" },
  });
  expect(events.findIndex((event) => event.type === "text_delta")).toBeLessThan(
    events.findIndex((event) => event.type === "phase_output"),
  );
  expect(output?.task).toMatchObject({
    title: "Use echo",
    status: "pending",
    attempts: 0,
    toolNames: ["echo"],
  });
  expect(output?.text).toContain("Planning echo.");
});

test("createOpenAICompatibleStream fills common omitted task fields", async () => {
  const session = createSession({ systemPrompt: "Test", input: "hello" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        task: {
          title: "Say hello",
        },
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  const events = await collect(
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", state: session }, {}),
  );
  const task = phaseOutput(events, "plan")?.task as Task;

  expect(task).toMatchObject({
    title: "Say hello",
    instruction: "hello",
    status: "pending",
    attempts: 0,
    toolNames: [],
    skillIds: [],
  });
  expect(task.acceptanceCriteria).toHaveLength(1);
});

test("createOpenAICompatibleStream normalizes case-insensitive plan keys", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        Task: {
          Title: "Use echo",
          Instruction: "use echo tool",
          AcceptanceCriteria: [{ Description: "Echo evidence is present.", Required: true }],
          ToolNames: ["echo"],
          SkillIds: [],
          Status: "pending",
          Attempts: 0,
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
    stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", state: session }, {}),
  );
  const task = phaseOutput(events, "plan")?.task as Task;

  expect(task).toMatchObject({
    title: "Use echo",
    instruction: "use echo tool",
    status: "pending",
    attempts: 0,
    toolNames: ["echo"],
    skillIds: [],
  });
  expect(task.acceptanceCriteria[0]).toBe("Echo evidence is present.");
});

test("createOpenAICompatibleStream maps execute response to text and tool calls", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
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

  const context: LlmContext = { phase: "execute", state: session, task, toolResults: [] };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));

  const text = events.find((event) => event.type === "text_delta");
  expect(text?.type).toBe("text_delta");
  expect(JSON.parse((text as Extract<ModelStreamEvent, { type: "text_delta" }>).text)).toMatchObject({
    message: "Calling echo.",
    toolCalls: [expect.objectContaining({ name: "echo" })],
  });
  expect(events.findIndex((event) => event.type === "text_delta")).toBeLessThan(
    events.findIndex((event) => event.type === "phase_output"),
  );
  const output = phaseOutput(events, "execute");
  expect(output?.toolCalls[0]).toMatchObject({
    name: "echo",
    args: { message: "hello" },
  });
  expect(output?.text).toContain("Calling echo.");
});

test("createOpenAICompatibleStream normalizes case-insensitive execute keys", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        Message: "Calling echo.",
        ToolCalls: [{ Name: "echo", Args: { message: "hello" } }],
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
    tools: [echoTool],
  });

  const context: LlmContext = { phase: "execute", state: session, task, toolResults: [] };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));
  const output = phaseOutput(events, "execute");

  expect(output?.toolCalls[0]).toMatchObject({
    name: "echo",
    args: { message: "hello" },
  });
});

test("createOpenAICompatibleStream rejects execute outputs without a toolCalls array", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Plan: read more files before deciding.",
        task: {
          title: "Read files",
          instruction: "Read files.",
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

  const context: LlmContext = { phase: "execute", state: session, task, toolResults: [] };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected execute output to include a toolCalls array");
});

test("createOpenAICompatibleStream maps verify response to verification result", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
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

  const context: LlmContext = {
    phase: "verify",
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));
  const text = events.find((event) => event.type === "text_delta");
  const output = phaseOutput(events, "verify");

  expect(text?.type).toBe("text_delta");
  expect(JSON.parse((text as Extract<ModelStreamEvent, { type: "text_delta" }>).text)).toMatchObject({
    passed: true,
    message: "Looks good.",
  });
  expect(events.findIndex((event) => event.type === "text_delta")).toBeLessThan(
    events.findIndex((event) => event.type === "phase_output"),
  );
  expect(output).toMatchObject({
    passed: true,
    message: "Looks good.",
  });
});

test("createOpenAICompatibleStream rejects legacy status verify output", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        status: "passed",
        summary: "Looks good.",
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected verify output to include boolean passed");
});

test("createOpenAICompatibleStream rejects execute-shaped verify output", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "The workspace is a TypeScript project.",
        toolCalls: [],
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected a verify judgement object, received another phase output");
});

test("createOpenAICompatibleStream rejects message-only verify output", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "The workspace is a TypeScript project.",
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected verify output to include boolean passed");
});

test("createOpenAICompatibleStream rejects legacy verify wrappers", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        VerificationResult: {
          Passed: true,
          Message: "No image files found.",
        },
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected verify output to include boolean passed");
});

test("createOpenAICompatibleStream maps failed verify output without criteria details", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        passed: false,
        message: "Not enough evidence.",
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };
  const events = await collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {}));
  const result = phaseOutput(events, "verify");

  expect(result).toMatchObject({
    passed: false,
    message: "Not enough evidence.",
  });
  expect(result).not.toHaveProperty("evidence");
  expect(result).not.toHaveProperty("failedCriteria");
});

test("createOpenAICompatibleStream rejects plan-shaped verify outputs", async () => {
  const session = createSession({ systemPrompt: "Test", input: "use echo tool" });
  const task = createTask();
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        message: "Plan: read key configuration files before deciding.",
        task: {
          title: "Read config",
          instruction: "Read package.json.",
        },
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
    state: session,
    task,
    taskOutput: { kind: "tools", toolResults: [] },
    criteria: task.acceptanceCriteria,
  };

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, context, {})),
  ).rejects.toThrow("Expected a verify judgement object, received another phase output");
});

test("createOpenAICompatibleStream reports invalid model schema", async () => {
  const session = createSession({ systemPrompt: "Test", input: "hello" });
  const fetchMock: OpenAICompatibleFetch = async () =>
    jsonResponse(
      JSON.stringify({
        task: {
          title: "Invalid status",
          status: "done",
        },
      }),
    );
  const stream = createOpenAICompatibleStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });

  await expect(
    collect(stream({ provider: "openai-compatible", name: "test-model" }, { phase: "plan", state: session }, {})),
  ).rejects.toThrow("expected schema");
});
