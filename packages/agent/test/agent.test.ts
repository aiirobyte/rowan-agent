import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import type { AgentEventListener, AgentRuntimePort, StreamFn } from "../src/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { createEchoTools } from "./support/echo-tool";
import { scriptedStream } from "./support/scripted-stream";

test("Agent.run returns a run result and emits events", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
  });
  const events: string[] = [];
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const outcome = await runAgentTurn(agent, "use echo tool");

  expect(outcome.outcome.passed).toBe(true);
  expect(agent.state.isRunning).toBe(false);
  expect(agent.state.session?.messages.length).toBeGreaterThan(0);
  expect(agent.state.session?.log.length).toBeGreaterThan(0);
  expect(agent.state.session?.input).toBe("use echo tool");
  expect(events).toContain("outcome");
  expect(events).toContain("tool_start");
  expect(events).toContain("tool_end");
  expect(events).not.toContain("thread_created");
});

test("Agent.run assembles runtime context for the first message", async () => {
  const seenContexts: Array<{
    systemPrompt: string;
    messages: string[];
    tools: string[];
  }> = [];
  const runtime: AgentRuntimePort = {
    async beforePhase(context, phase) {
      if (phase !== "route") {
        return;
      }
      seenContexts.push({
        systemPrompt: context.systemPrompt,
        messages: context.messages.map((message) => message.content),
        tools: context.tools.map((tool) => tool.name),
      });
    },
  };
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    runtime,
  });

  await runAgentTurn(agent, "hello");

  expect(seenContexts).toEqual([
    {
      systemPrompt: "Test system",
      messages: ["hello"],
      tools: ["echo"],
    },
  ]);
});

test("Agent.run does not wait for async event listeners", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
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

  const outcome = await runAgentTurn(agent, "hello");

  expect(outcome.outcome.passed).toBe(true);
  expect(blocked).toBe(true);
  release?.();
  await agent.flushEvents();
});

test("Agent rejects concurrent runs", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
  });

  const first = runAgentTurn(agent, "use echo tool");
  await expect(runAgentTurn(agent, "hello")).rejects.toThrow("Agent is already running.");
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
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", name: "scripted" },
    stream: hangingStream,
  });

  const run = runAgentTurn(agent, "hello");
  await new Promise((resolve) => setTimeout(resolve, 1));
  agent.abort();

  await expect(run).rejects.toThrow("aborted");
  expect(agent.state.isRunning).toBe(false);
});
