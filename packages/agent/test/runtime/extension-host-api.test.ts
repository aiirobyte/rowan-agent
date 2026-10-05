import { expect, test } from "bun:test";
import type { StreamFn } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryExtensionHost,
  InMemoryStore,
  type ExtensionFactory,
  type LoadedExtension,
  type RunEndEvent,
  type RunStartEvent,
  type ScopeRef,
} from "../../src";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

function simpleAgent(
  runtime: AgentRuntime,
  stream: StreamFn,
  options: NonNullable<Parameters<AgentRuntime["createAgent"]>[1]> = {},
) {
  return createAgentWith(runtime, { identity: "host-test-v1", stream, options });
}

function createSimpleStream(content = "done"): StreamFn {
  return async function* () {
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text: content, partial: { role: "assistant", contentBlocks: [{ type: "text", text: content }] } };
    yield { type: "done", response: stopResponse(content) };
  };
}

function createToolStream(toolName: string, toolArgs: Record<string, unknown> = {}): StreamFn {
  let callCount = 0;
  return async function* () {
    callCount += 1;
    if (callCount === 1) {
      const id = "call-1";
      const args = JSON.stringify(toolArgs);
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: toolName, args }],
      };
      yield { type: "tool_call_start", id, name: toolName, partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: toolName, arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };
}

test("config get scoped to own id and changed fires on scope change", async () => {
  const host = new InMemoryExtensionHost({
    configs: {
      global: {
        "alpha-ext": { setting: "alpha-global", common: 1 },
        "beta-ext": { setting: "beta-global" },
      },
      "team:team-1": {
        "alpha-ext": { teamSetting: "alpha-team", common: 2 },
      },
      "team:team-1/project:proj-1": {
        "alpha-ext": { projectSetting: "alpha-proj", common: 3 },
      },
    },
  });

  let alphaGlobalConfig: unknown;
  let alphaTeamConfig: unknown;
  let alphaProjectConfig: unknown;
  let betaGlobalConfig: unknown;
  const alphaChangedScopes: ScopeRef[] = [];
  const betaChangedScopes: ScopeRef[] = [];

  const alphaExt: LoadedExtension = {
    path: "alpha-ext",
    id: "alpha-ext",
    name: "alpha-ext",
    factory: (api) => {
      api.config.changed((scope) => {
        alphaChangedScopes.push(scope);
      });
      api.hooks.on("run_start", async () => {
        alphaGlobalConfig = await api.config.get();
        alphaTeamConfig = await api.config.get([{ kind: "team", id: "team-1" }]);
        alphaProjectConfig = await api.config.get([
          { kind: "team", id: "team-1" },
          { kind: "project", id: "proj-1" },
        ]);
      });
    },
  };

  const betaExt: LoadedExtension = {
    path: "beta-ext",
    id: "beta-ext",
    name: "beta-ext",
    factory: (api) => {
      api.config.changed((scope) => {
        betaChangedScopes.push(scope);
      });
      api.hooks.on("run_start", async () => {
        betaGlobalConfig = await api.config.get();
      });
    },
  };

  const runtime = await AgentRuntime.init({
    host,
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([alphaExt, betaExt]);
    },
  });

  try {
    const agentId = await simpleAgent(runtime, createSimpleStream());
    const run = await runtime.start(agentId, "test", { idempotencyKey: "run-config-1" });
    await run.wait();

    // Verify alpha extension gets its layered config
    expect(alphaGlobalConfig).toEqual({ setting: "alpha-global", common: 1 });
    expect(alphaTeamConfig).toEqual({
      setting: "alpha-global",
      teamSetting: "alpha-team",
      common: 2,
    });
    expect(alphaProjectConfig).toEqual({
      setting: "alpha-global",
      teamSetting: "alpha-team",
      projectSetting: "alpha-proj",
      common: 3,
    });

    // Verify beta extension gets its own config only
    expect(betaGlobalConfig).toEqual({ setting: "beta-global" });

    // Verify change notification fires ONLY for the changed extension
    host.setConfig("alpha-ext", { newSetting: true }, [{ kind: "team", id: "team-1" }]);
    expect(alphaChangedScopes).toEqual([[{ kind: "team", id: "team-1" }]]);
    expect(betaChangedScopes).toEqual([]);

    host.setConfig("beta-ext", { updatedBeta: true }, []);
    expect(betaChangedScopes).toEqual([[]]);
    expect(alphaChangedScopes).toHaveLength(1);
  } finally {
    await runtime.close();
  }
});

test("run state is isolated per extension and dropped after run end", async () => {
  let ext1SeenByExt2: unknown = "not-checked";
  let ext1PostEndState: unknown = "not-checked";
  let ext1RunEndState: unknown = "not-checked";
  let capturedRunId = "";
  let ext1ApiRef: import("../../src").ExtensionAPI | undefined;

  const ext1: LoadedExtension = {
    path: "ext-1",
    id: "ext-1",
    name: "ext-1",
    factory: (api) => {
      ext1ApiRef = api;
      api.hooks.on("run_start", async (event) => {
        capturedRunId = event.runId;
        await api.state.run(event.runId).set("key1", "val1");
      });
      api.hooks.on("run_end", async (event) => {
        ext1RunEndState = await api.state.run(event.runId).get("key1");
      });
    },
  };

  const ext2: LoadedExtension = {
    path: "ext-2",
    id: "ext-2",
    name: "ext-2",
    factory: (api) => {
      api.hooks.on("run_start", async (event) => {
        ext1SeenByExt2 = await api.state.run(event.runId).get("key1");
        await api.state.run(event.runId).set("key1", "ext2-val");
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([ext1, ext2]);
    },
  });

  try {
    const agentId = await simpleAgent(runtime, createSimpleStream());
    const run = await runtime.start(agentId, "test", { idempotencyKey: "run-state-1" });
    await run.wait();

    // ext2 must not see ext1's run state
    expect(ext1SeenByExt2).toBeUndefined();

    // During run_end, run state was still accessible
    expect(ext1RunEndState).toBe("val1");

    // After run completes, run state is dropped
    ext1PostEndState = await ext1ApiRef?.state.run(capturedRunId).get("key1");
    expect(ext1PostEndState).toBeUndefined();
  } finally {
    await runtime.close();
  }
});

test("agent state persists through the host and is private per extension", async () => {
  let extYSeenCounter: unknown = "not-checked";
  let extXSeenCounterRun2: unknown = "not-checked";

  const extX: LoadedExtension = {
    path: "ext-x",
    id: "ext-x",
    name: "ext-x",
    factory: (api) => {
      api.hooks.on("run_start", async (event) => {
        const current = await api.state.agent(event.agentId).get("counter");
        if (current === undefined) {
          await api.state.agent(event.agentId).set("counter", 100);
        } else {
          extXSeenCounterRun2 = current;
          await api.state.agent(event.agentId).set("counter", (current as number) + 50);
        }
      });
    },
  };

  const extY: LoadedExtension = {
    path: "ext-y",
    id: "ext-y",
    name: "ext-y",
    factory: (api) => {
      api.hooks.on("run_start", async (event) => {
        extYSeenCounter = await api.state.agent(event.agentId).get("counter");
      });
    },
  };

  const host = new InMemoryExtensionHost();
  const runtime = await AgentRuntime.init({
    host,
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extX, extY]);
    },
  });

  try {
    const agentId = await simpleAgent(runtime, createSimpleStream());

    // Run 1: ext-x sets counter to 100, ext-y cannot see it
    const run1 = await runtime.start(agentId, "run-1", { idempotencyKey: "run-agent-state-1" });
    await run1.wait();

    expect(extYSeenCounter).toBeUndefined();
    expect(host.getAgentState("ext-x", agentId, "counter")).toBe(100);
    expect(host.getAgentState("ext-y", agentId, "counter")).toBeUndefined();

    // Run 2: ext-x reads counter 100, updates to 150
    const run2 = await runtime.start(agentId, "run-2", { idempotencyKey: "run-agent-state-2" });
    await run2.wait();

    expect(extXSeenCounterRun2).toBe(100);
    expect(host.getAgentState("ext-x", agentId, "counter")).toBe(150);
  } finally {
    await runtime.close();
  }
});

test("api.state.global() values are read back through a new extension instance on the same host and isolated per extension id", async () => {
  let ext1FirstRunRead: any;
  let ext2FirstRunRead: any;
  let ext1SecondInstanceRead: any;
  let ext2SecondInstanceRead: any;

  const ext1Factory: ExtensionFactory = async (api) => {
    ext1FirstRunRead = await api.state.global().get("registry");
    await api.state.global().set("registry", { endpoint: "https://ext1.example.com", models: ["m1", "m2"] });
  };

  const ext2Factory: ExtensionFactory = async (api) => {
    ext2FirstRunRead = await api.state.global().get("registry");
    await api.state.global().set("registry", { endpoint: "https://ext2.example.com", models: ["m3"] });
  };

  const host = new InMemoryExtensionHost();

  // Instance 1: boot runtime with ext1 and ext2, writing their global state
  const runtime1 = await AgentRuntime.init({
    host,
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([
        { path: "ext-1", id: "ext-1", name: "ext-1", factory: ext1Factory },
        { path: "ext-2", id: "ext-2", name: "ext-2", factory: ext2Factory },
      ]);
    },
  });

  await runtime1.close();

  // Verify host received values under respective extension IDs
  expect(ext1FirstRunRead).toBeUndefined();
  expect(ext2FirstRunRead).toBeUndefined();
  expect(host.getGlobalState("ext-1", "registry")).toEqual({ endpoint: "https://ext1.example.com", models: ["m1", "m2"] });
  expect(host.getGlobalState("ext-2", "registry")).toEqual({ endpoint: "https://ext2.example.com", models: ["m3"] });

  // Instance 2: boot a new runtime instance sharing the same host
  const ext1NewInstance: ExtensionFactory = async (api) => {
    ext1SecondInstanceRead = await api.state.global().get("registry");
  };

  const ext2NewInstance: ExtensionFactory = async (api) => {
    ext2SecondInstanceRead = await api.state.global().get("registry");
    // Verify delete works on global state
    await api.state.global().delete("registry");
  };

  const runtime2 = await AgentRuntime.init({
    host,
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([
        { path: "ext-1", id: "ext-1", name: "ext-1", factory: ext1NewInstance },
        { path: "ext-2", id: "ext-2", name: "ext-2", factory: ext2NewInstance },
      ]);
    },
  });

  await runtime2.close();

  // Values are read back through the new extension instances and isolated per extension id
  expect(ext1SecondInstanceRead).toEqual({ endpoint: "https://ext1.example.com", models: ["m1", "m2"] });
  expect(ext2SecondInstanceRead).toEqual({ endpoint: "https://ext2.example.com", models: ["m3"] });

  // Ext-2 delete did not affect ext-1
  expect(host.getGlobalState("ext-1", "registry")).toEqual({ endpoint: "https://ext1.example.com", models: ["m1", "m2"] });
  expect(host.getGlobalState("ext-2", "registry")).toBeUndefined();
});

test("run_start and run_end fire with specified payloads", async () => {
  let startPayload: RunStartEvent | undefined;
  let endPayload: RunEndEvent | undefined;

  const observerExt: LoadedExtension = {
    path: "observer-ext",
    id: "observer-ext",
    name: "observer-ext",
    factory: (api) => {
      api.hooks.on("run_start", (event) => {
        startPayload = event;
      });
      api.hooks.on("run_end", (event) => {
        endPayload = event;
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([observerExt]);
    },
  });

  try {
    const agentId = await simpleAgent(runtime, createSimpleStream());
    const run = await runtime.start(agentId, "test prompt", {
      idempotencyKey: "run-lifecycle-1",
      metadata: { teamId: "t-1", projectId: "p-1", label: "experiment" },
    });
    await run.wait();

    expect(startPayload).toBeDefined();
    expect(startPayload?.runId).toBe(run.id);
    expect(startPayload?.agentId).toBe(agentId);
    expect(startPayload?.metadata).toMatchObject({ teamId: "t-1", projectId: "p-1", label: "experiment" });
    expect(startPayload?.turn).toEqual({ content: "test prompt" });

    expect(endPayload).toBeDefined();
    expect(endPayload?.runId).toBe(run.id);
    expect(endPayload?.agentId).toBe(agentId);
    expect(endPayload?.outcome).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("run_end fires on cancelled run", async () => {
  let endPayload: RunEndEvent | undefined;

  const observerExt: LoadedExtension = {
    path: "cancel-observer-ext",
    id: "cancel-observer-ext",
    name: "cancel-observer-ext",
    factory: (api) => {
      api.hooks.on("run_end", (event) => {
        endPayload = event;
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([observerExt]);
    },
  });

  try {
    const agentId = await simpleAgent(runtime, createSimpleStream());
    const run = await runtime.start(agentId, "test prompt", { idempotencyKey: "run-cancel-1" });
    await run.cancel("test cancellation");

    expect(endPayload).toBeDefined();
    expect(endPayload?.runId).toBe(run.id);
    expect(endPayload?.agentId).toBe(agentId);
    expect((endPayload?.outcome as { status?: string })?.status).toBe("cancelled");
  } finally {
    await runtime.close();
  }
});

test("tool-call events carry scope and turn", async () => {
  let beforeScope: ScopeRef | undefined;
  let beforeTurn: unknown;
  let afterScope: ScopeRef | undefined;
  let afterTurn: unknown;

  const toolExt: LoadedExtension = {
    path: "tool-ext",
    id: "tool-ext",
    name: "tool-ext",
    factory: (api) => {
      api.tools.register({
        name: "inspect_tool",
        description: "Inspect context tool",
        parameters: { type: "object", properties: { input: { type: "string" } } },
        execute: async () => ({ content: [{ type: "text", text: "inspected" }] }),
      });
      api.hooks.on("before_tool_call", (event) => {
        beforeScope = event.scope;
        beforeTurn = event.turn;
        return { allow: true };
      });
      api.hooks.on("after_tool_call", (event) => {
        afterScope = event.scope;
        afterTurn = event.turn;
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([toolExt]);
    },
  });

  try {
    const stream = createToolStream("inspect_tool", { input: "hello" });
    const agentId = await simpleAgent(runtime, stream);
    const testScope = [
      { kind: "team", id: "team-alpha" },
      { kind: "project", id: "proj-beta" },
    ];
    const run = await runtime.start(agentId, "run input", {
      idempotencyKey: "run-tool-scope-1",
      scope: testScope,
    });
    await run.wait();

    expect(beforeScope).toEqual(testScope);
    expect(beforeTurn).toEqual({ content: "run input" });

    expect(afterScope).toEqual(testScope);
    expect(afterTurn).toEqual({ content: "run input" });
  } finally {
    await runtime.close();
  }
});

test("default in-memory host works when host is omitted", async () => {
  let extSeenHostConfig: unknown;
  let extSeenAgentState: unknown;

  const testExt: LoadedExtension = {
    path: "default-host-ext",
    id: "default-host-ext",
    name: "default-host-ext",
    factory: (api) => {
      api.hooks.on("run_start", async (event) => {
        extSeenHostConfig = await api.config.get();
        await api.state.agent(event.agentId).set("default_key", "default_val");
        extSeenAgentState = await api.state.agent(event.agentId).get("default_key");
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([testExt]);
    },
  });

  try {
    expect(runtime.host).toBeInstanceOf(InMemoryExtensionHost);

    const agentId = await simpleAgent(runtime, createSimpleStream());
    const run = await runtime.start(agentId, "test", { idempotencyKey: "run-default-host-1" });
    await run.wait();

    expect(extSeenHostConfig).toBeNull();
    expect(extSeenAgentState).toBe("default_val");
    expect(runtime.host.getAgentState("default-host-ext", agentId, "default_key")).toBe("default_val");
  } finally {
    await runtime.close();
  }
});

test("throwing extension in run_start and run_end does not stop the run", async () => {
  let toolExecuted = false;

  const faultyExt: LoadedExtension = {
    path: "faulty-ext",
    id: "faulty-ext",
    name: "faulty-ext",
    factory: (api) => {
      api.tools.register({
        name: "resilient_tool",
        description: "A tool that executes even if lifecycle hooks fail",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          toolExecuted = true;
          return { content: [{ type: "text", text: "ok" }] };
        },
      });
      api.hooks.on("run_start", () => {
        throw new Error("Failure in run_start hook");
      });
      api.hooks.on("run_end", () => {
        throw new Error("Failure in run_end hook");
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([faultyExt]);
    },
  });

  try {
    const stream = createToolStream("resilient_tool");
    const agentId = await simpleAgent(runtime, stream);
    const run = await runtime.start(agentId, "test", { idempotencyKey: "run-throwing-1" });
    const result = await run.wait();

    expect(result.type).toBe("completed");
    expect(toolExecuted).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("a before_tool_call handler that throws → the tool is not executed", async () => {
  let toolExecuted = false;

  const gateExt: LoadedExtension = {
    path: "gate-ext",
    id: "gate-ext",
    name: "gate-ext",
    factory: (api) => {
      api.tools.register({
        name: "guarded_tool",
        description: "A tool that must not execute if gate throws",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          toolExecuted = true;
          return { content: [{ type: "text", text: "executed" }] };
        },
      });
      api.hooks.on("before_tool_call", () => {
        throw new Error("Gate rejection error");
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([gateExt]);
    },
  });

  try {
    const stream = createToolStream("guarded_tool");
    const agentId = await simpleAgent(runtime, stream);
    const run = await runtime.start(agentId, "test", { idempotencyKey: "run-gate-throw-1" });
    const result = await run.wait();

    expect(result.type).toBe("completed");
    expect(toolExecuted).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("host reads contributed capabilities via AgentRuntime and receives change notifications", async () => {
  let capturedApi: any = null;
  const runtimeReceived: Array<readonly any[]> = [];

  const remoteToolExt: LoadedExtension = {
    path: "remote-tool-ext",
    id: "remote-tool-ext",
    name: "remote-tool-ext",
    factory: (api) => {
      capturedApi = api;
      api.capabilities.contribute({
        kind: "tool",
        name: "remote_query",
        description: "Execute a remote database query",
      });
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    host: new InMemoryExtensionHost(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([remoteToolExt]);
    },
  });

  const unsubRuntime = runtime.onCapabilitiesChanged((caps) => {
    runtimeReceived.push(caps);
  });

  try {
    // 1. Host-side read outside a Run
    const initialCaps = runtime.listCapabilities();
    expect(initialCaps).toEqual([
      {
        extensionId: "remote-tool-ext",
        kind: "tool",
        name: "remote_query",
        description: "Execute a remote database query",
      },
    ]);

    // 2. Dynamic contribution (e.g. after connecting to a remote server)
    const removeMutationTool = capturedApi.capabilities.contribute({
      kind: "tool",
      name: "remote_mutate",
      description: "Execute a remote database mutation",
    });

    // Check runtime list outside a Run
    const updatedCaps = runtime.listCapabilities();
    expect(updatedCaps).toHaveLength(2);
    expect(updatedCaps.map((c: any) => c.name)).toEqual(["remote_query", "remote_mutate"]);
    expect(runtimeReceived.length).toBeGreaterThanOrEqual(1);
    expect(runtimeReceived[runtimeReceived.length - 1]?.map((c: any) => c.name)).toEqual([
      "remote_query",
      "remote_mutate",
    ]);

    // 3. Dynamic removal of tool
    removeMutationTool();
    expect(runtime.listCapabilities()).toHaveLength(1);
    expect(runtime.listCapabilities()[0]!.name).toBe("remote_query");
    expect(runtimeReceived[runtimeReceived.length - 1]?.map((c: any) => c.name)).toEqual(["remote_query"]);
  } finally {
    // 4. Closing runtime removes all contributions
    await runtime.close();
    expect(runtimeReceived[runtimeReceived.length - 1]).toEqual([]);
    unsubRuntime();
  }
});
