import { expect, test } from "bun:test";
import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  InMemorySessionStore,
} from "../../src";
import { scriptedStream } from "../support/scripted-stream";

function options() {
  return {
    context: { systemPrompt: "lifecycle", messages: [], tools: [], skills: [] },
    model: { provider: "test", id: "scripted" },
    stream: scriptedStream,
  };
}

test("Session archive blocks new input and unarchive restores it", async () => {
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });
  try {
    const agent = await runtime.createAgent(options());
    await runtime.archiveSession(agent.sessionId);
    expect((await runtime.listSessions())[0]?.state).toBe("archived");
    await expect(agent.send("blocked")).rejects.toThrow(/archived/i);
    await runtime.unarchiveSession(agent.sessionId);
    await (await agent.send("allowed")).result();
    expect((await runtime.listSessions())[0]?.state).toBe("active");
  } finally {
    await runtime.stop();
  }
});

test("Session deletion removes Runtime data and transcript", async () => {
  const provider = new InMemorySessionStore();
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({ stateStore, sessionProvider: provider });
  try {
    const agent = await runtime.createAgent(options());
    await (await agent.send("delete me")).result();
    await runtime.deleteSession(agent.sessionId);
    expect(await provider.open(agent.sessionId)).toBeUndefined();
    expect(await stateStore.getAgent(agent.id)).toBeUndefined();
    await expect(agent.send("stale")).rejects.toThrow(/deleted/i);
  } finally {
    await runtime.stop();
  }
});
