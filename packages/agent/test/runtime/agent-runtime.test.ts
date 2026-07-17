import { expect, test } from "bun:test";
import { AgentRuntime, InMemoryRuntimeStateStore } from "../../src/runtime";

test("AgentRuntime allows one process-wide runtime and can restart", async () => {
  const first = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await expect(
    AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() }),
  ).rejects.toThrow("already started");

  await first.stop();

  const second = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await second.stop();
});

test("stopping a Runtime makes its private bindings unavailable", async () => {
  const runtime = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await runtime.stop();
  await expect(runtime.stop()).resolves.toBeUndefined();
});

test("failed Runtime startup releases the process-wide ownership slot", async () => {
  class FailingRecoveryStore extends InMemoryRuntimeStateStore {
    override async recoverLeases(): Promise<import("../../src/runtime/domain").AgentRunRecord[]> {
      throw new Error("recovery failed");
    }
  }

  await expect(AgentRuntime.start({ stateStore: new FailingRecoveryStore() }))
    .rejects.toThrow("recovery failed");
  const runtime = await AgentRuntime.start({ stateStore: new InMemoryRuntimeStateStore() });
  await runtime.stop();
});
