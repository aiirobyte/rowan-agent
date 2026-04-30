import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import { fakeStream } from "../src/stream";
import { createDemoTools } from "../src/tools";
import type { StreamFn } from "../src/types";

test("Agent.prompt returns an outcome and emits events", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "fake", name: "fake-v0" },
    stream: fakeStream,
    tools: createDemoTools(),
  });
  const events: string[] = [];
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const outcome = await agent.prompt("use echo tool");

  expect(outcome.passed).toBe(true);
  expect(agent.state.isRunning).toBe(false);
  expect(agent.state.session?.messages.length).toBeGreaterThan(0);
  expect(agent.state.session?.log.length).toBeGreaterThan(0);
  expect(events).toContain("outcome");
});

test("Agent rejects concurrent runs", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "fake", name: "fake-v0" },
    stream: fakeStream,
    tools: createDemoTools(),
  });

  const first = agent.prompt("use echo tool");
  await expect(agent.prompt("hello")).rejects.toThrow("Agent is already running.");
  await first;
});

test("Agent.abort stops an active run", async () => {
  const hangingStream: StreamFn = async function* hangingStream(_model, _context, options) {
    yield { type: "text_delta", text: "working" };
    await new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
    yield { type: "done" };
  };
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "fake", name: "fake-v0" },
    stream: hangingStream,
    tools: createDemoTools(),
  });

  const run = agent.prompt("hello");
  await new Promise((resolve) => setTimeout(resolve, 1));
  agent.abort();

  await expect(run).rejects.toThrow("aborted");
  expect(agent.state.isRunning).toBe(false);
});
