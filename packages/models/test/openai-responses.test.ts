import { expect, test } from "bun:test";
import { createOpenAIResponsesStream } from "../src/providers/openai-responses";
import type {
  LlmRequest,
  LlmStreamEvent,
  LlmToolCall,
} from "../src/protocol";
import type { ProviderFetch } from "../src/providers/shared";

function sseResponse(events: object[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const collected: LlmStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function completedResponse(): Response {
  return sseResponse([
    {
      type: "response.completed",
      response: {
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]);
}

test("Responses preserves call_id across a streamed tool call and its output", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  let requestNumber = 0;
  const fetchMock: ProviderFetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requestBodies.push(body);
    requestNumber += 1;

    if (requestNumber === 1) {
      return sseResponse([
        {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            type: "function_call",
            id: "fc_123",
            call_id: "call_123",
            name: "echo",
          },
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 0,
          item_id: "fc_123",
          call_id: "call_123",
          delta: '{"message":"hello"}',
        },
        {
          type: "response.function_call_arguments.done",
          output_index: 0,
          item_id: "fc_123",
          call_id: "call_123",
          name: "echo",
          arguments: '{"message":"hello"}',
        },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            type: "function_call",
            id: "fc_123",
            call_id: "call_123",
            name: "echo",
            arguments: '{"message":"hello"}',
          },
        },
        {
          type: "response.completed",
          response: {
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]);
    }

    const input = body.input as Array<{ type?: string; call_id?: string }>;
    const functionCall = input.find((item) => item.type === "function_call");
    const functionCallOutput = input.find((item) => item.type === "function_call_output");
    if (!functionCall?.call_id || functionCall.call_id !== functionCallOutput?.call_id) {
      return new Response(JSON.stringify({
        error: {
          message: `No tool call found for function call output with call_id ${functionCallOutput?.call_id ?? ""}.`,
        },
      }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      });
    }

    return completedResponse();
  };

  const stream = createOpenAIResponsesStream({
    baseUrl: "https://api.example/v1",
    apiKey: "test-key",
    model: "test-model",
    fetch: fetchMock,
  });
  const baseRequest: LlmRequest = {
    model: { provider: "openai", id: "test-model" },
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "echo", description: "Echo input.", parameters: {} }],
  };

  const firstEvents = await collect(stream(baseRequest, {}));
  const done = firstEvents.find((event) => event.type === "done");
  const toolCall: LlmToolCall | undefined = done?.type === "done"
    ? done.response?.toolCalls?.[0]
    : undefined;
  expect(toolCall).toBeDefined();

  const secondEvents = await collect(stream({
    ...baseRequest,
    messages: [
      ...baseRequest.messages,
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          id: toolCall?.id ?? "",
          name: toolCall?.name ?? "",
          input: toolCall?.arguments,
        }],
      },
      {
        role: "tool",
        content: [{
          type: "tool_result",
          toolUseId: toolCall?.id ?? "",
          content: "hello",
        }],
      },
    ],
  }, {}));

  expect(secondEvents.some((event) => event.type === "error")).toBe(false);
  expect(toolCall?.id).toBe("call_123");
  expect(requestBodies[1]?.input).toEqual([
    { role: "user", content: "hello" },
    {
      type: "function_call",
      call_id: "call_123",
      name: "echo",
      arguments: '{"message":"hello"}',
    },
    {
      type: "function_call_output",
      call_id: "call_123",
      output: "hello",
    },
  ]);
});
