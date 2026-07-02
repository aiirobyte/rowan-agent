import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import type { LoadedExtension } from "../src/extensions";
import type { AgentEventListener, LlmRequest, StreamFn } from "../src/types";
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

  expect(agent.state.isRunning).toBe(false);
  expect(agent.state.sessionId).toEqual(expect.stringMatching(/^ses_/));
  expect(agent.state.context.messages.length).toBeGreaterThan(0);
  expect(agent.state.context.messages[0]?.content).toBe("use echo tool");
  // In the new phase system (no phaseConfig), tools are not auto-executed in none phase
  expect(events).toContain("phase_start");
  expect(events).toContain("phase_end");
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
  expect(agent.state.isRunning).toBe(false);
});
