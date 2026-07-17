import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { createMessage } from "../src";
import { loadPhases } from "../src/harness/phases";
import { AgentExecution as Agent } from "../src/agent-execution";
import type { LoadedExtension } from "../src/extensions";
import type { AgentEventListener, LlmRequest, StreamFn } from "../src/types";
import type { Phase } from "../src/harness/phases/types";
import { createTestContext, runAgentTurn } from "./support/agent-run";
import { createEchoTools } from "./support/echo-tool";
import { buildTestPartial, scriptedStream, yieldRouteToolCall } from "./support/scripted-stream";

function detectPhase(messages: LlmRequest["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = (messages[i].content as string).match(/^Phase:\s*(\w+)/);
    if (match) return match[1];
  }
  return "chat";
}

test("Agent.run returns a run result and emits events", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", id: "scripted" },
    stream: scriptedStream,
  });
  const events: string[] = [];
  agent.subscribe((event) => {
    events.push(event.type);
  });

  const outcome = await runAgentTurn(agent, "use echo tool");

  expect(agent.state.running).toBe(false);
  expect(agent.state.sessionId).toEqual(expect.stringMatching(/^ses_/));
  expect(agent.state.context.messages.length).toBeGreaterThan(0);
  expect(agent.state.context.messages[0]?.content).toBe("use echo tool");
  // In the new phase system (no phaseConfig), tools are not auto-executed in none phase
  expect(events).toContain("phase_start");
  expect(events).toContain("phase_end");
});

test("Agent publishes display outcomes as assistant messages", async () => {
  const phase: Phase = {
    id: "image-gen",
    name: "Image generation",
    description: "Generates an image.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Generate an image.",
    async run() {
      return { message: "Image generated: ./cat.jpg", route: "stop" };
    },
  };
  const agent = new Agent({
    context: {
      ...createTestContext(),
      phases: { phases: new Map([[phase.id, phase]]), entryPhaseId: phase.id },
    },
    model: { provider: "test", id: "display-outcome" },
    stream: async function* unusedStream() {
      throw new Error("programmatic phase should not invoke the model");
    },
  });
  const displayed: string[] = [];
  agent.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      displayed.push(typeof event.message.content === "string" ? event.message.content : "");
    }
  });

  const result = await agent.run();

  expect(result.outcome.display).toBe(true);
  expect(displayed).toEqual(["Image generated: ./cat.jpg"]);
});

test("Agent context and transcript accessors return safe snapshots", () => {
  const agent = new Agent({
    context: createTestContext({
      messages: [createMessage("user", "initial")],
      tools: createEchoTools(),
    }),
    model: { provider: "test", id: "accessors" },
    stream: scriptedStream,
  });

  const messages = agent.getMessages();
  messages.push(createMessage("user", "mutated clone"));
  const config = agent.getConfig();
  config.context.messages.push(createMessage("user", "mutated config clone"));
  const context = agent.getContext();
  context.tools.length = 0;

  expect(agent.getMessages().map((message) => message.content)).toEqual(["initial"]);
  expect(agent.getTools()).toHaveLength(1);

  agent.appendMessages([createMessage("assistant", "answer")]);
  expect(agent.getTranscript().map((message) => message.content)).toEqual(["initial", "answer"]);

  agent.replaceTranscript([createMessage("user", "restored")]);
  expect(agent.getMessages().map((message) => message.content)).toEqual(["restored"]);

  agent.clearMessages();
  expect(agent.getMessages()).toEqual([]);
});

test("Agent config shortcuts update subsequent run configuration", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* captureStream(request) {
    requests.push(request);
    const text = "configured response";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const alternateStream: StreamFn = async function* alternateCaptureStream(request) {
    requests.push(request);
    const text = "alternate response";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield { type: "done" };
  };
  const customPhase: Phase = {
    id: "custom",
    name: "Custom",
    description: "Custom phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Custom phase content.",
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "initial" },
    stream,
  });

  agent.setSessionId("known-session");
  agent.setModel({ provider: "test", id: "updated" });
  agent.setTools(createEchoTools());
  agent.setSkills([{
    name: "example",
    description: "Example skill.",
    filePath: "/tmp/SKILL.md",
    baseDir: "/tmp",
    content: "Example skill content.",
    disableModelInvocation: false,
  }]);
  agent.setPhases({ phases: new Map([["custom", customPhase]]), entryPhaseId: "custom" });
  agent.setCwd("/tmp/rowan-agent-test");
  agent.setStream(alternateStream);
  agent.updateConfig((config) => ({ ...config, maxAttempts: 2 }));
  agent.updateContext((context) => ({
    ...context,
    systemPrompt: "Updated system",
  }));

  expect(agent.getSessionId()).toBe("known-session");
  expect(agent.getModel()).toEqual({ provider: "test", id: "updated" });
  expect(agent.getTools()).toHaveLength(1);
  expect(agent.getSkills()).toHaveLength(1);
  expect(agent.getPhases()?.entryPhaseId).toBe("custom");
  expect(agent.getCwd()).toBe("/tmp/rowan-agent-test");
  expect(agent.forkContext({ systemPrompt: "Forked" }).systemPrompt).toBe("Forked");

  agent.setPhases({ phases: new Map(), entryPhaseId: null });
  const result = await agent.runWithUserInput("hello");

  expect(result.outcome.message).toBe("alternate response");
  expect(requests[0]?.model).toEqual({ provider: "test", id: "updated" });
  expect(requests[0]?.system).toContain("Updated system");
});

test("Agent uses entryPhaseId only until initialized, then starts later turns at default", async () => {
  const phaseStarts: string[] = [];
  const planningPhase: Phase = {
    id: "planning",
    name: "Planning",
    description: "Initial planning phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Planning phase content.",
    async run() {
      return { message: "planning ran", route: "stop" };
    },
  };
  const defaultPhase: Phase = {
    id: "default",
    name: "Default",
    description: "Default continuation phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Default phase content.",
    async run() {
      return { message: "default ran", route: "stop" };
    },
  };
  const agent = new Agent({
    context: {
      ...createTestContext(),
      phases: {
        phases: new Map([
          ["planning", planningPhase],
          ["default", defaultPhase],
        ]),
        entryPhaseId: "planning",
      },
    },
    model: { provider: "test", id: "initialization" },
    stream: async function* unusedStream() {
      throw new Error("test phases should run without invoking the model");
    },
  });
  agent.subscribe((event) => {
    if (event.type === "phase_start") phaseStarts.push(event.phase);
  });

  const first = await agent.run();
  const second = await agent.runWithUserInput("continue");
  agent.resetInitialization();
  const third = await agent.runWithUserInput("restart planning");

  expect(first.outcome.message).toBe("planning ran");
  expect(second.outcome.message).toBe("default ran");
  expect(third.outcome.message).toBe("planning ran");
  expect(agent.state.initialized).toBe(true);
  expect(phaseStarts).toEqual(["planning", "default", "planning"]);
});

test("Agent does not mark initialization complete when a run fails", async () => {
  const phaseStarts: string[] = [];
  let callCount = 0;
  const stream: StreamFn = async function* failThenSucceedStream() {
    callCount++;
    if (callCount === 1) {
      throw new Error("initial run failed");
    }
    const text = "recovered";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("stop", text, text);
    yield { type: "done" };
  };
  const planningPhase: Phase = {
    id: "planning",
    name: "Planning",
    description: "Initial planning phase.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Planning phase content.",
  };
  const agent = new Agent({
    context: {
      ...createTestContext(),
      phases: {
        phases: new Map([["planning", planningPhase]]),
        entryPhaseId: "planning",
      },
    },
    model: { provider: "test", id: "failed-initialization" },
    stream,
  });
  agent.subscribe((event) => {
    if (event.type === "phase_start") phaseStarts.push(event.phase);
  });

  await expect(agent.run()).rejects.toThrow("initial run failed");
  expect(agent.state.initialized).toBe(false);
  await agent.run();

  expect(agent.state.initialized).toBe(true);
  expect(phaseStarts).toEqual(["planning", "planning"]);
});

test("Agent.run can pause and resume with a user message when route is missing", async () => {
  const helperPhase: Phase = {
    id: "helper",
    name: "Helper",
    description: "Additional phase that makes routing available.",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Helper phase content.",
  };
  const agent = new Agent({
    context: {
      ...createTestContext(),
      phases: {
        phases: new Map([["helper", helperPhase]]),
        entryPhaseId: "default",
      },
    },
    model: { provider: "test", id: "direct-run-no-route" },
    stream: async function* noRouteStream(request) {
      const userMessages = request.messages.filter((message) => message.role === "user");
      const lastUser = userMessages.at(-1)?.content;
      const text = lastUser === "next" ? "final answer" : "need more";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      if (lastUser === "next") {
        yield* yieldRouteToolCall("stop", "done", text);
      }
      yield { type: "done" };
    },
  });
  const waits: string[] = [];
  agent.subscribe((event) => {
    if (event.type === "user_prompt_requested") {
      waits.push(event.phase);
    }
  });

  const run = Promise.race([
    agent.run(),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 10)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const resumed = await agent.runWithUserInput("next");
  const result = await run;

  expect(result).not.toBe("timeout");
  expect(result).toEqual(resumed);
  expect(result).toMatchObject({ outcome: { message: "final answer" } });
  expect(waits).toEqual(["default"]);
});

test("Agent does not discover custom phases from cwd .rowan extensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-extension-"));
  try {
    const extDir = join(root, ".rowan", "extensions", "echo");
    await mkdir(extDir, { recursive: true });
    await writeFile(join(extDir, "package.json"), JSON.stringify({
      name: "rowan-test-extension",
      rowan: { extensions: ["./index.ts"] },
    }));
    await writeFile(join(extDir, "index.ts"), `
      import type { ExtensionFactory } from "@rowan-agent/agent";
      const extension: ExtensionFactory = (rowan) => {
        rowan.registerPhase({
          id: "echo",
          name: "Echo",
          description: "Echo extension phase.",
          async run() {
            return { message: "custom extension ran", route: "stop" };
          },
        });
      };
      export default extension;
    `);

    const stream: StreamFn = async function* simpleStream(request) {
      const text = "Extension test response.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield { type: "done" };
    };

    const agent = new Agent({
      context: createTestContext(),
      model: { provider: "test", id: "extension" },
      stream,
    });

    const outcome = await runAgentTurn(agent, "use extension");

    expect(outcome.outcome.message).toBe("Extension test response.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent loads phases from LoadedExtension list", async () => {
  let capturedCwd: string | undefined;
  const extension: LoadedExtension = {
    path: "<test>",
    name: "test-extension",
    factory: (rowan) => {
      capturedCwd = rowan.context.cwd;
      rowan.registerPhase({
        id: "extension",
        name: "Extension",
        description: "Extension registered phase.",
        async run() {
          return { message: "extension phase ran", route: "stop" };
        },
      });
    },
  };

  let requestCount = 0;
  const stream: StreamFn = async function* routeToExtensionStream() {
    requestCount++;
    const text = "Routing to extension.";
    yield { type: "text_delta", text, partial: buildTestPartial(text) };
    yield* yieldRouteToolCall("extension", "Use registered extension phase.", text);
    yield { type: "done" };
  };

  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "extension-runner" },
    stream,
    extensions: [extension],
  });

  const outcome = await runAgentTurn(agent, "use extension");

  expect(requestCount).toBe(1);
  expect(capturedCwd).toBe(process.cwd());
  expect(agent.state.context.phases?.phases.has("extension")).toBe(true);
  expect(outcome.outcome.message).toBe("extension phase ran");
});

test("Agent passes cwd option to extension context", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-extension-cwd-"));
  try {
    let capturedCwd: string | undefined;
    const extension: LoadedExtension = {
      path: "<test>",
      name: "cwd-extension",
      factory: (rowan) => {
        capturedCwd = rowan.context.cwd;
        rowan.registerPhase({
          id: "extension",
          name: "Extension",
          description: "Extension registered phase.",
          async run() {
            return { message: "extension phase ran", route: "stop" };
          },
        });
      },
    };

    const agent = new Agent({
      context: createTestContext(),
      model: { provider: "test", id: "extension-cwd" },
      stream: async function* routeToExtensionStream() {
        const text = "Routing to extension.";
        yield { type: "text_delta", text, partial: buildTestPartial(text) };
        yield* yieldRouteToolCall("extension", "Use registered extension phase.", text);
        yield { type: "done" };
      },
      cwd: root,
      extensions: [extension],
    });

    await runAgentTurn(agent, "use extension");

    expect(capturedCwd).toBe(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent runs explicitly supplied file phases from configured project rowan dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-rowan-dir-"));
  try {
    const phaseDir = join(root, ".rowan-project", "phases", "default");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: Custom Default
description: Uses the configured project Rowan directory.
---

Custom phase content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "configured project Rowan dir phase ran", route: "stop" };
      }
    `);

    const stream: StreamFn = async function* unusedStream() {
      throw new Error("configured phase should run without invoking the model");
    };
    const phases = await Agent.loadPhases(join(root, ".rowan-project", "phases"));
    const agent = new Agent({
      context: { ...createTestContext(), phases },
      model: { provider: "test", id: "configured-rowan-dir" },
      stream,
    });

    expect(await agent.phase("default")).toContain("Custom phase content.");
    const outcome = await runAgentTurn(agent, "use configured phase");

    expect(outcome.outcome.message).toBe("configured project Rowan dir phase ran");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent accepts an explicit phase registry in context", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-explicit-phases-"));
  try {
    const phaseDir = join(root, "phases", "default");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: Explicit Default
description: Supplied as an Agent option.
---

Explicit phase content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "explicit phase registry ran", route: "stop" };
      }
    `);

    const phases = await loadPhases(join(root, "phases"));
    const agent = new Agent({
      context: { ...createTestContext(), phases },
      model: { provider: "test", id: "explicit-phases" },
      stream: async function* unusedStream() {
        throw new Error("explicit phase should run without invoking the model");
      },
      cwd: root,
    });

    expect(await agent.phase("default")).toContain("Explicit phase content.");
    const outcome = await runAgentTurn(agent, "use explicit phase");

    expect(outcome.outcome.message).toBe("explicit phase registry ran");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent lets a user-defined default phase override the built-in default", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-user-default-phase-"));
  try {
    const phaseDir = join(root, "phases", "default");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: User Default
description: Overrides the built-in default phase.
---

User default content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "user default ran", route: "stop" };
      }
    `);

    const phases = await Agent.loadPhases(join(root, "phases"));
    const agent = new Agent({
      context: { ...createTestContext(), phases },
      model: { provider: "test", id: "user-default" },
      stream: async function* unusedStream() {
        throw new Error("user default phase should run without invoking the model");
      },
    });

    expect(await agent.phase("default")).toContain("User default content.");
    const outcome = await runAgentTurn(agent, "use user default");

    expect(outcome.outcome.message).toBe("user default ran");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent.loadSkills picks up edits on repeated loads", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-skill-reload-"));
  try {
    const skillDir = join(root, "skills", "writer");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---
name: writer
description: Writes things.
---

First version.
`);

    const [first] = await Agent.loadSkills(join(root, "skills"));
    expect(first?.content).toContain("First version.");

    await writeFile(join(skillDir, "SKILL.md"), `---
name: writer
description: Writes things.
---

Second version.
`);

    const [second] = await Agent.loadSkills(join(root, "skills"));
    expect(second?.content).toContain("Second version.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent.loadPhases picks up markdown and execution edits on repeated loads", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-phase-reload-"));
  try {
    const phaseDir = join(root, "phases", "default");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "PHASE.md"), `---
name: Reloadable
description: Reloadable phase.
---

First phase content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "first phase run", route: "stop" };
      }
    `);

    const first = await Agent.loadPhases(join(root, "phases"));
    expect(first.phases.get("default")?.content).toContain("First phase content.");
    await expect(first.phases.get("default")?.run?.({} as never, {} as never)).resolves.toMatchObject({
      message: "first phase run",
    });

    await writeFile(join(phaseDir, "PHASE.md"), `---
name: Reloadable
description: Reloadable phase.
---

Second phase content.
`);
    await writeFile(join(phaseDir, "index.ts"), `
      export async function run() {
        return { message: "second phase run", route: "stop" };
      }
    `);

    const second = await Agent.loadPhases(join(root, "phases"));
    expect(second.phases.get("default")?.content).toContain("Second phase content.");
    await expect(second.phases.get("default")?.run?.({} as never, {} as never)).resolves.toMatchObject({
      message: "second phase run",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent.run can hot reload extensions loaded by Agent.loadExtensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-agent-extension-reload-"));
  try {
    const extensionsDir = join(root, "extensions");
    const extensionDir = join(extensionsDir, "echo");
    const extensionPath = join(extensionDir, "index.ts");
    await mkdir(extensionDir, { recursive: true });
    await writeFile(join(extensionDir, "package.json"), JSON.stringify({
      name: "rowan-reload-extension",
      rowan: { extensions: ["./index.ts"] },
    }));
    const writeExtension = (message: string) => writeFile(extensionPath, `
      export default (rowan: any) => {
        rowan.registerPhase({
          id: "extension",
          name: "Extension",
          description: "Reloadable extension phase.",
          async run() {
            return { message: ${JSON.stringify(message)}, route: "stop" };
          },
        });
      };
    `);
    await writeExtension("first extension run");

    const stream: StreamFn = async function* routeToExtensionStream() {
      const text = "Routing to extension.";
      yield { type: "text_delta", text, partial: buildTestPartial(text) };
      yield* yieldRouteToolCall("extension", "Use registered extension phase.", text);
      yield { type: "done" };
    };
    const firstLoad = await Agent.loadExtensions(extensionsDir);
    const agent = new Agent({
      context: createTestContext(),
      model: { provider: "test", id: "extension-reload" },
      stream,
      extensions: firstLoad.extensions,
    });

    const first = await runAgentTurn(agent, "use extension");
    expect(first.outcome.message).toBe("first extension run");

    await writeExtension("second extension run");
    const secondLoad = await Agent.loadExtensions(extensionsDir);
    const second = await runAgentTurn(agent, "use extension again", {
      extensions: secondLoad.extensions,
    });

    expect(second.outcome.message).toBe("second extension run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent.run does not wait for async event listeners", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", id: "scripted" },
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

  expect(blocked).toBe(true);
  release?.();
  await agent.flushEvents();
});

test("Agent rejects concurrent runs", async () => {
  const agent = new Agent({
    context: createTestContext({ tools: createEchoTools() }),
    model: { provider: "test", id: "scripted" },
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
    model: { provider: "test", id: "scripted" },
    stream: hangingStream,
  });

  const run = runAgentTurn(agent, "hello");
  await new Promise((resolve) => setTimeout(resolve, 1));
  agent.abort();

  await expect(run).rejects.toThrow("aborted");
  expect(agent.state.running).toBe(false);
});

test("cooperative abort flushes the partial reply and resumes from the snapshot", async () => {
  // Stream yields text then waits one tick; abort flips the signal, so the
  // next loop iteration hits the cooperative LoopGuard.checkAbort return
  // (not an exception). The partial "partial rep" reply must still land in
  // the transcript so the next runWithUserInput resumes from it.
  let released = false;
  const stream: StreamFn = async function* (request, options) {
    yield { type: "text_delta", text: "partial rep", partial: buildTestPartial("partial rep") };
    // Wait until aborted (cooperative), then yield one more event so the
    // collector's abort check fires on the next iteration.
    await new Promise<void>((resolve) => {
      options.signal?.addEventListener("abort", () => resolve());
      if (options.signal?.aborted) resolve();
      setTimeout(resolve, 50);
    });
    released = true;
    yield { type: "text_delta", text: "ly", partial: buildTestPartial("partially") };
    yield { type: "done" };
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "abort-flush" },
    stream,
  });

  const run = runAgentTurn(agent, "hi");
  await new Promise((resolve) => setTimeout(resolve, 5));
  agent.abort();
  const result = await run;

  expect(result.outcome.message).toContain("aborted");
  expect(released).toBe(true);
  // Partial reply was flushed into the transcript (alternation preserved).
  const assistantTexts = agent.getMessages()
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
  expect(assistantTexts.some((t) => t.includes("partial rep"))).toBe(true);
  // The user message is present; next runWithUserInput starts from here.
  const userTexts = agent.getMessages()
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
  expect(userTexts).toEqual(["hi"]);
});

test("cooperative abort is observed when the stream ends without another event", async () => {
  const stream: StreamFn = async function* (_request, options) {
    yield { type: "text_delta", text: "partial", partial: buildTestPartial("partial") };
    await new Promise<void>((resolve) => {
      options.signal?.addEventListener("abort", () => resolve(), { once: true });
      if (options.signal?.aborted) resolve();
    });
  };
  const agent = new Agent({
    context: createTestContext(),
    model: { provider: "test", id: "abort-at-stream-end" },
    stream,
  });
  const endedAssistantMessages: string[] = [];
  agent.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      endedAssistantMessages.push(
        typeof event.message.content === "string" ? event.message.content : "",
      );
    }
  });

  const run = runAgentTurn(agent, "hi");
  await new Promise((resolve) => setTimeout(resolve, 0));
  agent.abort();
  const result = await run;

  expect(result.outcome.message).toBe("Agent run aborted.");
  expect(endedAssistantMessages).toEqual(["partial"]);
});
