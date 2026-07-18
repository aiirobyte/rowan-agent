import { expect, test } from "bun:test";
import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  type AgentCreateOptions,
  type ModelConfig,
} from "../../src";
import { InMemorySessionStore } from "../../src/harness/session/store";
import { createTestContext } from "../support/agent-run";

test("AgentOptions creates the default stream from a complete model config", async () => {
  const requests: Array<{ authorization: string | null; model: string }> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = await request.json() as { model: string };
      requests.push({
        authorization: request.headers.get("authorization"),
        model: body.model,
      });
      const response = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Configured response." }, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      return new Response(response, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  const model: ModelConfig = {
    id: "configured-model",
    provider: "configured",
    protocol: "openai-completions",
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    apiKey: "configured-key",
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: createTestContext(),
      model,
    });
    const outcome = await (await agent.send("hello")).result();

    expect(outcome.message).toBe("Configured response.");
    expect(requests).toEqual([{
      authorization: "Bearer configured-key",
      model: "configured-model",
    }]);
  } finally {
    await runtime.stop();
    server.stop(true);
  }
});

test("each Agent binds its default stream to its own model config", async () => {
  const calls = { first: 0, second: 0 };
  const server = (name: keyof typeof calls) => Bun.serve({
    port: 0,
    fetch() {
      calls[name] += 1;
      const response = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: name }, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      return new Response(response, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  });
  const firstServer = server("first");
  const secondServer = server("second");
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });
  const model = (baseUrl: string): ModelConfig => ({
    id: "shared-model",
    provider: "shared-provider",
    protocol: "openai-completions",
    baseUrl,
    apiKey: "configured-key",
  });

  try {
    const first = await runtime.createAgent({
      context: createTestContext(),
      model: model(`http://127.0.0.1:${firstServer.port}/v1`),
    });
    const second = await runtime.createAgent({
      context: createTestContext(),
      model: model(`http://127.0.0.1:${secondServer.port}/v1`),
    });

    expect((await (await first.send("first")).result()).message).toBe("first");
    expect((await (await second.send("second")).result()).message).toBe("second");
    expect(calls).toEqual({ first: 1, second: 1 });
  } finally {
    await runtime.stop();
    firstServer.stop(true);
    secondServer.stop(true);
  }
});

test("AgentRuntime rejects a complete model config combined with a custom stream", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });
  const model: ModelConfig = {
    id: "configured-model",
    provider: "configured",
    protocol: "openai-completions",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKey: "configured-key",
  };
  const invalidOptions = {
    context: createTestContext(),
    model,
    stream: async function* () { yield { type: "done" }; },
  } as unknown as AgentCreateOptions;

  try {
    await expect(runtime.createAgent(invalidOptions))
      .rejects.toThrow("either a complete model config or a custom stream");
  } finally {
    await runtime.stop();
  }
});
