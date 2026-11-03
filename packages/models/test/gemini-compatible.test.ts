import { expect, test } from "bun:test";
import { listApiProviders, registerBuiltInApiProviders } from "../src";
import {
  createGeminiCompatibleStream,
  resolveGeminiCompatibleConfig,
} from "../src/providers/gemini-compatible";
import type { ProviderFetch } from "../src/providers/shared";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

function sseResponse(chunks: object[]): Response {
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const collected: LlmStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

test("gemini-compatible maps requests, streams thinking and tools, and replays signatures", async () => {
  const thoughtSignature = "thought-signature";
  const toolSignature = "tool-signature";
  const responses = [
    sseResponse([
      {
        candidates: [{
          content: {
            parts: [{ text: "Plan", thought: true, thoughtSignature }],
          },
        }],
      },
      {
        candidates: [{
          content: {
            parts: [{ text: " more", thought: true }],
          },
        }],
      },
      {
        candidates: [{
          content: {
            parts: [{ text: "Answer" }],
          },
        }],
      },
      {
        candidates: [{
          content: {
            parts: [{
              functionCall: { id: "call_1", name: "read", args: { path: "a.txt" } },
              thoughtSignature: toolSignature,
            }],
          },
        }],
      },
      {
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          cachedContentTokenCount: 20,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 7,
          totalTokenCount: 112,
        },
      },
    ]),
    sseResponse([
      {
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
      },
    ]),
  ];
  const urls: string[] = [];
  const headers: Headers[] = [];
  const bodies: Array<Record<string, any>> = [];
  const fetchMock: ProviderFetch = async (input, init) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    bodies.push(JSON.parse(String(init?.body)) as Record<string, any>);
    return responses.shift()!;
  };
  const stream = createGeminiCompatibleStream({
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: ["fake", "gemini", "key"].join("-"),
    model: "gemini-3-pro-preview",
    thinkingLevel: "high",
    temperature: 0.2,
    maxTokens: 1_024,
    fetch: fetchMock,
  });
  const request: LlmRequest = {
    model: { provider: "google", id: "gemini-3-pro-preview" },
    system: "You are Rowan.",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe this." },
        { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      ],
    }],
    tools: [{
      name: "read",
      description: "Read a file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    }],
    toolChoice: { type: "tool", name: "read" },
    thinkingLevel: "high",
  };

  const events = await collect(stream(request, {}));
  const toolEnd = events.find((event) => event.type === "tool_call_end");
  expect(toolEnd?.type).toBe("tool_call_end");
  if (toolEnd?.type !== "tool_call_end") throw new Error("Expected a streamed tool call.");
  expect(toolEnd.partial.contentBlocks).toEqual([
    { type: "thinking", thinking: "Plan more", signature: thoughtSignature },
    { type: "text", text: "Answer" },
    { type: "tool_call", id: "call_1", name: "read", args: "{\"path\":\"a.txt\"}", signature: toolSignature },
  ]);

  expect(urls[0]).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse",
  );
  expect(headers[0]?.get("x-goog-api-key")).toBe(["fake", "gemini", "key"].join("-"));
  expect(bodies[0]).toMatchObject({
    contents: [{
      role: "user",
      parts: [
        { text: "Describe this." },
        { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
      ],
    }],
    systemInstruction: { parts: [{ text: "You are Rowan." }] },
    tools: [{
      functionDeclarations: [{
        name: "read",
        description: "Read a file.",
        parametersJsonSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      }],
    }],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["read"] },
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1_024,
      thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" },
    },
  });
  expect(events.find((event) => event.type === "done")).toMatchObject({
    type: "done",
    response: {
      content: "Answer",
      thinking: "Plan more",
      stopReason: "tool_use",
      usage: {
        inputTokens: 80,
        outputTokens: 12,
        cacheReadTokens: 20,
        reasoningTokens: 7,
        totalTokens: 112,
      },
    },
  });

  const replay: LlmRequest = {
    model: { provider: "google", id: "gemini-3-pro-preview" },
    messages: [
      { role: "user", content: "Read the file." },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Plan more", signature: thoughtSignature },
          { type: "text", text: "Answer" },
          {
            type: "tool_use",
            id: "call_1",
            name: "read",
            input: { path: "a.txt" },
            signature: toolSignature,
          },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "call_1", content: "file contents" }],
      },
    ],
  };
  await collect(stream(replay, {}));

  expect(bodies[1]).toMatchObject({
    contents: [
      { role: "user", parts: [{ text: "Read the file." }] },
      {
        role: "model",
        parts: [
          { text: "Plan more", thought: true, thoughtSignature },
          { text: "Answer" },
          {
            functionCall: {
              id: "call_1",
              name: "read",
              args: { path: "a.txt" },
            },
            thoughtSignature: toolSignature,
          },
        ],
      },
      {
        role: "user",
        parts: [{
          functionResponse: {
            id: "call_1",
            name: "read",
            response: { output: "file contents" },
          },
        }],
      },
    ],
  });
});

test("gemini-compatible uses the native default base URL and supports keyless mode", () => {
  registerBuiltInApiProviders();
  expect(listApiProviders()).toContain("gemini-compatible");
  const config = resolveGeminiCompatibleConfig({ model: "gemini-2.5-flash", auth: "none" });
  expect(config.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
  expect(config.apiKey).toBeUndefined();
  expect(config.auth).toBe("none");
});
