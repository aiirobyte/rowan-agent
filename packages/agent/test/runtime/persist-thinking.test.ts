import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import {
  createAnthropicStream,
  createOpenAICompletionsStream,
  createOpenAIResponsesStream,
} from "../../../models/src/providers";
import type { ContentBlock, LlmRequest, StreamFn } from "../../../models/src/protocol";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime";
import type { DurableStore } from "../../src/runtime";
import type { AgentId, AssistantMessage, Message, RunId } from "../../src/runtime-events";
import { createAgentWith } from "../fixtures/configuration";

type Segment =
  | { type: "thinking"; text: string; signature?: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; arguments: string };

type Scenario = {
  segments: Segment[];
  expected: ContentBlock[];
  /** The case asserts a provider thinking signature, which only some providers emit. */
  signed?: boolean;
};

const toolName = "lookup";
const toolArguments = JSON.stringify({ query: "rowan" });
const toolCallId = "lookup-call";
const secondToolCallId = "lookup-call-2";

const lookup = {
  name: toolName,
  description: "Look up a value.",
  parameters: Type.Object({ query: Type.String() }),
  async execute() {
    return { ok: true as const, content: { value: 42 } };
  },
};

const scenarios: Scenario[] = [
  {
    segments: [
      { type: "thinking", text: "First thought." },
      { type: "text", text: "Answer." },
      { type: "tool", id: toolCallId, name: toolName, arguments: toolArguments },
    ],
    expected: [
      { type: "thinking", thinking: "First thought." },
      { type: "text", text: "Answer." },
      { type: "tool_call", id: toolCallId, name: toolName, args: toolArguments },
    ],
  },
  {
    segments: [
      { type: "text", text: "Before. " },
      { type: "thinking", text: "Later thought." },
      { type: "text", text: "After." },
      { type: "tool", id: toolCallId, name: toolName, arguments: toolArguments },
    ],
    expected: [
      { type: "text", text: "Before. " },
      { type: "thinking", thinking: "Later thought." },
      { type: "text", text: "After." },
      { type: "tool_call", id: toolCallId, name: toolName, args: toolArguments },
    ],
  },
  {
    segments: [
      { type: "thinking", text: "Tool reasoning.", signature: "sig-1" },
      { type: "tool", id: toolCallId, name: toolName, arguments: toolArguments },
    ],
    expected: [
      { type: "thinking", thinking: "Tool reasoning.", signature: "sig-1" },
      { type: "tool_call", id: toolCallId, name: toolName, args: toolArguments },
    ],
    signed: true,
  },
  {
    // Two Tool Calls reserve as one batch, the path a Run takes by default.
    segments: [
      { type: "thinking", text: "Both at once." },
      { type: "tool", id: toolCallId, name: toolName, arguments: toolArguments },
      { type: "tool", id: secondToolCallId, name: toolName, arguments: JSON.stringify({ query: "second" }) },
    ],
    expected: [
      { type: "thinking", thinking: "Both at once." },
      { type: "tool_call", id: toolCallId, name: toolName, args: toolArguments },
      { type: "tool_call", id: secondToolCallId, name: toolName, args: JSON.stringify({ query: "second" }) },
    ],
  },
];

const doneText = "Done.";

/** Turn two stops the phase, so the Run reaches a terminal state. */
const stopSegment: Segment = { type: "tool", id: "route-call", name: "route", arguments: JSON.stringify({ decision: [{ phase: "stop" }] }) };

function sseResponse(events: readonly { event?: string; data: object }[]): Response {
  const encoder = new TextEncoder();
  const payload = events.map(({ event, data }) =>
    `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
  ).join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

function openAICompletions(segments: Segment[], final: string): Response {
  let toolIndex = 0;
  const events: Array<{ data: object }> = segments.flatMap((segment): Array<{ data: object }> => {
    if (segment.type === "thinking") {
      return [{ data: { choices: [{ index: 0, delta: { reasoning_content: segment.text }, finish_reason: null }] } }];
    }
    if (segment.type === "text") {
      return [{ data: { choices: [{ index: 0, delta: { content: segment.text }, finish_reason: null }] } }];
    }
    const index = toolIndex++;
    return [
      { data: { choices: [{ index: 0, delta: { tool_calls: [{ index, id: segment.id, type: "function", function: { name: segment.name } }] }, finish_reason: null }] } },
      { data: { choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: segment.arguments } }] }, finish_reason: null }] } },
      { data: { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] } },
    ];
  });
  if (segments.every((segment) => segment.type !== "tool")) {
    events.push(
      { data: { choices: [{ index: 0, delta: { content: final }, finish_reason: null }] } },
      { data: { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
    );
  }
  return sseResponse(events);
}

function openAIResponses(segments: Segment[], final: string): Response {
  const events: Array<{ data: object }> = segments.flatMap((segment, index): Array<{ data: object }> => {
    if (segment.type === "thinking") {
      return [
        { data: { type: "response.output_item.added", output_index: index, item: { type: "reasoning", id: `reason-${index}`, summary: [] } } },
        { data: { type: "response.reasoning_summary_text.delta", output_index: index, summary_index: 0, item_id: `reason-${index}`, delta: segment.text } },
        { data: { type: "response.output_item.done", output_index: index, item: { type: "reasoning", id: `reason-${index}`, summary: [{ type: "summary_text", text: segment.text }] } } },
      ];
    }
    if (segment.type === "text") {
      return [{ data: { type: "response.output_text.delta", output_index: index, content_index: 0, delta: segment.text } }];
    }
    return [
      { data: { type: "response.output_item.added", output_index: index, item: { type: "function_call", id: `fc-${index}`, call_id: segment.id, name: segment.name } } },
      { data: { type: "response.function_call_arguments.delta", output_index: index, item_id: `fc-${index}`, call_id: segment.id, delta: segment.arguments } },
      { data: { type: "response.output_item.done", output_index: index, item: { type: "function_call", id: `fc-${index}`, call_id: segment.id, name: segment.name, arguments: segment.arguments } } },
    ];
  });
  if (segments.every((segment) => segment.type !== "tool")) {
    events.push(
      { data: { type: "response.output_item.added", output_index: 90, item: { type: "message", id: "msg-final", role: "assistant", content: [] } } },
      { data: { type: "response.output_text.delta", output_index: 90, content_index: 0, delta: final } },
      { data: { type: "response.output_item.done", output_index: 90, item: { type: "message", id: "msg-final", role: "assistant", content: [{ type: "output_text", text: final }] } } },
    );
  }
  events.push({ data: { type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 1 } } } });
  return sseResponse(events);
}

function anthropicMessages(segments: Segment[], final: string): Response {
  const events: Array<{ event: string; data: object }> = [
    { event: "message_start", data: { type: "message_start", message: { id: "msg-1", usage: { input_tokens: 1, output_tokens: 0 } } } },
  ];
  const push = (index: number, block: object, deltas: object[]): void => {
    events.push({ event: "content_block_start", data: { type: "content_block_start", index, content_block: block } });
    for (const delta of deltas) {
      events.push({ event: "content_block_delta", data: { type: "content_block_delta", index, delta } });
    }
    events.push({ event: "content_block_stop", data: { type: "content_block_stop", index } });
  };
  segments.forEach((segment, index) => {
    if (segment.type === "thinking") {
      push(index, { type: "thinking" }, [
        { type: "thinking_delta", thinking: segment.text },
        ...(segment.signature ? [{ type: "signature_delta", signature: segment.signature }] : []),
      ]);
    } else if (segment.type === "text") {
      push(index, { type: "text" }, [{ type: "text_delta", text: segment.text }]);
    } else {
      push(index, { type: "tool_use", id: segment.id, name: segment.name }, [{ type: "input_json_delta", partial_json: segment.arguments }]);
    }
  });
  if (segments.every((segment) => segment.type !== "tool")) {
    push(segments.length, { type: "text" }, [{ type: "text_delta", text: final }]);
  }
  events.push(
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } } },
    { event: "message_stop", data: { type: "message_stop" } },
  );
  return sseResponse(events);
}

const adapters: Array<{
  name: string;
  /** Whether the provider can hand back a thinking signature on replay. */
  signatures: boolean;
  /** The signature the provider is expected to attach to the committed thinking block. */
  signature(segment: Extract<Segment, { type: "thinking" }>, index: number): string;
  response(segments: Segment[], final: string): Response;
  stream(response: Response): StreamFn;
}> = [
  {
    name: "openai-completions",
    signatures: false,
    signature: () => "",
    response: openAICompletions,
    stream: (response) => createOpenAICompletionsStream({ baseUrl: "https://provider.test/v1", apiKey: "test", model: "test", fetch: async () => response }),
  },
  {
    name: "openai-responses",
    signatures: true,
    signature: (segment, index) => "openai-reasoning:" + JSON.stringify([{
      type: "reasoning",
      id: `reason-${index}`,
      summary: [{ type: "summary_text", text: segment.text }],
    }]),    response: openAIResponses,
    stream: (response) => createOpenAIResponsesStream({ baseUrl: "https://provider.test/v1", apiKey: "test", model: "test", fetch: async () => response }),
  },
  {
    name: "anthropic-messages",
    signatures: true,
    signature: (segment) => segment.signature ?? "",
    response: anthropicMessages,
    stream: (response) => createAnthropicStream({ baseUrl: "https://provider.test", apiKey: "test", model: "test", fetch: async () => response }),
  },
];

for (const adapter of adapters) {
  for (const [index, scenario] of scenarios.entries()) {
    if (scenario.signed && !adapter.signatures) continue;
    for (const [storeName, openStore] of stores()) {
      test(`durable Run persists ${adapter.name} content blocks in stream order (case ${index}, ${storeName})`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "rowan-persist-thinking-"));
        const filename = join(directory, "runtime.sqlite");
        const requests: LlmRequest[] = [];
        const stream: StreamFn = (request, options) => {
          requests.push(request);
          const segments = requests.length === 1 ? scenario.segments : [stopSegment];
          return adapter.stream(adapter.response(segments, doneText))(request, options);
        };
        let agentId: AgentId | undefined;
        let runId: RunId | undefined;
        try {
          const store = openStore(filename);
          const runtime = await AgentRuntime.init({ store, concurrency: 1 });
          try {
            agentId = await createAgentWith(runtime, {
              identity: `persist-thinking-${adapter.name}-${index}-${storeName}`,
              stream,
              tools: [lookup],
              options: { idempotencyKey: `agent-${adapter.name}-${index}-${storeName}` },
            });
            const run = await runtime.start(agentId, "hello", { idempotencyKey: `run-${adapter.name}-${index}-${storeName}` });
            runId = run.id;
            await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
            const history = await runtime.history(agentId);
            const requestMessage = toolRequestMessage(history, runId);
            expect(requestMessage).toBeDefined();
            const ids = toolCallIdsOf(requestMessage!);
            expect(ids).toHaveLength(scenario.expected.filter((block) => block.type === "tool_call").length);
            for (const id of ids) expect(id).toMatch(/^tool_/);
            const expected = expectedBlocks(adapter, scenario, ids);
            expect(blocksOf(requestMessage!)).toEqual(expected);
            const replay = requests.find((candidate) => candidate.messages.some((message) =>
              Array.isArray(message.content) && message.content.some((part) => part.type === "tool_result")));
            expect(replayedBlocks(replay!, providerIdsOf(scenario))).toEqual(expectedBlocks(adapter, scenario, providerIdsOf(scenario)));
          } finally {
            await runtime.close();
            await closeStore(store);
          }

          if (storeName !== "sqlite") return;
          const reopenedStore = openStore(filename);
          const reopenedRuntime = await AgentRuntime.init({ store: reopenedStore, concurrency: 1 });
          try {
            const message = toolRequestMessage(await reopenedRuntime.history(agentId), runId);
            expect(blocksOf(message!)).toEqual(expectedBlocks(adapter, scenario, toolCallIdsOf(message!)));
          } finally {
            await reopenedRuntime.close();
            await closeStore(reopenedStore);
          }
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });
    }
  }
}

function* stores(): Generator<[string, (filename: string) => DurableStore]> {
  yield ["memory", () => new InMemoryStore()];
  yield ["sqlite", (filename: string) => new SqliteStore(filename)];
}

/** The in-memory Store holds no handle; the file-backed one does. */
async function closeStore(store: DurableStore): Promise<void> {
  await (store as Partial<SqliteStore>).close?.();
}

/** The provider Call identity a scenario emits, which the next request replays. */
function providerIdsOf(scenario: Scenario): string[] {
  return scenario.expected.flatMap((block) => block.type === "tool_call" ? [block.id] : []);
}

/** The durable Tool Call identities the reserved request message carries, in order. */
function toolCallIdsOf(message: AssistantMessage): string[] {
  if (typeof message.content === "string") throw new Error("expected structured assistant content");
  const ids = message.content.filter((part) => part.type === "tool_use").map((part) => part.toolCallId);
  if (ids.length === 0) throw new Error("expected a tool_use part");
  return ids;
}

/** The scenario's blocks with the durable Tool Call identities substituted in. */
function expectedBlocks(adapter: typeof adapters[number], scenario: Scenario, toolCallIds: readonly string[]): unknown[] {
  let call = 0;
  return scenario.expected.map((block) => {
    if (block.type === "tool_call") return { ...block, id: toolCallIds[call++]! };
    if (block.type !== "thinking") return { ...block };
    const index = scenario.segments.findIndex(
      (segment) => segment.type === "thinking" && segment.text === block.thinking,
    );
    const signature = adapter.signature(scenario.segments[index] as Extract<Segment, { type: "thinking" }>, index);
    return signature ? { ...block, signature } : { ...block };
  });
}

/** The assistant message the first Tool result answers. */
function toolRequestMessage(history: readonly Message[], runId: string | undefined): AssistantMessage | undefined {
  const messages = history.filter((message) => message.runId === runId);
  const toolIndex = messages.findIndex((message) => message.role === "tool");
  const before = toolIndex < 0 ? messages : messages.slice(0, toolIndex);
  return [...before].reverse().find((message): message is AssistantMessage => message.role === "assistant");
}

function blocksOf(message: AssistantMessage): unknown[] {
  if (typeof message.content === "string") throw new Error("expected structured assistant content");
  return message.content.map((part) => {
    if (part.type === "tool_use") {
      return { type: "tool_call", id: part.toolCallId, name: part.name, args: JSON.stringify(part.input) };
    }
    return { ...part };
  });
}

/** The blocks the next model request replays, up to and including the last Tool Call. */
function replayedBlocks(request: LlmRequest, toolCallIds: readonly string[]): unknown[] {
  const assistant = request.messages.filter((message) => message.role === "assistant").at(-1);
  if (!assistant || typeof assistant.content === "string") throw new Error("expected a structured assistant request message");
  const parts = assistant.content;
  const last = toolCallIds.at(-1);
  const index = parts.findIndex((part) => part.type === "tool_use" && part.id === last);
  if (index < 0) throw new Error("the Tool Call is missing from the replayed request");
  let call = 0;
  return parts.slice(0, index + 1).map((part) => {
    if (part.type === "tool_use") return { type: "tool_call", id: toolCallIds[call++] ?? part.id, name: part.name, args: JSON.stringify(part.input) };
    return { ...part };
  });
}
