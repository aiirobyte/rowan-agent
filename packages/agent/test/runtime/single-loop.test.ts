import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Type from "typebox";
import type { LlmRequest, ProviderCallContext, StreamFn } from "@rowan-agent/models";
import {
  AgentRuntime,
  InMemoryConfigProvider,
  InMemoryStore,
  SqliteStore,
} from "../../src/runtime/index";
import type { Tool } from "../../src/runtime/contracts";
import type { Phase } from "../../src/harness/phases/types";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { createAgentWith, seedResources } from "../fixtures/configuration";
import { routeResponse, stopResponse } from "./route-test-utils";

const plainResponse = (content: string) => ({
  type: "done" as const,
  response: { content, stopReason: "stop" as const },
});

const tool = (name: string) => ({
  name,
  description: `${name} tool`,
  parameters: Type.Object({}),
  execute: async () => ({ ok: true as const, content: `${name} result` }),
});

const phase = (name: string, overrides: Partial<Phase> = {}): Phase => ({
  name,
  description: `${name} phase`,
  content: `${name} instructions`,
  filePath: `<${name}>`,
  baseDir: `<${name}>`,
  skills: [],
  ...overrides,
});

function toolsOf(request: LlmRequest): string[] {
  return (request.tools ?? []).map(({ name }) => name);
}

function phasePrompt(request: LlmRequest, name: string): boolean {
  return request.messages.some((message) =>
    typeof message.content === "string"
      && message.content.includes(`<phase_content name="${name}">`));
}

test("route follows the auto-invocable Phase count", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const runCase = async (input: Readonly<{
      name: string;
      phaseIds: readonly string[];
      route: boolean;
      entryPrompt?: string;
      modelCalls?: number;
      stopSelected?: boolean;
    }>) => {
      let request: LlmRequest | undefined;
      let providerTools: readonly string[] = [];
      let calls = 0;
      const stream: StreamFn = async function* (next, context) {
        calls += 1;
        request = next;
        providerTools = (context as ProviderCallContext).tools.list().map(({ name }) => name);
        yield {
          type: "done" as const,
          response: input.route
            ? stopResponse("done")
            : { content: "done", stopReason: "stop" as const },
        };
      };
      const agentId = await createAgentWith(runtime, {
        identity: `phase-count-${input.name}`,
        definition: {
          name: `phase-count-${input.name}`,
          description: input.name,
          prompt: "Count phases.",
          phases: { entryPhaseId: null, phaseIds: input.phaseIds },
        },
        stream,
        options: { idempotencyKey: `phase-count-${input.name}-agent` },
      });
      const run = await runtime.start(agentId, "go", {
        idempotencyKey: `phase-count-${input.name}-run`,
      });
      await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
      expect(request).toBeDefined();
      expect(toolsOf(request!).includes("route")).toBe(input.route);
      expect(providerTools.includes("route")).toBe(false);
      if (input.modelCalls !== undefined) expect(calls).toBe(input.modelCalls);
      if (input.stopSelected === false) {
        expect(request!.system).not.toContain("Stop Phase will provide");
      }
      if (input.entryPrompt) {
        expect(phasePrompt(request!, input.entryPrompt)).toBe(true);
      } else {
        expect(request!.messages.some((message) =>
          typeof message.content === "string"
            && message.content.includes("<phase_content"))).toBe(false);
      }
    };

    await runCase({ name: "default", phaseIds: [], route: true, entryPrompt: "default" });
    await runCase({ name: "no-compact", phaseIds: ["-compact"], route: true, entryPrompt: "default" });
    await runCase({
      name: "no-stop",
      phaseIds: ["-stop"],
      route: false,
      entryPrompt: "default",
      modelCalls: 1,
      stopSelected: false,
    });
    await runCase({ name: "default-only", phaseIds: ["-stop", "-compact"], route: false, entryPrompt: "default" });
    await runCase({ name: "removed-default", phaseIds: ["-default"], route: false, entryPrompt: "stop" });
    await runCase({ name: "stop-only", phaseIds: ["-default", "-compact"], route: false, entryPrompt: "stop" });
    await runCase({
      name: "no-phases",
      phaseIds: ["-default", "-stop", "-compact"],
      route: false,
    });
  } finally {
    await runtime.close();
  }
});

test("route describes a selected Stop Phase even when it is not auto-invocable", async () => {
  let request: LlmRequest | undefined;
  const stream: StreamFn = async function* (next) {
    request = next;
    yield { type: "done" as const, response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "disabled-auto-stop",
      definition: {
        name: "disabled-auto-stop",
        description: "Disabled auto Stop",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-compact"] },
      },
      phases: [
        phase("stop", { disableAutoInvocation: true }),
        phase("alpha"),
      ],
      stream,
      options: { idempotencyKey: "disabled-auto-stop-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "disabled-auto-stop-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(request!.tools?.find(({ name }) => name === "route")?.description)
      .toContain("built-in Stop Phase provides one");
  } finally {
    await runtime.close();
  }
});

test("two auto-invocable custom Phases with an explicit entry keep route and start at that entry", async () => {
  let request: LlmRequest | undefined;
  const stream: StreamFn = async function* (next) {
    request = next;
    yield { type: "done" as const, response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "two-custom-entry",
      definition: {
        name: "two-custom-entry",
        description: "Two custom Phases",
        prompt: "Run.",
        phases: {
          entryPhaseId: "alpha",
          phaseIds: ["-default", "-stop", "-compact"],
        },
      },
      phases: [phase("alpha"), phase("beta")],
      stream,
      options: { idempotencyKey: "two-custom-entry-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "two-custom-entry-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(toolsOf(request!)).toContain("route");
    expect(phasePrompt(request!, "alpha")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("manual Phases do not create a route catalog but an explicit entry still runs", async () => {
  let request: LlmRequest | undefined;
  const stream: StreamFn = async function* (next) {
    request = next;
    yield plainResponse("manual phases");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "manual-phase-count",
      definition: {
        name: "manual-phase-count",
        description: "Manual Phase count",
        prompt: "Run.",
        phases: {
          entryPhaseId: "alpha",
          phaseIds: ["-default", "-stop", "-compact"],
        },
      },
      phases: [
        phase("alpha", { disableAutoInvocation: true }),
        phase("beta", { disableAutoInvocation: true }),
      ],
      stream,
      options: { idempotencyKey: "manual-phase-count-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "manual-phase-count-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(toolsOf(request!)).not.toContain("route");
    expect(phasePrompt(request!, "alpha")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("no entry with a route catalog starts a Phase-less entry Loop and routes into a Phase", async () => {
  const requests: LlmRequest[] = [];
  let turn = 0;
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: routeResponse([{ phase: "alpha" }], "starting"),
      };
      return;
    }
    if (turn === 2) {
      yield {
        type: "done" as const,
        response: routeResponse([{ phase: "stop" }], ""),
      };
      return;
    }
    yield plainResponse("final");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-less-entry-loop",
      definition: {
        name: "phase-less-entry-loop",
        description: "Phase-less entry Loop",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-default"] },
      },
      phases: [phase("alpha")],
      stream,
      options: { idempotencyKey: "phase-less-entry-loop-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "phase-less-entry-loop-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "final" },
    });
    expect(requests).toHaveLength(3);
    expect(toolsOf(requests[0]!)).toContain("route");
    expect(phasePrompt(requests[0]!, "alpha")).toBe(false);
    expect(requests[0]!.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes("<phase_content"))).toBe(false);
    expect(phasePrompt(requests[1]!, "alpha")).toBe(true);
    expect(phasePrompt(requests[2]!, "stop")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("previous from the first routed Phase ends when the entry Loop has no previous Phase", async () => {
  const requests: LlmRequest[] = [];
  let turn = 0;
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: routeResponse([{ phase: "alpha" }], "start"),
      };
      return;
    }
    yield {
      type: "done" as const,
      response: routeResponse([{ phase: "previous" }], "alpha done"),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-less-previous",
      definition: {
        name: "phase-less-previous",
        description: "Phase-less previous",
        prompt: "Run.",
        phases: {
          entryPhaseId: null,
          phaseIds: ["-default", "-stop", "-compact"],
        },
      },
      phases: [phase("alpha"), phase("beta")],
      stream,
      options: { idempotencyKey: "phase-less-previous-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "phase-less-previous-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "alpha done" },
    });
    expect(turn).toBe(2);
    expect(toolsOf(requests[0]!)).toContain("route");
    expect(phasePrompt(requests[0]!, "alpha")).toBe(false);
    expect(phasePrompt(requests[1]!, "alpha")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("route(stop) is terminal in a Phase-less entry Loop without the Stop Phase", async () => {
  const requests: LlmRequest[] = [];
  let turn = 0;
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: routeResponse([{ phase: "alpha" }], "start"),
      };
      return;
    }
    yield {
      type: "done" as const,
      response: routeResponse([{ phase: "stop" }], ""),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-less-no-stop",
      definition: {
        name: "phase-less-no-stop",
        description: "No Stop Phase",
        prompt: "Run.",
        phases: {
          entryPhaseId: null,
          phaseIds: ["-default", "-stop", "-compact"],
        },
      },
      phases: [phase("alpha"), phase("beta")],
      stream,
      options: { idempotencyKey: "phase-less-no-stop-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "phase-less-no-stop-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(turn).toBe(2);
    expect(requests[1]!.messages.some((message) =>
      typeof message.content === "string"
      && message.content.includes('<phase_content name="stop">'))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("a Phase-less entry Loop suspends and resumes inside a Tool call", async () => {
  let turn = 0;
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: {
          content: "",
          toolCalls: [{ id: "ask-call", name: "ask", arguments: "{}" }],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    yield {
      type: "done" as const,
      response: routeResponse([{ phase: "stop" }], "resumed after approval"),
    };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "phase-less-tool-resume",
      definition: {
        name: "phase-less-tool-resume",
        description: "Tool resume",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-default"] },
      },
      phases: [phase("alpha")],
      tools: [{
        ...tool("ask"),
        execute: async (_args, invocation) => {
          const request = invocation.interaction.request({
            id: "entry-loop-approval",
            kind: "confirmation",
            prompt: "Approve?",
          });
          if (!invocation.interaction.answers().has(request.id)) {
            invocation.interaction.suspend({ checkpoint: { step: "entry-loop-approval" } });
          }
          return { ok: true as const, content: "approved" };
        },
      }],
      stream,
      options: { idempotencyKey: "phase-less-tool-resume-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "phase-less-tool-resume-run" });
    const waiting = await run.wait();
    if (waiting.type !== "input_required") throw new Error("Expected an interaction boundary.");
    await run.respondInteraction({
      interactionId: waiting.interactions[0]!.id,
      input: true,
    });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "resumed after approval" },
    });
    expect(turn).toBe(2);
    expect(toolsOf(requests[0]!)).toContain("route");
    expect(requests[0]!.messages.some((message) =>
      typeof message.content === "string"
      && message.content.includes("<phase_content"))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("a suspended Phase-less entry Loop resumes after Runtime restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-entry-loop-restart-"));
  const filename = join(directory, "runtime.sqlite");
  const configs = new InMemoryConfigProvider();
  let turn = 0;
  const stream: StreamFn = async function* () {
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: {
          content: "",
          toolCalls: [{ id: "restart-ask", name: "ask", arguments: "{}" }],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    yield {
      type: "done" as const,
      response: routeResponse([{ phase: "stop" }], "resumed after restart"),
    };
  };
  const askTool: Tool = {
    ...tool("ask"),
    execute: async (_args, invocation) => {
      const request = invocation.interaction.request({
        id: "restart-approval",
        kind: "confirmation" as const,
        prompt: "Approve after restart?",
      });
      if (!invocation.interaction.answers().has(request.id)) {
        invocation.interaction.suspend({ checkpoint: { step: "restart-approval" } });
      }
      return { ok: true as const, content: "approved" };
    },
  };
  let runId: string | undefined;
  try {
    const firstStore = new SqliteStore(filename);
    const firstRuntime = await AgentRuntime.init({ store: firstStore, configs, concurrency: 1 });
    try {
      const agentId = await createAgentWith(firstRuntime, {
        identity: "entry-loop-restart",
        definition: {
          name: "entry-loop-restart",
          description: "Entry Loop restart",
          prompt: "Run.",
          phases: { entryPhaseId: null, phaseIds: ["-default"] },
        },
        phases: [phase("alpha")],
        tools: [askTool],
        stream,
        options: { idempotencyKey: "entry-loop-restart-agent" },
      });
      const run = await firstRuntime.start(agentId, "go", {
        idempotencyKey: "entry-loop-restart-run",
      });
      runId = String(run.id);
      await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });
    } finally {
      await firstRuntime.close();
      firstStore.close();
    }

    const secondStore = new SqliteStore(filename);
    const secondRuntime = await AgentRuntime.init({ store: secondStore, configs, concurrency: 1 });
    try {
      const resumed = secondRuntime.run(runId as never);
      const waiting = await resumed.snapshot();
      expect(waiting.state).toBe("input_required");
      if (waiting.state !== "input_required") return;
      await resumed.respondInteraction({
        interactionId: waiting.interactions[0]!.id,
        input: true,
      });
      await expect(resumed.wait()).resolves.toMatchObject({
        type: "completed",
        outcome: { message: "resumed after restart" },
      });
      expect(turn).toBe(2);
    } finally {
      await secondRuntime.close();
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one auto-invocable Phase hosts a Single Loop with its own prompt, Tools, and Skills", async () => {
  let request: LlmRequest | undefined;
  const stream: StreamFn = async function* (next) {
    request = next;
    yield plainResponse("single loop done");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-custom-phase",
      definition: {
        name: "single-custom-phase",
        description: "Single custom Phase",
        prompt: "Agent prompt.",
        tools: ["lookup"],
        phases: {
          entryPhaseId: null,
          phaseIds: ["-default", "-stop", "-compact"],
        },
      },
      tools: [tool("lookup")],
      phases: [phase("alpha", {
        tools: ["lookup", "-bash"],
        promptGuidelines: ["Use the alpha lookup guidance."],
        skills: [{
          name: "alpha-skill",
          description: "Alpha guidance",
          filePath: "<alpha-skill>",
          baseDir: "<alpha-skill>",
          content: "Alpha skill instructions",
          disableModelInvocation: false,
        }],
      })],
      stream,
      options: { idempotencyKey: "single-custom-phase-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-custom-phase-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(toolsOf(request!)).not.toContain("route");
    expect(toolsOf(request!)).toContain("lookup");
    expect(toolsOf(request!)).not.toContain("bash");
    expect(phasePrompt(request!, "alpha")).toBe(true);
    expect(request!.system).toContain("Use the alpha lookup guidance.");
    expect(request!.system).toContain("<name>alpha-skill</name>");
  } finally {
    await runtime.close();
  }
});

test("a sole auto-invocable custom Phase hosts Single Loop even when compact remains selected", async () => {
  let request: LlmRequest | undefined;
  const stream: StreamFn = async function* (next) {
    request = next;
    yield plainResponse("custom loop");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-custom-with-compact",
      definition: {
        name: "single-custom-with-compact",
        description: "Single custom with compact",
        prompt: "Agent prompt.",
        phases: {
          entryPhaseId: null,
          phaseIds: ["-default", "-stop"],
        },
      },
      phases: [phase("alpha")],
      stream,
      options: { idempotencyKey: "single-custom-with-compact-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-custom-with-compact-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(toolsOf(request!)).not.toContain("route");
    expect(phasePrompt(request!, "alpha")).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("a removed route is an unknown Tool inside a Single Loop", async () => {
  const requests: LlmRequest[] = [];
  let turn = 0;
  const stream: StreamFn = async function* (request, context) {
    requests.push(request);
    turn += 1;
    expect((context as ProviderCallContext).tools.list().some(({ name }) => name === "route")).toBe(false);
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: {
          content: "",
          toolCalls: [{
            id: "route-call",
            name: "route",
            arguments: JSON.stringify({ decision: [{ phase: "stop" }] }),
          }],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    yield plainResponse("done");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-unknown-route",
      definition: {
        name: "single-unknown-route",
        description: "Unknown route",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-stop", "-compact"] },
      },
      stream,
      options: { idempotencyKey: "single-unknown-route-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-unknown-route-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1]!.messages)).toContain("Tool route is not available.");
  } finally {
    await runtime.close();
  }
});

test("the no-Phase Single Loop completes a Tool round through the existing hooks and loop", async () => {
  let executions = 0;
  let hookCalls = 0;
  const extension = loadExtensionFromFactory((api) => {
    api.hooks.on("before_tool_call", async () => {
      hookCalls += 1;
      return { allow: true };
    });
  }, process.cwd(), "<single-loop-hook>");
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => {
      await registry.loadExtensions([extension]);
    },
  });
  let turn = 0;
  const stream: StreamFn = async function* () {
    turn += 1;
    if (turn === 1) {
      yield {
        type: "done" as const,
        response: {
          content: "",
          toolCalls: [{ id: "echo-call", name: "echo", arguments: "{}" }],
          stopReason: "tool_use" as const,
        },
      };
      return;
    }
    yield plainResponse("tool round complete");
  };
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-loop-tool-round",
      definition: {
        name: "single-loop-tool-round",
        description: "Tool round",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-default", "-stop", "-compact"] },
      },
      tools: [{
        ...tool("echo"),
        execute: async () => {
          executions += 1;
          return { ok: true as const, content: "echo result" };
        },
      }],
      stream,
      options: { idempotencyKey: "single-loop-tool-round-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-loop-tool-round-run" });
    const boundary = await run.wait();
    expect(boundary).toMatchObject({ type: "completed", outcome: { message: "tool round complete" } });
    expect(turn).toBe(2);
    expect(executions).toBe(1);
    expect(hookCalls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("compact without an auto-invocable entry runs a Phase-less Single Loop", async () => {
  let firstRequest: LlmRequest | undefined;
  const stream: StreamFn = async function* (request) {
    firstRequest ??= request;
    yield plainResponse("compaction summary");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-compact-phase",
      definition: {
        name: "single-compact-phase",
        description: "Compact only",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-default", "-stop"] },
      },
      stream,
      options: { idempotencyKey: "single-compact-phase-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-compact-phase-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(firstRequest).toBeDefined();
    expect(toolsOf(firstRequest!)).not.toContain("route");
    expect(firstRequest!.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes("<phase_content"))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("removing compact disables its Control Phase Run through the existing missing-Phase path", async () => {
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "removed-compact-control",
      definition: {
        name: "removed-compact-control",
        description: "Removed compact",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-stop", "-compact"] },
      },
      stream: async function* () {
        yield plainResponse("unused");
      },
      options: { idempotencyKey: "removed-compact-control-agent" },
    });
    const run = await runtime.compactContext(agentId, {
      idempotencyKey: "removed-compact-control-run",
    });
    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: {
        code: "execution_failed",
        message: 'Phase "compact" not found in Configuration Snapshot.',
      },
    });
  } finally {
    await runtime.close();
  }
});

test("removing compact skips automatic pre-Run compaction", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield { type: "done" as const, response: stopResponse("chat reply") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "removed-compact-auto",
      definition: {
        name: "removed-compact-auto",
        description: "Removed compact auto",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-compact"] },
      },
      stream,
      model: { provider: "test", id: "model", contextWindow: 20_000 },
      options: {
        idempotencyKey: "removed-compact-auto-agent",
        historySeed: [{
          id: "removed-compact-seed-user" as never,
          agentId: "removed-compact-seed-agent" as never,
          runId: "removed-compact-seed-run" as never,
          role: "user",
          content: "x".repeat(20_000),
          sequenceWithinRun: 0,
          createdAt: "2026-11-04T00:00:00.000Z",
        }],
      },
    });
    const run = await runtime.start(agentId, "next", {
      idempotencyKey: "removed-compact-auto-run",
    });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "chat reply" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.messages.some((message) =>
      typeof message.content === "string"
      && message.content.includes('<phase_content name="compact">'))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("removing compact preserves the original context-overflow failure", async () => {
  let calls = 0;
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "removed-compact-overflow",
      definition: {
        name: "removed-compact-overflow",
        description: "Removed compact overflow",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-compact"] },
      },
      stream: async function* () {
        calls += 1;
        throw new Error("provider context window exceeded");
      },
      options: { idempotencyKey: "removed-compact-overflow-agent" },
    });
    const run = await runtime.start(agentId, "go", {
      idempotencyKey: "removed-compact-overflow-run",
    });
    await expect(run.wait()).resolves.toMatchObject({
      type: "failed",
      failure: { code: "execution_failed" },
    });
    expect(calls).toBe(1);
  } finally {
    await runtime.close();
  }
});

test("context overflow still compacts inside a default-only Single Loop", async () => {
  let calls = 0;
  let compactionPromptSeen = false;
  const stream: StreamFn = async function* (request) {
    calls += 1;
    const isCompaction = request.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes('<phase_content name="compact">'));
    compactionPromptSeen ||= isCompaction;
    if (calls === 1) throw new Error("provider context window exceeded");
    yield plainResponse(isCompaction ? "overflow summary" : "retried reply");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "single-loop-overflow",
      definition: {
        name: "single-loop-overflow",
        description: "Single Loop overflow",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-stop"] },
      },
      stream,
      options: { idempotencyKey: "single-loop-overflow-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "single-loop-overflow-run" });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "retried reply" },
    });
    expect(calls).toBe(3);
    expect(compactionPromptSeen).toBe(true);
    expect((await runtime.contextStatus(agentId)).coveredThrough).toBeDefined();
  } finally {
    await runtime.close();
  }
});

test("compact-only selection keeps automatic compression in the Phase-less Single Loop", async () => {
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    const isCompaction = request.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes('<phase_content name="compact">'));
    yield plainResponse(isCompaction ? "auto compact summary" : "chat reply");
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "compact-only-single-loop",
      definition: {
        name: "compact-only-single-loop",
        description: "Compact only",
        prompt: "Run.",
        phases: { entryPhaseId: null, phaseIds: ["-default", "-stop"] },
      },
      stream,
      model: { provider: "test", id: "model", contextWindow: 20_000 },
      options: {
        idempotencyKey: "compact-only-single-loop-agent",
        historySeed: [{
          id: "compact-seed-user" as never,
          agentId: "compact-seed-agent" as never,
          runId: "compact-seed-run" as never,
          role: "user",
          content: "x".repeat(20_000),
          sequenceWithinRun: 0,
          createdAt: "2026-11-04T00:00:00.000Z",
        }],
      },
    });
    const run = await runtime.start(agentId, "next", {
      idempotencyKey: "compact-only-single-loop-run",
    });
    await expect(run.wait()).resolves.toMatchObject({
      type: "completed",
      outcome: { message: "chat reply" },
    });
    expect(requests).toHaveLength(2);
    expect(toolsOf(requests[0]!)).not.toContain("route");
    expect(toolsOf(requests[1]!)).not.toContain("route");
    expect(requests[0]!.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes('<phase_content name="compact">'))).toBe(true);
    expect(requests[1]!.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes("[Context summary]"))).toBe(true);
    expect(requests[1]!.messages.some((message) =>
      typeof message.content === "string"
        && message.content.includes("<phase_content"))).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("a no-Phase Single Loop rebuilds the same reduced resources across Runtime restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-single-loop-restart-"));
  const filename = join(directory, "runtime.sqlite");
  const configs = new InMemoryConfigProvider();
  const requests: LlmRequest[] = [];
  const stream: StreamFn = async function* (request) {
    requests.push(request);
    yield plainResponse(`single loop ${requests.length}`);
  };
  try {
    const firstStore = new SqliteStore(filename);
    const firstRuntime = await AgentRuntime.init({ store: firstStore, configs, concurrency: 1 });
    try {
      const agentId = await createAgentWith(firstRuntime, {
        identity: "single-loop-restart",
        definition: {
          name: "single-loop-restart",
          description: "Restart",
          prompt: "Run.",
          phases: { entryPhaseId: null, phaseIds: ["-default", "-stop", "-compact"] },
        },
        stream,
        options: { idempotencyKey: "single-loop-restart-agent" },
      });
      const run = await firstRuntime.start(agentId, "go", { idempotencyKey: "single-loop-restart-run" });
      await expect(run.wait()).resolves.toMatchObject({
        type: "completed",
        outcome: { message: "single loop 1" },
      });
      expect(toolsOf(requests[0]!)).not.toContain("route");
    } finally {
      await firstRuntime.close();
      firstStore.close();
    }

    const secondStore = new SqliteStore(filename);
    const secondRuntime = await AgentRuntime.init({ store: secondStore, configs, concurrency: 1 });
    try {
      await seedResources(secondRuntime, {
        agents: [{
          name: "single-loop-restart",
          description: "Restart",
          prompt: "Run.",
          phases: { entryPhaseId: null, phaseIds: ["-default", "-stop", "-compact"] },
        }],
      });
      const agents = await secondRuntime.listAgents();
      const agentId = agents.items[0]!.id;
      const run = await secondRuntime.start(agentId, "again", {
        idempotencyKey: "single-loop-restart-second-run",
      });
      await expect(run.wait()).resolves.toMatchObject({
        type: "completed",
        outcome: { message: "single loop 2" },
      });
      expect(requests).toHaveLength(2);
      expect(toolsOf(requests[1]!)).not.toContain("route");
    } finally {
      await secondRuntime.close();
      secondStore.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

