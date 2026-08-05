import { expect, spyOn, test } from "bun:test";
import Type from "typebox";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, type AgentConfig, type ContextCandidate } from "../../src/runtime";
import type { Phase } from "../../src/harness/phases/types";
import { loadExtensionFromFactory } from "../../src/extensions/loader";

test("Runtime resolves Definition names after selected Extension assembly", async () => {
  const extension = {
    ...loadExtensionFromFactory((api) => {
    api.registerTool({
      name: "extension_lookup",
      description: "Extension-provided lookup.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text", text: "extension" }] }),
    });
    }, process.cwd()),
    name: "quality",
  };
  const config = {
    identity: "definition-extension-selection-v1",
    definition: {
      name: "extension-agent",
      description: "Use one selected Extension Tool.",
      prompt: "Use the extension.",
      tools: ["extension_lookup"],
    },
    resources: { tools: [], skills: [] },
    model: { provider: "test", id: "model" },
    stream: async function* (request) {
      expect(request.tools?.map(({ name }) => name).filter((name) => name !== "route"))
        .toEqual(["extension_lookup"]);
      yield {
        type: "text_delta" as const,
        text: "done",
        partial: {
          role: "assistant" as const,
          contentBlocks: [{ type: "text" as const, text: "done" }],
        },
      };
      yield {
        type: "done" as const,
        response: { content: "done", stopReason: "stop" as const },
      };
    },
  } satisfies AgentConfig;

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "definition-extension-selection-agent",
    });
    const run = await runtime.start(agentId, "lookup", {
      idempotencyKey: "definition-extension-selection-run",
    });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
  } finally {
    await runtime.close();
  }
});

test("Runtime resolves Definition resource names and warns for missing candidates", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    expect(request.system).toContain("Review only the selected resources.");
    expect(request.tools?.map(({ name }) => name)).toEqual(["keep"]);
    yield { type: "done" };
  };
  const tool = (name: string) => ({
    name,
    description: `${name} tool`,
    parameters: Type.Object({}),
    execute: async () => ({ ok: true as const, content: null }),
  });
  const config = {
    identity: "definition-resource-selection-v1",
    definition: {
      name: "reviewer",
      description: "Review the current change.",
      prompt: "Review only the selected resources.",
      tools: ["keep", "missing"],
      skills: [],
    },
    resources: {
      tools: [tool("keep"), tool("drop")],
      skills: [{
        name: "unused",
        description: "Unused skill",
        content: "Unused",
        filePath: "<test>",
        baseDir: "<test>",
        disableModelInvocation: false,
      }],
    },
    model: { provider: "test", id: "model" },
    stream,
  } satisfies AgentConfig;

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, {
      idempotencyKey: "definition-resource-selection-agent",
    });
    const run = await runtime.start(agentId, "review", {
      idempotencyKey: "definition-resource-selection-run",
    });

    await run.wait();
    expect(modelCalls).toBe(1);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "missing"'))).toBe(true);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Runtime selects structured Context Candidates for the System Prompt", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  const contexts: readonly ContextCandidate[] = [
    { name: "project_context", value: { name: "Example <Project>", enabled: true } },
    { name: "drop_context", value: { secret: "must not appear" } },
  ];
  const config = {
    identity: "definition-context-selection-v1",
    definition: {
      name: "context-agent",
      description: "Use selected structured Context.",
      prompt: "Use the selected context only.",
      contexts: ["project_context", "missing_context"],
    },
    resources: {
      tools: [],
      skills: [],
      contexts,
    },
    model: { provider: "test", id: "model" },
    stream: async function* (request) {
      expect(request.system).toContain("Use the selected context only.");
      expect(request.system).toContain("<agent_context>");
      expect(request.system).toContain('<context name="project_context">');
      expect(request.system).toContain("Example &lt;Project&gt;");
      expect(request.system).not.toContain("drop_context");
      expect(request.system).not.toContain("must not appear");
      yield {
        type: "text_delta" as const,
        text: "done",
        partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text: "done" }] },
      };
      yield { type: "done" as const, response: { content: "done", stopReason: "stop" as const } };
    },
  } satisfies AgentConfig;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "definition-context-selection-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "definition-context-selection-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Context "missing_context"'))).toBe(true);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Phase restrictions use the shared warning-aware resolver", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  let visibleTools: string[] = [];
  const phase: Phase = {
    name: "review",
    description: "Review the change.",
    content: "Review.",
    filePath: "<test>",
    baseDir: "<test>",
    tools: ["keep", "phase-missing"],
    skills: [],
    run: async (context) => {
      visibleTools = context.tools.map(({ name }) => name).filter((name) => name !== "route");
      return { message: "done", route: "stop" };
    },
  };
  const config = {
    identity: "phase-resource-selection-v1",
    definition: {
      name: "reviewer",
      description: "Review the current change.",
      prompt: "Review.",
      phases: { entryPhaseId: "review", phaseIds: ["review"] },
    },
    resources: {
      tools: [
        { name: "keep", description: "Keep", parameters: Type.Object({}), execute: async () => ({ ok: true as const, content: null }) },
        { name: "drop", description: "Drop", parameters: Type.Object({}), execute: async () => ({ ok: true as const, content: null }) },
      ],
      skills: [],
      phases: { phases: new Map([[phase.name, phase]]), entryPhaseId: null },
    },
    model: { provider: "test", id: "model" },
    stream: async function* () {
      yield {
        type: "text_delta" as const,
        text: "done",
        partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text: "done" }] },
      };
      yield { type: "done" as const, response: { content: "done", stopReason: "stop" as const } };
    },
  } satisfies AgentConfig;

  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "phase-resource-selection-agent" });
    const run = await runtime.start(agentId, "review", { idempotencyKey: "phase-resource-selection-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(visibleTools).toEqual(["keep"]);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "phase-missing"'))).toBe(true);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Definition may explicitly select Rowan's built-in default Phase", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  const config = {
    identity: "built-in-default-entry-v1",
    definition: {
      name: "default-agent",
      description: "Use Rowan's default Phase.",
      prompt: "Respond normally.",
      phases: { entryPhaseId: "default", phaseIds: [] },
    },
    resources: { tools: [], skills: [] },
    model: { provider: "test", id: "model" },
    stream: async function* () {
      yield {
        type: "text_delta" as const,
        text: "done",
        partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text: "done" }] },
      };
      yield { type: "done" as const, response: { content: "done", stopReason: "stop" as const } };
    },
  } satisfies AgentConfig;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "built-in-default-entry-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "built-in-default-entry-run" });
    await run.wait();
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Phase entry "default" is not available'))).toBe(false);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Runtime warns and falls back when selected resources and entry Phase names are missing", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  let modelCalls = 0;
  const config = {
    identity: "definition-missing-selection-v1",
    definition: {
      name: "fallback-agent",
      description: "Fall back after missing references.",
      prompt: "Use Rowan's default Phase.",
      tools: ["missing-tool"],
      phases: { entryPhaseId: "missing-entry", phaseIds: [] },
    },
    resources: { tools: [], skills: [] },
    model: { provider: "test", id: "model" },
    stream: async function* () {
      modelCalls += 1;
      yield {
        type: "text_delta" as const,
        text: "done",
        partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text: "done" }] },
      };
      yield { type: "done" as const, response: { content: "done", stopReason: "stop" as const } };
    },
  } satisfies AgentConfig;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "definition-missing-selection-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "definition-missing-selection-run" });
    await run.wait();
    expect(modelCalls).toBe(1);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "missing-tool"'))).toBe(true);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Phase entry "missing-entry"'))).toBe(true);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Runtime rejects duplicate executable Tool candidates before model work", async () => {
  let modelCalls = 0;
  const duplicate = (description: string) => ({
    name: "duplicate",
    description,
    parameters: Type.Object({}),
    execute: async () => ({ ok: true as const, content: null }),
  });
  const config = {
    identity: "definition-duplicate-tool-v1",
    definition: {
      name: "duplicate-tool-agent",
      description: "Reject ambiguous Tools.",
      prompt: "Do not invoke the model.",
    },
    resources: {
      tools: [duplicate("First"), duplicate("Second")],
      skills: [],
    },
    model: { provider: "test", id: "model" },
    stream: async function* () {
      modelCalls += 1;
      yield { type: "done" as const };
    },
  } satisfies AgentConfig;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "definition-duplicate-tool-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "definition-duplicate-tool-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: {
        code: "execution_failed",
        message: 'Duplicate Tool candidate "duplicate".',
      },
    });
    expect(modelCalls).toBe(0);
  } finally {
    await runtime.close();
  }
});

test("Runtime rejects a Phase name contributed by both the host and an Extension", async () => {
  let modelCalls = 0;
  const phase: Phase = {
    name: "review",
    description: "Host review Phase.",
    content: "Review.",
    filePath: "<test>",
    baseDir: "<test>",
  };
  const extension = {
    ...loadExtensionFromFactory((api) => {
      api.registerPhase({
        name: "review",
        description: "Extension review Phase.",
        run: async () => ({ message: "done", route: "stop" }),
      });
    }, process.cwd()),
    name: "duplicate-phase",
  };
  const config = {
    identity: "definition-duplicate-phase-v1",
    definition: {
      name: "duplicate-phase-agent",
      description: "Reject ambiguous Phases.",
      prompt: "Do not invoke the model.",
    },
    resources: {
      tools: [],
      skills: [],
      phases: { phases: new Map([[phase.name, phase]]), entryPhaseId: null },
    },
    model: { provider: "test", id: "model" },
    stream: async function* () {
      modelCalls += 1;
      yield { type: "done" as const };
    },
  } satisfies AgentConfig;
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await runtime.createAgent(config, { idempotencyKey: "definition-duplicate-phase-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "definition-duplicate-phase-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: {
        code: "execution_failed",
        message: 'Extension Phase collides with Context Phase "review"',
      },
    });
    expect(modelCalls).toBe(0);
  } finally {
    await runtime.close();
  }
});

test("an Input Request continuation remains pinned after the Agent Configuration changes", async () => {
  const phase: Phase = {
    name: "question",
    description: "Ask one question.",
    content: "Ask one question.",
    filePath: "<test>",
    baseDir: "<test>",
  };
  const observedSystems: string[] = [];
  const stream: StreamFn = async function* (request) {
    observedSystems.push(request.system ?? "");
    const text = "Which target?";
    yield {
      type: "text_delta" as const,
      text,
      partial: { role: "assistant" as const, contentBlocks: [{ type: "text" as const, text }] },
    };
    yield { type: "done" as const, response: { content: text, stopReason: "stop" as const } };
  };
  const config = (revision: string) => ({
    identity: `definition-snapshot-${revision}`,
    definition: {
      name: "snapshot-agent",
      description: "Keep a Run on one snapshot.",
      prompt: `configuration-${revision}`,
      contexts: ["revision_context"],
      phases: { entryPhaseId: "question", phaseIds: ["question"] },
    },
    resources: {
      tools: [],
      skills: [],
      contexts: [{ name: "revision_context", value: { revision } }],
      phases: { phases: new Map([[phase.name, phase]]), entryPhaseId: null },
    },
    model: { provider: "test", id: "model" },
    stream,
  }) satisfies AgentConfig;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await runtime.createAgent(config("v1"), { idempotencyKey: "definition-snapshot-agent" });
    const run = await runtime.start(agentId, "hello", { idempotencyKey: "definition-snapshot-run" });
    const first = await run.wait();
    expect(first.type).toBe("input_required");
    if (first.type !== "input_required") return;

    await runtime.updateAgentConfig(agentId, config("v2"), {
      idempotencyKey: "definition-snapshot-update",
    });
    await run.respond({ requestId: first.requestId, input: "production" });
    await run.wait();

    expect(observedSystems).toEqual([
      expect.stringMatching(/configuration-v1[\s\S]*<revision>v1<\/revision>/),
      expect.stringMatching(/configuration-v1[\s\S]*<revision>v1<\/revision>/),
    ]);
  } finally {
    await runtime.close();
  }
});
