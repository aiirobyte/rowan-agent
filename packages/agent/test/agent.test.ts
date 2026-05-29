import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import type { AgentEventListener, StreamFn } from "../src/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { createEchoTools } from "./support/echo-tool";
import { buildTestPartial, scriptedStream } from "./support/scripted-stream";

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
  expect(agent.state.sessionId).toEqual(expect.stringMatching(/^ses_/));
  expect(agent.state.context.messages.length).toBeGreaterThan(0);
  expect(agent.state.context.messages[0]?.content).toBe("use echo tool");
  expect(events).toContain("tool_execution_start");
  expect(events).toContain("tool_execution_end");
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
  const hangingStream: StreamFn = async function* hangingStream(_request, options) {
    yield { type: "text_delta", text: "working", partial: buildTestPartial("working") };
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
