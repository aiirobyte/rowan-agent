import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryRuntimeStateStore } from "../../src/runtime";

test("AgentRuntime allows one process-wide runtime and can restart", async () => {
  const first = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  expect(AgentRuntime.current()).toBe(first);
  await expect(
    AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() }),
  ).rejects.toThrow("already started");

  await first.stop();
  expect(AgentRuntime.current()).toBeUndefined();

  const second = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  expect(AgentRuntime.current()).toBe(second);
  await second.stop();
});

test("stopping a Runtime makes its private bindings unavailable", async () => {
  const runtime = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await runtime.stop();
  await expect(runtime.stop()).resolves.toBeUndefined();
});
