import { expect, spyOn, test } from "bun:test";
import Type from "typebox";
import type { ProviderCallContext, StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import type { Phase } from "../../src/harness/phases/types";
import { createAgentWith, seedResources, configuration } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

const tool = (name: string, core = false) => ({
  name,
  ...(core ? { core: true } : {}),
  description: `${name} tool`,
  parameters: Type.Object({}),
  execute: async () => ({ ok: true as const, content: name }),
});

const skill = (name: string) => ({
  name,
  description: `${name} skill`,
  filePath: `<${name}>`,
  baseDir: `<${name}>`,
  content: `${name} guidance`,
  disableModelInvocation: false,
  disableImplicitInvocation: false,
  disableAutoInvocation: false,
});

const phase = (name: string): Phase => ({
  name,
  description: `${name} phase`,
  content: `${name} instructions`,
  filePath: `<${name}>`,
  baseDir: `<${name}>`,
  skills: [],
});

const coreToolSnippets = {
  read: "Read file contents.",
  bash: "Run shell commands.",
  edit: "Apply exact text replacements.",
  write: "Create or overwrite files.",
} as const;

function requestTools(request: { tools?: readonly { name: string }[] }): string[] {
  return (request.tools ?? []).map(({ name }) => name).filter((name) => name !== "route");
}

test("Tool selection retains Core for omission, empty, positive-only, and negative-only lists", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  const cases = [
    { name: "omitted", tools: undefined, expected: ["read", "bash", "edit", "write", "custom"] },
    { name: "empty", tools: [], expected: ["read", "bash", "edit", "write"] },
    { name: "positive", tools: ["custom"], expected: ["read", "bash", "edit", "write", "custom"] },
    { name: "remove-read", tools: ["-read"], expected: ["bash", "edit", "write", "custom"] },
    { name: "negative", tools: ["-bash"], expected: ["read", "edit", "write", "custom"] },
    { name: "remove-edit", tools: ["-edit"], expected: ["read", "bash", "write", "custom"] },
    { name: "remove-write", tools: ["-write"], expected: ["read", "bash", "edit", "custom"] },
    { name: "mixed", tools: ["custom", "-bash"], expected: ["read", "edit", "write", "custom"] },
    { name: "remove-all", tools: ["-read", "-bash", "-edit", "-write"], expected: ["custom"] },
  ] as const;
  try {
    for (const testCase of cases) {
      let modelTools: string[] = [];
      let providerTools: string[] = [];
      let system = "";
      const stream: StreamFn = async function* (request, context) {
        modelTools = requestTools(request);
        providerTools = (context as ProviderCallContext).tools.list().map(({ name }) => name);
        system = request.system ?? "";
        yield { type: "done", response: stopResponse("done") };
      };
      const agentId = await createAgentWith(runtime, {
        identity: `tool-selection-${testCase.name}`,
        definition: {
          name: `tool-selection-${testCase.name}`,
          description: "Tool selection",
          prompt: "Use tools.",
          ...(testCase.tools === undefined ? {} : { tools: testCase.tools }),
        },
        tools: [tool("custom")],
        stream,
        options: { idempotencyKey: `tool-selection-${testCase.name}-agent` },
      });
      const run = await runtime.start(agentId, "go", {
        idempotencyKey: `tool-selection-${testCase.name}-run`,
      });
      await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
      expect({ case: testCase.name, tools: modelTools }).toEqual({ case: testCase.name, tools: [...testCase.expected] });
      expect({ case: testCase.name, tools: providerTools }).toEqual({ case: testCase.name, tools: [...testCase.expected] });
      for (const [name, snippet] of Object.entries(coreToolSnippets)) {
        expect({
          case: testCase.name,
          visible: system.includes(snippet),
        }).toEqual({
          case: testCase.name,
          visible: (testCase.expected as readonly string[]).includes(name),
        });
      }
    }
  } finally {
    await runtime.close();
  }
});

test("Skill, Context, and Phase selections use the same Core-retaining rule", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const create = async (
      name: string,
      selection: Readonly<{ skills: readonly string[]; contexts: readonly string[]; phaseIds: readonly string[] }>,
    ) => {
      let system = "";
      const stream: StreamFn = async function* (request) {
        system = request.system ?? "";
        yield { type: "done", response: stopResponse("done") };
      };
      const agentId = await createAgentWith(runtime, {
        identity: name,
        definition: {
          name,
          description: name,
          prompt: "Shared selection.",
          skills: selection.skills,
          contexts: selection.contexts,
          phases: { entryPhaseId: null, phaseIds: selection.phaseIds },
        },
        skills: [skill("alpha"), skill("beta")],
        phases: [phase("review")],
        contexts: [
          { name: "project", value: { id: "p" } },
          { name: "secret", value: { id: "s" } },
        ],
        stream,
        options: { idempotencyKey: `${name}-agent` },
      });
      const run = await runtime.start(agentId, "go", { idempotencyKey: `${name}-run` });
      await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
      return {
        system,
        phases: (await runtime.listInvocations(agentId, { source: "external" }))
          .filter((entry) => entry.kind === "phase")
          .map(({ name: phaseName }) => phaseName),
      };
    };

    const empty = await create("shared-empty", { skills: [], contexts: [], phaseIds: [] });
    expect(empty.system).not.toContain("<name>alpha</name>");
    expect(empty.system).not.toContain('<context name="project">');
    expect(empty.phases).toEqual(["default", "stop", "compact"]);

    const positive = await create("shared-positive", {
      skills: ["alpha"],
      contexts: ["project"],
      phaseIds: ["review"],
    });
    expect(positive.system).toContain("<name>alpha</name>");
    expect(positive.system).not.toContain("<name>beta</name>");
    expect(positive.system).toContain('<context name="project">');
    expect(positive.system).not.toContain('<context name="secret">');
    expect(positive.phases).toEqual(["default", "stop", "compact", "review"]);

    const negative = await create("shared-negative", {
      skills: ["-beta"],
      contexts: ["-secret"],
      phaseIds: ["-compact"],
    });
    expect(negative.system).toContain("<name>alpha</name>");
    expect(negative.system).not.toContain("<name>beta</name>");
    expect(negative.system).toContain('<context name="project">');
    expect(negative.system).not.toContain('<context name="secret">');
    expect(negative.phases).toEqual(["default", "stop", "review"]);
  } finally {
    await runtime.close();
  }
});

test("Definition Layer can remove inherited resources but cannot restore or widen", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    let observedTools: string[] = [];
    const stream: StreamFn = async function* (request) {
      observedTools = requestTools(request);
      yield { type: "done", response: stopResponse("done") };
    };
    const definition = {
      name: "layered",
      description: "Layered",
      prompt: "Layered.",
      tools: ["keeper"],
      skills: ["alpha"],
      phases: { entryPhaseId: null, phaseIds: [] },
    };
    const view = await seedResources(runtime, {
      agents: [definition],
      tools: [tool("keeper"), tool("hidden")],
      skills: [skill("alpha"), skill("beta")],
      phases: [phase("review")],
    });
    const agentId = await runtime.createAgent(configuration({
      identity: "layer-removal-v1",
      definition: definition.name,
      view,
      model: { provider: "test", id: "model" },
      stream,
    }), { idempotencyKey: "layer-removal-agent" });
    const baseConfig = configuration({
      identity: "layer-removal-v2",
      definition: definition.name,
      view,
      model: { provider: "test", id: "model" },
      stream,
    });
    const config = {
      ...baseConfig,
      definition: {
        ...baseConfig.definition,
        layer: {
          tools: ["-keeper"],
          skills: ["-alpha"],
          phases: { entryPhaseId: null, phaseIds: ["-compact"] },
        },
      },
    };
    await runtime.updateAgentConfig(agentId, config, { idempotencyKey: "layer-removal-update" });

    const run = await runtime.start(agentId, "go", { idempotencyKey: "layer-removal-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observedTools).toEqual(["read", "bash", "edit", "write"]);
    expect((await runtime.listInvocations(agentId, { source: "external" }))
      .filter((entry) => entry.kind === "phase")
      .map(({ name }) => name)).toEqual(["default", "stop"]);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "hidden"'))).toBe(false);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("Definition Layer cannot restore a Tool removed by its parent", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    let observedTools: string[] = [];
    const stream: StreamFn = async function* (request) {
      observedTools = requestTools(request);
      yield { type: "done", response: stopResponse("done") };
    };
    const definition = {
      name: "parent-removed",
      description: "Parent removed",
      prompt: "Parent removed.",
      tools: ["-keeper"],
    };
    const view = await seedResources(runtime, {
      agents: [definition],
      tools: [tool("keeper")],
    });
    const baseConfig = configuration({
      identity: "parent-removed-v1",
      definition: definition.name,
      view,
      model: { provider: "test", id: "model" },
      stream,
    });
    const agentId = await runtime.createAgent({
      ...baseConfig,
      definition: {
        ...baseConfig.definition,
        layer: { tools: ["keeper"] },
      },
    }, { idempotencyKey: "parent-removed-agent" });

    const run = await runtime.start(agentId, "go", { idempotencyKey: "parent-removed-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(observedTools).toEqual(["read", "bash", "edit", "write"]);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "keeper"'))).toBe(true);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("A Phase can remove Tools but cannot add back an Agent-removed Tool", async () => {
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  let visibleTools: string[] = [];
  const review: Phase = {
    ...phase("review"),
    tools: ["kept", "-bash"],
    run: async (context) => {
      visibleTools = context.tools.map(({ name }) => name).filter((name) => name !== "route");
      return { message: "done", route: "stop" };
    },
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-resource-removal-v1",
      definition: {
        name: "phase-resource-removal",
        description: "Phase removal",
        prompt: "Run.",
        tools: ["-read"],
        phases: { entryPhaseId: "review", phaseIds: ["review"] },
      },
      phases: [review],
      tools: [tool("kept")],
      stream: async function* () {
        yield { type: "done", response: stopResponse("done") };
      },
      options: { idempotencyKey: "phase-resource-removal-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "phase-resource-removal-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(visibleTools).toEqual(["edit", "write", "kept"]);
    expect(warnings.mock.calls.some(([message]) =>
      String(message).includes('Tool "read"'))).toBe(false);
  } finally {
    warnings.mockRestore();
    await runtime.close();
  }
});

test("removing a same-name Core Tool replacement never restores the built-in or executes the replacement", async () => {
  let replacementCalls = 0;
  let firstRequestTools: string[] = [];
  let firstSystemPrompt = "";
  let secondRequestMessages = "";
  let turn = 0;
  const stream: StreamFn = async function* (request) {
    turn += 1;
    if (turn === 1) {
      firstRequestTools = requestTools(request);
      firstSystemPrompt = request.system ?? "";
      yield {
        type: "done" as const,
        response: {
          content: "",
          toolCalls: [{ id: "edit-call", name: "edit", arguments: "{}" }],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    secondRequestMessages = JSON.stringify(request.messages);
    yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "removed-core-replacement",
      definition: {
        name: "removed-core-replacement",
        description: "Removed replacement",
        prompt: "Run.",
        tools: ["-edit"],
      },
      tools: [{
        ...tool("edit"),
        description: "Host edit replacement",
        execute: async () => {
          replacementCalls += 1;
          return { ok: true as const, content: "replacement" };
        },
      }],
      stream,
      options: { idempotencyKey: "removed-core-replacement-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "removed-core-replacement-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(firstRequestTools).not.toContain("edit");
    expect(firstSystemPrompt).not.toContain("Apply exact text replacements");
    expect(firstSystemPrompt).not.toContain("Host edit replacement");
    expect(replacementCalls).toBe(0);
    expect(secondRequestMessages).toContain("Tool edit is not available.");
  } finally {
    await runtime.close();
  }
});

