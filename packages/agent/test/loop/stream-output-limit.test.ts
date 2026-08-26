import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { invokeModel } from "../../src/loop/stream-collector";
import type { PhaseMessageManager } from "../../src/loop/execution";
import type { AgentConfig } from "../../src/loop/types";

test("model collection rejects an unbounded streamed response before it exhausts memory", async () => {
  const chunk = "x".repeat(16 * 1024);
  const stream: StreamFn = async function* () {
    for (let index = 0; index < 65; index += 1) {
      yield {
        type: "text_delta",
        text: chunk,
        partial: { role: "assistant", contentBlocks: [] },
      };
    }
    yield { type: "done", response: { content: "", stopReason: "stop" } };
  };
  let content = "";
  const message: PhaseMessageManager = {
    visible: () => [],
    reserve: () => "msg_test",
    start: () => "msg_test",
    update: async (_messageId, delta) => { content += delta; },
    replaceContent: () => undefined,
    end: async () => undefined,
    discard: () => undefined,
  };
  const config = {
    model: { provider: "test", id: "model" },
    stream,
    context: { systemPrompt: "Test", messages: [], tools: [], skills: [] },
    execution: { agentId: "agt_test", runId: "run_test", executionId: "exec_test" },
  } as AgentConfig;

  await expect(invokeModel({
    config,
    message,
    request: {
      model: config.model,
      messages: [{ role: "user", content: "hello" }],
    },
    phaseId: "default",
  })).rejects.toMatchObject({
    name: "ModelOutputLimitError",
    code: "model_output_limit",
  });
  expect(content.length).toBe(1024 * 1024);
});

test("model collection persists a thinking-only response", async () => {
  const stream: StreamFn = async function* () {
    yield {
      type: "start",
      partial: { role: "assistant", contentBlocks: [] },
    };
    yield {
      type: "thinking_delta",
      thinking: "Reasoning content",
      partial: {
        role: "assistant",
        contentBlocks: [{ type: "thinking", thinking: "Reasoning content" }],
      },
    };
    yield { type: "done", response: { content: "", thinking: "Reasoning content", stopReason: "max_tokens" } };
  };
  let replaced: unknown;
  const message: PhaseMessageManager = {
    visible: () => [],
    reserve: () => "msg_thinking",
    start: () => "msg_thinking",
    update: async () => undefined,
    replaceContent: (_messageId, content) => { replaced = content; },
    end: async () => undefined,
    discard: () => undefined,
  };
  const config = {
    model: { provider: "test", id: "model" },
    stream,
    context: { systemPrompt: "Test", messages: [], tools: [], skills: [] },
    execution: { agentId: "agt_test", runId: "run_test", executionId: "exec_test" },
  } as AgentConfig;

  const result = await invokeModel({
    config,
    message,
    request: {
      model: config.model,
      messages: [{ role: "user", content: "hello" }],
    },
    phaseId: "default",
  });

  expect(result.contentBlocks).toEqual([{ type: "thinking", thinking: "Reasoning content" }]);
  expect(replaced).toEqual([{ type: "thinking", thinking: "Reasoning content" }]);
});
