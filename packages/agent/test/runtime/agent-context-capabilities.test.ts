import { expect, test } from "bun:test";
import Type from "typebox";
import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  InMemorySessionStore,
  type AgentContext,
  type LoadedExtension,
  type Phase,
  type Skill,
  type StreamFn,
  type Tool,
} from "../../src";
import {
  buildTestPartial,
  buildToolCallPartial,
  yieldRouteToolCall,
} from "../support/scripted-stream";

function tool(name: string): Tool {
  return {
    name,
    description: `${name} tool`,
    parameters: Type.Object({}),
    async execute(_args, context) {
      return {
        toolCallId: context.toolCallId,
        toolName: name,
        ok: true,
        content: name,
      };
    },
  };
}

function skill(name: string): Skill {
  return {
    name,
    description: `${name} skill`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    content: `${name} instructions`,
    disableModelInvocation: false,
  };
}

function phase(name: string): Phase {
  return {
    name,
    description: `${name} phase`,
    filePath: `/phases/${name}/PHASE.md`,
    baseDir: `/phases/${name}`,
    content: `${name} instructions`,
  };
}

test("Agent Context exposes only supplied capabilities to the model", async () => {
  const requests: Parameters<StreamFn>[0][] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    const text = "Filtered capabilities observed.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const context: AgentContext = {
    systemPrompt: "Capability test",
    messages: [],
    tools: [tool("selected_tool")],
    skills: [skill("selected_skill")],
    phases: {
      phases: new Map([["selected_phase", phase("selected_phase")]]),
      entryPhaseId: "default",
    },
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context,
      model: { provider: "test", id: "scripted" },
      stream,
    });

    await (await agent.send("inspect capabilities")).result();

    expect(requests).toHaveLength(1);
    expect(requests[0].tools?.map(({ name }) => name)).toEqual(["selected_tool", "route"]);
    expect(requests[0].system).toContain("selected_skill skill");
    const route = requests[0].tools?.find(({ name }) => name === "route");
    expect(route?.description).toContain("selected_phase");
  } finally {
    await runtime.stop();
  }
});

test("extension Tools and Phases join the final capability candidates", async () => {
  const requests: Parameters<StreamFn>[0][] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    const text = "Extension capabilities observed.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const extension: LoadedExtension = {
    path: "<capability-extension>",
    name: "capability-extension",
    factory(api) {
      api.registerTool({
        name: "extension_tool",
        description: "Extension tool",
        parameters: { type: "object", properties: {} },
        async execute() {
          return { content: [{ type: "text", text: "extension result" }] };
        },
      });
      api.registerPhase({
        name: "extension-phase",
        description: "Extension phase",
        async run() {
          return { message: "extension phase", route: "stop" };
        },
      });
    },
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Extension capability test",
        messages: [],
        tools: [],
        skills: [],
      },
      extensions: [extension],
      model: { provider: "test", id: "scripted" },
      stream,
    });

    await (await agent.send("inspect extension capabilities")).result();

    expect(requests).toHaveLength(1);
    expect(requests[0].tools?.map(({ name }) => name)).toEqual(["extension_tool", "route"]);
    const route = requests[0].tools?.find(({ name }) => name === "route");
    expect(route?.description).toContain("extension-phase");
  } finally {
    await runtime.stop();
  }
});

test("capability name collisions fail before model execution", async () => {
  let modelRequests = 0;
  const stream: StreamFn = async function* () {
    modelRequests++;
    const text = "A collision should prevent this request.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const extension: LoadedExtension = {
    path: "<duplicate-extension>",
    name: "duplicate-extension",
    factory(api) {
      api.registerTool({
        name: "duplicate_tool",
        description: "Duplicate extension tool",
        parameters: { type: "object", properties: {} },
        async execute() {
          return { content: [{ type: "text", text: "extension" }] };
        },
      });
    },
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Collision test",
        messages: [],
        tools: [tool("duplicate_tool")],
        skills: [],
      },
      extensions: [extension],
      model: { provider: "test", id: "scripted" },
      stream,
    });

    const outcome = await (await agent.send("detect collision")).result();

    expect(modelRequests).toBe(0);
    expect(outcome.message).toContain('Duplicate Tool name "duplicate_tool"');
  } finally {
    await runtime.stop();
  }
});

test("an Extension Tool executes through the Runtime Tool path", async () => {
  const calls: unknown[] = [];
  let requestCount = 0;
  const stream: StreamFn = async function* () {
    requestCount++;
    if (requestCount === 1) {
      const id = "extension-call";
      const args = JSON.stringify({ query: "hello" });
      const partial = buildToolCallPartial(id, "extension_tool", args);
      yield { type: "tool_call_start", id, name: "extension_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "extension_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const text = "Extension tool result received.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const extension: LoadedExtension = {
    path: "<executable-extension>",
    name: "executable-extension",
    factory(api) {
      api.registerTool({
        name: "extension_tool",
        description: "Executable extension tool",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        async execute(args) {
          calls.push(args);
          return { content: [{ type: "text", text: "extension evidence" }] };
        },
      });
    },
  };
  const stateStore = new InMemoryRuntimeStateStore();
  const runtime = await AgentRuntime.start({
    stateStore,
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Executable extension test",
        messages: [],
        tools: [],
        skills: [],
      },
      extensions: [extension],
      model: { provider: "test", id: "scripted" },
      stream,
    });

    await (await agent.send("call extension tool")).result();

    expect(calls).toEqual([{ query: "hello" }]);
    expect((await stateStore.listEvents()).some((event) =>
      event.kind === "tool_call_completed"
    )).toBe(true);
  } finally {
    await runtime.stop();
  }
});

test("duplicate Tool registrations across Extensions fail the Run", async () => {
  const extension = (name: string): LoadedExtension => ({
    path: `<${name}>`,
    name,
    factory(api) {
      api.registerTool({
        name: "duplicate_extension_tool",
        description: `${name} tool`,
        parameters: { type: "object", properties: {} },
        async execute() {
          return { content: [{ type: "text", text: name }] };
        },
      });
    },
  });
  let modelRequests = 0;
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Extension collision test",
        messages: [],
        tools: [],
        skills: [],
      },
      extensions: [extension("first-extension"), extension("second-extension")],
      model: { provider: "test", id: "scripted" },
      stream: async function* () {
        modelRequests++;
        yield* yieldRouteToolCall("stop");
        yield { type: "done" };
      },
    });

    const outcome = await (await agent.send("detect extension collision")).result();

    expect(modelRequests).toBe(0);
    expect(outcome.message).toContain('Duplicate Tool name "duplicate_extension_tool"');
  } finally {
    await runtime.stop();
  }
});

test("Extension registrations cannot collide with Rowan control-plane names", async () => {
  const cases: Array<{ resource: "Tool" | "Phase"; extension: LoadedExtension }> = [
    {
      resource: "Tool",
      extension: {
        path: "<route-collision>",
        name: "route-collision",
        factory(api) {
          api.registerTool({
            name: "route",
            description: "Conflicts with Rowan routing",
            parameters: { type: "object", properties: {} },
            async execute() {
              return { content: [{ type: "text", text: "route collision" }] };
            },
          });
        },
      },
    },
    {
      resource: "Phase",
      extension: {
        path: "<default-collision>",
        name: "default-collision",
        factory(api) {
          api.registerPhase({
            name: "default",
            description: "Conflicts with Rowan default",
          });
        },
      },
    },
  ];

  for (const { resource, extension } of cases) {
    let modelRequests = 0;
    const runtime = await AgentRuntime.start({
      stateStore: new InMemoryRuntimeStateStore(),
      sessionProvider: new InMemorySessionStore(),
    });
    try {
      const agent = await runtime.createAgent({
        context: {
          systemPrompt: "Built-in collision test",
          messages: [],
          tools: [],
          skills: [],
        },
        extensions: [extension],
        model: { provider: "test", id: "scripted" },
        stream: async function* () {
          modelRequests++;
          yield* yieldRouteToolCall("stop");
          yield { type: "done" };
        },
      });

      const outcome = await (await agent.send("detect built-in collision")).result();
      expect(modelRequests).toBe(0);
      expect(outcome.message).toContain(`Duplicate ${resource} name`);
    } finally {
      await runtime.stop();
    }
  }
});

test("Extension hooks cannot add Tools or Skills absent from Agent Context", async () => {
  const selectedTool = tool("selected_tool");
  const blockedTool = tool("blocked_tool");
  const selectedSkill = skill("selected_skill");
  const blockedSkill = skill("blocked_skill");
  const requests: Parameters<StreamFn>[0][] = [];
  const extension: LoadedExtension = {
    path: "<widening-extension>",
    name: "widening-extension",
    factory(api) {
      api.on("before_phase", (event) => ({
        input: {
          ...event.input,
          tools: [blockedTool, selectedTool],
          skills: [blockedSkill, selectedSkill],
        },
      }));
      api.on("before_prompt", (event) => ({
        input: {
          ...event.input,
          tools: [blockedTool, selectedTool],
          skills: [blockedSkill, selectedSkill],
        },
      }));
    },
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Hook narrowing test",
        messages: [],
        tools: [selectedTool],
        skills: [selectedSkill],
      },
      extensions: [extension],
      model: { provider: "test", id: "scripted" },
      stream: async function* (request) {
        requests.push(request);
        const text = "Hook remained narrowed.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("stop", "Done.", text);
        yield { type: "done" };
      },
    });

    await (await agent.send("attempt widening")).result();

    expect(requests[0]?.tools?.map(({ name }) => name)).toEqual(["selected_tool", "route"]);
    expect(requests[0]?.system).toContain("selected_skill skill");
    expect(requests[0]?.system).not.toContain("blocked_skill skill");
  } finally {
    await runtime.stop();
  }
});

test("one Extension cannot overwrite its own Tool registration", async () => {
  const extension: LoadedExtension = {
    path: "<self-duplicate-extension>",
    name: "self-duplicate-extension",
    factory(api) {
      for (const description of ["first", "second"]) {
        api.registerTool({
          name: "self_duplicate_tool",
          description,
          parameters: { type: "object", properties: {} },
          async execute() {
            return { content: [{ type: "text", text: description }] };
          },
        });
      }
    },
  };
  let modelRequests = 0;
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Self-collision test",
        messages: [],
        tools: [],
        skills: [],
      },
      extensions: [extension],
      model: { provider: "test", id: "scripted" },
      stream: async function* () {
        modelRequests++;
        yield* yieldRouteToolCall("stop");
        yield { type: "done" };
      },
    });

    const outcome = await (await agent.send("detect self collision")).result();
    expect(modelRequests).toBe(0);
    expect(outcome.message).toContain('Duplicate Tool name "self_duplicate_tool"');
  } finally {
    await runtime.stop();
  }
});

test("Phase Skill policy further narrows the Tool Context", async () => {
  const observedSkills: string[][] = [];
  const phaseTool: Tool = {
    ...tool("phase_tool"),
    async execute(_args, context) {
      observedSkills.push(context.skills.map(({ name }) => name));
      return {
        toolCallId: context.toolCallId,
        toolName: "phase_tool",
        ok: true,
        content: "phase tool result",
      };
    },
  };
  let requestCount = 0;
  const stream: StreamFn = async function* () {
    requestCount++;
    if (requestCount === 1) {
      const id = "phase-tool-call";
      const args = "{}";
      const partial = buildToolCallPartial(id, "phase_tool", args);
      yield { type: "tool_call_start", id, name: "phase_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "phase_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const text = "Phase Tool Context observed.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const runtime = await AgentRuntime.start({
    stateStore: new InMemoryRuntimeStateStore(),
    sessionProvider: new InMemorySessionStore(),
  });

  try {
    const executionPhase: Phase = {
      ...phase("execution-phase"),
      tools: ["phase_tool"],
      skills: ["phase_skill"],
    };
    const agent = await runtime.createAgent({
      context: {
        systemPrompt: "Phase narrowing test",
        messages: [],
        tools: [phaseTool],
        skills: [skill("phase_skill"), skill("other_agent_skill")],
        phases: {
          phases: new Map([[executionPhase.name, executionPhase]]),
          entryPhaseId: executionPhase.name,
        },
      },
      model: { provider: "test", id: "scripted" },
      stream,
    });

    await (await agent.send("inspect Tool Context")).result();

    expect(observedSkills).toEqual([["phase_skill"]]);
  } finally {
    await runtime.stop();
  }
});

test("Agent reconstruction applies the current Context resources", async () => {
  const stateStore = new InMemoryRuntimeStateStore();
  const sessionProvider = new InMemorySessionStore();
  const candidatePhase = phase("candidate-phase");
  const context: AgentContext = {
    systemPrompt: "Reconstruction policy test",
    messages: [],
    tools: [tool("candidate_tool")],
    skills: [skill("candidate_skill")],
    phases: {
      phases: new Map([[candidatePhase.name, candidatePhase]]),
      entryPhaseId: "default",
    },
  };
  const capture = (requests: Parameters<StreamFn>[0][]): StreamFn => async function* (request) {
    requests.push(request);
    const text = "Reconstruction policy observed.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", "Done.", text);
    yield { type: "done" };
  };
  const initialRequests: Parameters<StreamFn>[0][] = [];
  let runtime = await AgentRuntime.start({ stateStore, sessionProvider });
  const initial = await runtime.createAgent({
    context,
    model: { provider: "test", id: "scripted" },
    stream: capture(initialRequests),
  });
  const agentId = initial.id;

  try {
    await (await initial.send("initial policy")).result();
    await runtime.stop();
    runtime = await AgentRuntime.start({ stateStore, sessionProvider });
    const reconstructedRequests: Parameters<StreamFn>[0][] = [];
    const reconstructed = await runtime.reconstructAgent(agentId, {
      context: {
        ...context,
        tools: [],
        skills: [],
        phases: { phases: new Map(), entryPhaseId: "default" },
      },
      model: { provider: "test", id: "scripted" },
      stream: capture(reconstructedRequests),
    });

    await (await reconstructed.send("current policy")).result();

    expect(initialRequests[0]?.tools?.map(({ name }) => name)).toEqual(["candidate_tool", "route"]);
    expect(reconstructedRequests[0]?.tools?.map(({ name }) => name)).toEqual(["route"]);
    expect(reconstructedRequests[0]?.system).not.toContain("candidate_skill skill");
    const route = reconstructedRequests[0]?.tools?.find(({ name }) => name === "route");
    expect(route?.description).not.toContain("candidate-phase");
  } finally {
    await runtime.stop();
  }
});
