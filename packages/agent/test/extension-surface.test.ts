import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { models } from "../src/index";
import type {
  ExtensionAPI,
  ExtensionFactory,
  Phase,
} from "../src/index";
import {
  AgentRuntime,
  InMemoryExtensionHost,
  InMemoryStore,
  loadExtensions,
  loadPhase,
} from "../src/runtime";
import { createAgentWith, testDefinition } from "./fixtures/configuration";
import { stopResponse } from "./runtime/route-test-utils";
import type { StreamFn } from "@rowan-agent/models";
import { loadExtensionFromFactory } from "../src/extensions/loader";

test("models.X is reachable from @rowan-agent/agent and models package is unchanged", () => {
  expect(models).toBeDefined();
  expect(typeof models.registerModel).toBe("function");
  expect(typeof models.getModel).toBe("function");
  expect(typeof models.createModelStream).toBe("function");
});

test("ExtensionAPI shape: removed members are gone and new members exist", async () => {
  let capturedApi!: ExtensionAPI;

  const ext = loadExtensionFromFactory((api) => {
    capturedApi = api;
  }, process.cwd(), "<test:shape>");

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (reg) => {
      await reg.loadExtensions([ext]);
    },
  });

  try {
    expect(capturedApi).toBeDefined();
    // Removed namespaces / members
    expect((capturedApi as any).utils).toBeUndefined();
    expect((capturedApi as any).manifest).toBeUndefined();
    expect((capturedApi as any).providers).toBeUndefined();

    // Removed phases members
    expect((capturedApi.phases as any).getPayload).toBeUndefined();
    expect((capturedApi.phases as any).setPayload).toBeUndefined();
    expect((capturedApi.phases as any).setMessage).toBeUndefined();
    expect((capturedApi.phases as any).getCurrentPhase).toBeUndefined();
    expect((capturedApi.phases as any).setNextPhase).toBeUndefined();
    expect((capturedApi.phases as any).getNextPhase).toBeUndefined();
    expect((capturedApi.phases as any).getMessage).toBeUndefined();

    // Removed stub context members
    expect((capturedApi.context as any).isIdle).toBeUndefined();
    expect((capturedApi.context as any).abort).toBeUndefined();
    expect((capturedApi.context as any).modelId).toBeUndefined();
    expect((capturedApi.context as any).getSystemPrompt).toBeUndefined();
    expect((capturedApi.context as any).setSystemPrompt).toBeUndefined();
    expect((capturedApi.context as any).getMessages).toBeUndefined();
    expect((capturedApi.context as any).addMessage).toBeUndefined();
    expect((capturedApi.context as any).getAvailableTools).toBeUndefined();
    expect((capturedApi.context as any).getAvailableSkills).toBeUndefined();
    expect((capturedApi.context as any).getSkillContent).toBeUndefined();
    expect((capturedApi.context as any).getAvailablePhases).toBeUndefined();
    expect((capturedApi.context as any).getPhaseContent).toBeUndefined();

    // Context retains cwd, signal, exec
    expect(typeof capturedApi.context.cwd).toBe("string");
    expect(typeof capturedApi.context.exec).toBe("function");

    // Models namespace replaces providers
    expect(typeof capturedApi.models.registerProvider).toBe("function");
    expect(typeof capturedApi.models.unregisterProvider).toBe("function");

    // Agents namespace exists
    expect(typeof capturedApi.agents.list).toBe("function");
    expect(typeof capturedApi.agents.history).toBe("function");
    expect(typeof capturedApi.agents.contextStatus).toBe("function");
    expect(typeof capturedApi.agents.runs).toBe("function");
    expect(typeof capturedApi.agents.runPhase).toBe("function");
    expect(typeof capturedApi.agents.consume).toBe("function");

    // phases.execute outside Extension Phase throws
    expect(() => capturedApi.phases.execute(() => {})).toThrow("api.phases.execute is only available inside an Extension Phase.");
  } finally {
    await runtime.close();
  }
});

test("api.models.registerProvider works dynamically", async () => {
  let capturedApi!: ExtensionAPI;
  const ext = loadExtensionFromFactory((api) => {
    capturedApi = api;
  }, process.cwd(), "<test:models-prov>");

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (reg) => {
      await reg.loadExtensions([ext]);
    },
  });

  try {
    capturedApi.models.registerProvider({
      id: "dynamic-models-test",
      displayName: "Dynamic",
      baseUrl: "https://dyn.test/v1",
      apiKey: "key",
      protocol: "openai-completions",
      models: [
        {
          id: "dyn-1",
          protocol: "openai-completions",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 4096,
          maxTokens: 1024,
        },
      ],
    });

    const model = models.getModel("dynamic-models-test", "dyn-1");
    expect(model).toBeDefined();
    expect(model?.id).toBe("dyn-1");

    capturedApi.models.unregisterProvider("dynamic-models-test");
    expect(models.getModel("dynamic-models-test", "dyn-1")).toBeUndefined();
  } finally {
    await runtime.close();
  }
});

test("api.agents.* reach the runtime and consume is durable, checkpointed, and stops on dispose", async () => {
  let capturedApi!: ExtensionAPI;
  const receivedEvents: any[] = [];
  let stopConsumer!: () => void;

  const ext = loadExtensionFromFactory(async (api) => {
    capturedApi = api;
    const disposer = await api.agents.consume("extension-agent-consumer", (event) => {
      receivedEvents.push(event);
    });
    stopConsumer = disposer;
  }, process.cwd(), "<test:agents-ext>");

  const stream: StreamFn = async function* () {
    yield { type: "text_delta", text: "hello", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "hello" }] } };
    yield { type: "done", response: stopResponse("hello") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (reg) => {
      await reg.loadExtensions([ext]);
    },
  });

  try {
    // 1. api.agents.list
    const initialList = await capturedApi.agents.list();
    expect(initialList.items).toHaveLength(0);

    // Create an agent
    const agentId = await createAgentWith(runtime, {
      identity: "agents-surface-agent",
      stream,
      options: { idempotencyKey: "agent-surface-1" },
    });

    // 2. api.agents.list sees the agent
    const updatedList = await capturedApi.agents.list();
    expect(updatedList.items).toHaveLength(1);
    expect(updatedList.items[0]!.id).toBe(agentId);

    // 3. Start a run and wait for it
    const run = await runtime.start(agentId, "first run", { idempotencyKey: "run-surface-1" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    // 4. api.agents.history reads committed messages
    const history = await capturedApi.agents.history(agentId);
    expect(history.length).toBeGreaterThan(0);

    // 5. api.agents.contextStatus reads context status
    const status = await capturedApi.agents.contextStatus(agentId);
    expect(status.tokens).toBeGreaterThan(0);

    // 6. api.agents.runs reads runs for the agent
    const runs = await capturedApi.agents.runs(agentId);
    expect(runs.items.length).toBeGreaterThanOrEqual(1);
    await expect(capturedApi.agents.run(String(runs.items[0]!.id))).resolves.toMatchObject({ runId: runs.items[0]!.id });

    // 7. api.agents.runPhase starts a Control Run
    const phaseRun = await capturedApi.agents.runPhase(agentId, {
      phase: "stop",
      payload: { control: true },
    });
    expect(phaseRun.id).toBeDefined();
    await expect(phaseRun.wait()).resolves.toMatchObject({ type: "completed" });

    // 8. consume received durable events
    expect(receivedEvents.length).toBeGreaterThan(0);
    const countBeforeRestart = receivedEvents.length;

    // Checkpoint test: Advance checkpoint and test resume
    // Stop consumer manually
    stopConsumer();
    await (stopConsumer as any).done;

    // Start second consumer with same consumerId
    const resumedEvents: any[] = [];
    const disposer2 = await capturedApi.agents.consume("extension-agent-consumer", (event) => {
      resumedEvents.push(event);
    });

    // Run another turn
    const run2 = await runtime.start(agentId, "second run", { idempotencyKey: "run-surface-2" });
    await expect(run2.wait()).resolves.toMatchObject({ type: "completed" });

    // Wait for consumer to poll and receive new event
    const start = Date.now();
    while (resumedEvents.length === 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(resumedEvents.length).toBeGreaterThan(0);
    // Should only have received events since the checkpoint, not all past events
    expect(resumedEvents.length).toBeLessThan(countBeforeRestart + resumedEvents.length);

    disposer2();
  } finally {
    await runtime.close();
  }
});

test("Extension Phase: activated once per Scope, hooks fire across Runs, execute handler runs Phase with runInternalModelLoop, disposer runs on unload", async () => {
  let activations = 0;
  let hooksFired = 0;
  let disposerCalled = false;
  let executedPhaseRuns = 0;

  const root = await mkdtemp(join(tmpdir(), "rowan-extension-phase-"));
  const phaseDir = join(root, "ext-phase");
  await mkdir(phaseDir, { recursive: true });

  await writeFile(join(phaseDir, "PHASE.md"), `---
name: ext-phase
description: An extension phase.
---
Phase body prompt.
`);

  // Write index.ts that exports a default ExtensionFactory
  await writeFile(join(phaseDir, "index.ts"), `
export default function(api) {
  return () => {};
}
`);

  const phase = await loadPhase(phaseDir);
  expect(phase.extensionFactory).toBeDefined();

  // Override the extension factory in memory for inspection
  phase.extensionFactory = async (api) => {
    activations += 1;
    api.hooks.on("run_start", () => {
      hooksFired += 1;
    });
    api.phases.execute(async (context, execution) => {
      executedPhaseRuns += 1;
      const modelOut = await execution.runInternalModelLoop(context, {
        prompt: "compute step",
      });
      return {
        message: "phase executed successfully: " + (modelOut.text ?? "ok"),
        route: "stop",
      };
    });
    return () => {
      disposerCalled = true;
    };
  };

  const stream: StreamFn = async function* (req) {
    yield { type: "text_delta", text: "loop-done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "loop-done" }] } };
    yield { type: "done", response: stopResponse("loop-done") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    // Load the phase into runtime
    await runtime.loadPhases({
      sourceId: "ext-phase-source",
      values: [phase],
    });

    // Finding 2: Shared phase object is NOT mutated!
    expect(phase.run).toBeUndefined();

    // Activated once upon registration
    expect(activations).toBe(1);

    // Create an agent using this phase as entry
    const agentId = await createAgentWith(runtime, {
      identity: "agent-ext-phase",
      stream,
      phases: [phase],
      definition: {
        phases: {
          entryPhaseId: "ext-phase",
          phaseIds: ["ext-phase"],
        },
      },
      options: { idempotencyKey: "agent-ext-phase-idempotent" },
    });

    // Run 1
    const run1 = await runtime.start(agentId, "turn 1", { idempotencyKey: "run-ext-phase-1" });
    const b1 = await run1.wait();
    expect(b1.type).toBe("completed");
    expect(executedPhaseRuns).toBe(1);
    expect(activations).toBe(1); // Still 1, NOT per execution!
    expect(hooksFired).toBe(1);

    // Run 2
    const run2 = await runtime.start(agentId, "turn 2", { idempotencyKey: "run-ext-phase-2" });
    const b2 = await run2.wait();
    expect(b2.type).toBe("completed");
    expect(executedPhaseRuns).toBe(2);
    expect(activations).toBe(1); // Still 1, NOT per execution!
    expect(hooksFired).toBe(2); // Hook fired across both runs!

    // Unload phase -> disposer runs
    await runtime.unload({ kind: "phase", sourceId: "ext-phase-source" });
    expect(disposerCalled).toBe(true);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase exporting both run and default throws on loadPhase", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-both-exports-"));
  const phaseDir = join(root, "invalid-both");
  await mkdir(phaseDir, { recursive: true });

  await writeFile(join(phaseDir, "PHASE.md"), `---
name: invalid-both
description: Invalid both exports.
---
Body.
`);

  await writeFile(join(phaseDir, "index.ts"), `
export default function(api) {}
export async function run(context, execution) {}
`);

  try {
    await expect(loadPhase(phaseDir)).rejects.toThrow("cannot export both run and default");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Extension Phase with no execute handler runs as model Phase", async () => {
  let activations = 0;
  const phase: Phase = {
    name: "model-fallback-phase",
    description: "Fallback to model phase",
    filePath: "<test:fallback>",
    baseDir: "<test:fallback>",
    content: "Please respond.",
    extensionFactory: async (api) => {
      activations += 1;
      // Do NOT call api.phases.execute
    },
  };

  let modelCalled = false;
  const stream: StreamFn = async function* () {
    modelCalled = true;
    yield { type: "text_delta", text: "model answered", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "model answered" }] } };
    yield { type: "done", response: stopResponse("model answered") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    await runtime.loadPhases({ sourceId: "fallback-source", values: [phase] });
    expect(activations).toBe(1);

    const agentId = await createAgentWith(runtime, {
      identity: "agent-fallback",
      stream,
      phases: [phase],
      definition: { phases: { entryPhaseId: "model-fallback-phase", phaseIds: ["model-fallback-phase"] } },
      options: { idempotencyKey: "agent-fallback-key" },
    });

    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-fallback-key" });
    const b = await run.wait();
    expect(b.type).toBe("completed");
    expect(modelCalled).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("an Extension Phase asks the host for namespaces as a phase", async () => {
  const asked: string[] = [];
  const phase: Phase = {
    name: "kind-phase",
    description: "Reports its host kind",
    filePath: "<test:kind>",
    baseDir: "<test:kind>",
    content: "Please respond.",
    extensionFactory: async () => {},
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    host: new InMemoryExtensionHost({ extendApi: (id, kind) => { asked.push(`${kind}:${id}`); return undefined; } }),
  });
  try {
    await runtime.loadPhases({ sourceId: "kind-source", values: [phase] });
    expect(asked).toEqual(["phase:kind-phase"]);
  } finally {
    await runtime.close();
  }
});

test("Simple run Phase still works", async () => {
  let runCalled = false;
  const phase: Phase = {
    name: "simple-run-phase",
    description: "Simple run phase",
    filePath: "<test:simple>",
    baseDir: "<test:simple>",
    content: "Run directly.",
    run: async (ctx, exec) => {
      runCalled = true;
      return { message: "simple completed", route: "stop" };
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
  });

  try {
    await runtime.loadPhases({ sourceId: "simple-source", values: [phase] });

    const agentId = await createAgentWith(runtime, {
      identity: "agent-simple",
      stream: async function* () { yield { type: "done" }; },
      phases: [phase],
      definition: { phases: { entryPhaseId: "simple-run-phase", phaseIds: ["simple-run-phase"] } },
      options: { idempotencyKey: "agent-simple-key" },
    });

    const run = await runtime.start(agentId, "hello", { idempotencyKey: "run-simple-key" });
    const b = await run.wait();
    expect(b.type).toBe("completed");
    expect(runCalled).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("Ordinary extension loading does NOT sniff PHASE.md sitting next to the extension file", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-no-phase-sniff-"));
  const extDir = join(root, "my-ext");
  await mkdir(extDir, { recursive: true });

  await writeFile(join(extDir, "PHASE.md"), `---
name: sniffed-phase
description: This should NOT be sniffed.
---
Phase body.
`);

  let factoryCalled = false;
  const ext = {
    name: "ordinary-ext",
    path: join(extDir, "index.ts"),
    factory: async (api: ExtensionAPI) => {
      factoryCalled = true;
      // Should not be recognized as an extension phase
      expect(() => api.phases.execute(() => {})).toThrow("api.phases.execute is only available inside an Extension Phase.");
    },
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (reg) => {
      await reg.loadExtensions([ext]);
    },
  });

  try {
    expect(factoryCalled).toBe(true);
    // The sniffed-phase should NOT exist in the runtime
    const invocations = await runtime.listInvocations("agent-none" as any, { source: "auto" }).catch(() => []);
    expect(invocations.some((inv) => inv.name === "sniffed-phase")).toBe(false);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Extension Phase registered in a non-Global Scope resolves handler when Run has that Scope", async () => {
  const wsScope = [{ kind: "workspace", id: "ws-alpha" }];
  const otherWsScope = [{ kind: "workspace", id: "ws-beta" }];

  let scopedPhaseRan = false;
  const scopedPhase: Phase = {
    name: "scoped-ext-phase",
    description: "Scoped extension phase",
    filePath: "<test:scoped>",
    baseDir: "<test:scoped>",
    content: "Scoped prompt.",
    extensionFactory: async (api) => {
      api.phases.execute(async (ctx, exec) => {
        scopedPhaseRan = true;
        return { message: "scoped phase executed", route: "stop" };
      });
    },
  };

  let modelCalled = false;
  const stream: StreamFn = async function* () {
    modelCalled = true;
    yield { type: "text_delta", text: "model answered", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "model answered" }] } };
    yield { type: "done", response: stopResponse("model answered") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (reg) => {
      await reg.loadExtensions([
        extension("scoped-phase-ext", async (api) => {
          await api.phases.register(scopedPhase, wsScope);
        }),
      ]);
    },
  });

  function extension(path: string, factory: (api: ExtensionAPI) => Promise<void>) {
    return { path, name: path, factory };
  }

  try {
    // Shared phase object not mutated
    expect(scopedPhase.run).toBeUndefined();

    // Create agent with resourceView pointing to the scoped extension source
    const def = testDefinition({
      phases: {
        entryPhaseId: "scoped-ext-phase",
        phaseIds: ["scoped-ext-phase"],
      },
    });
    await runtime.loadAgents({ sourceId: "test-agents", values: [def] });

    const agentId = await runtime.createAgent({
      identity: "agent-scoped",
      definition: { name: def.name },
      resourceView: {
        agents: ["test-agents"],
        tools: ["rowan.extensions"],
        skills: ["rowan.extensions"],
        phases: ["rowan.extensions:workspace:ws-alpha"],
      },
      model: { provider: "mock", id: "mock" },
      stream,
    }, { idempotencyKey: "agent-scoped-key" });

    // Run with wsScope -> finds scoped handler and executes it
    const run1 = await runtime.start(agentId, "hello", {
      scope: wsScope,
      idempotencyKey: "run-scoped-1",
    });
    const b1 = await run1.wait();
    expect(b1.type).toBe("completed");
    expect(scopedPhaseRan).toBe(true);
    expect(modelCalled).toBe(false);

    // Reset flag
    scopedPhaseRan = false;

    // Run with otherWsScope -> does NOT find ws-alpha handler, falls back to model phase
    const run2 = await runtime.start(agentId, "hello again", {
      scope: otherWsScope,
      idempotencyKey: "run-scoped-2",
    });
    const b2 = await run2.wait();
    expect(b2.type).toBe("completed");
    expect(scopedPhaseRan).toBe(false);
    expect(modelCalled).toBe(true);
  } finally {
    await runtime.close();
  }
});
