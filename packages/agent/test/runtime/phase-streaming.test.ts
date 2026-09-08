import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, type AgentConfig } from "../../src/runtime";
import type { Phase } from "../../src/harness/phases/types";

function config(stream: StreamFn, phases: { phases: Map<string, Phase>; entryPhaseId: string }): AgentConfig {
  return {
    identity: "phase-streaming-v1",
    model: { provider: "test", id: "model" },
    stream,
    definition: { name: "test", description: "Test Agent.", prompt: "Test" },
    resources: { tools: [], skills: [], phases },
  } as unknown as AgentConfig;
}

test("a programmatic Phase can stream assistant message deltas via execution.messages", async () => {
  const stream: StreamFn = async function* () {
    throw new Error("the model should not be called");
  };

  const phase: Phase = {
    name: "external-agent",
    description: "Simulates an external streaming agent",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Stream external tokens",
    isolated: false,
    run: async (_context, execution) => {
      expect(execution.messages).toBeDefined();
      const messageId = execution.messages.start("assistant", "");
      await execution.messages.update(messageId, "Hello ");
      await execution.messages.update(messageId, "from external agent!");
      await execution.messages.end(messageId);
      return {
        message: "Hello from external agent!",
        route: "stop",
      };
    },
  };

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  const agentId = await runtime.createAgent(
    config(stream, { phases: new Map([[phase.name, phase]]), entryPhaseId: phase.name }),
    { idempotencyKey: "streaming-agent" },
  );

  const deltas: string[] = [];
  const run = await runtime.start(agentId, "start stream", { idempotencyKey: "streaming-run" });

  const observePromise = (async () => {
    for await (const event of run.observe()) {
      if (event.kind === "message_delta") {
        deltas.push(event.text);
      }
    }
  })();

  const outcome = await run.wait();
  await observePromise;

  expect(outcome.type).toBe("completed");
  expect(deltas.join("")).toBe("Hello from external agent!");

  const messages = await runtime.history(agentId);
  const assistantMsg = messages.find((m) => m.role === "assistant");
  expect(assistantMsg?.content).toBe("Hello from external agent!");
});
