import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import type { AgentEventListener, StreamFn } from "../src/types";
import { createEchoTools } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

test("Agent.prompt returns an outcome and emits events", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: createEchoTools(),
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
  expect(agent.state.session?.input).toBe("use echo tool");
  expect(events).toContain("outcome");
  expect(events).toContain("thread_created");
  expect(events).toContain("thread_end");
});

test("Agent.prompt does not wait for async trace listeners", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: createEchoTools(),
  });
  let release: (() => void) | undefined;
  let blocked = false;
  const slowListener: AgentEventListener = (() => {
    if (blocked) {
      return;
    }
    blocked = true;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  }) as AgentEventListener;
  agent.subscribe(slowListener);

  const outcome = await agent.prompt("hello");

  expect(outcome.passed).toBe(true);
  expect(blocked).toBe(true);
  release?.();
  await agent.flushTrace();
});

test("Agent rejects concurrent runs", async () => {
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: createEchoTools(),
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
    model: { provider: "test", name: "scripted" },
    stream: hangingStream,
    tools: createEchoTools(),
  });

  const run = agent.prompt("hello");
  await new Promise((resolve) => setTimeout(resolve, 1));
  agent.abort();

  await expect(run).rejects.toThrow("aborted");
  expect(agent.state.isRunning).toBe(false);
});
