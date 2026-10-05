import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryConfigProvider, InMemoryStore, SqliteStore } from "../../src/runtime";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { createAgentWith } from "../fixtures/configuration";

import { stopResponse } from "./route-test-utils";

test("context fields are present on before_tool_call and after_tool_call hooks", async () => {
  let beforeEvent: any;
  let afterEvent: any;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "test_tool",
      description: "A test tool",
      parameters: { type: "object", properties: { input: { type: "string" } } },
      execute: async (args: any) => ({ content: [{ type: "text", text: `Executed with ${args.input}` }] }),
    });
    api.hooks.on("before_tool_call", (event) => {
      beforeEvent = event;
      return { allow: true };
    });
    api.hooks.on("after_tool_call", (event) => {
      afterEvent = event;
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_test_tool";
      const args = JSON.stringify({ input: "hello" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "test_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "test_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "test_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done" }] } };
    yield { type: "done", response: stopResponse("done") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-context-fields",
      stream,
      options: { idempotencyKey: "agent-context-fields-key" },
    });
    const run = await runtime.start(agentId, "run test", {
      idempotencyKey: "run-context-fields-key",
      metadata: { tenantId: "tenant-123" },
    });

    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

    expect(beforeEvent).toBeDefined();
    expect(beforeEvent.runId).toBe(run.id);
    expect(beforeEvent.agentId).toBe(agentId);
    expect(beforeEvent.toolCallId).toBeDefined();
    expect(typeof beforeEvent.toolCallId).toBe("string");
    expect(beforeEvent.metadata).toEqual({ tenantId: "tenant-123" });
    expect(beforeEvent.tool.name).toBe("test_tool");
    expect(beforeEvent.args).toEqual({ input: "hello" });

    expect(afterEvent).toBeDefined();
    expect(afterEvent.runId).toBe(run.id);
    expect(afterEvent.agentId).toBe(agentId);
    expect(afterEvent.toolCallId).toBe(beforeEvent.toolCallId);
    expect(afterEvent.metadata).toEqual({ tenantId: "tenant-123" });
    expect(afterEvent.result).toBeDefined();
    expect(afterEvent.result.ok).toBe(true);
  } finally {
    await runtime.close();
  }
});

test("tool call interaction suspends into input_required and resumes with allow", async () => {
  let executionsCount = 0;
  let receivedArgs: any;
  let receivedAnswer: any;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "file_writer",
      description: "Write a file",
      parameters: { type: "object", properties: { path: { type: "string" }, data: { type: "string" } } },
      execute: async (args: any) => {
        executionsCount += 1;
        receivedArgs = args;
        return { content: [{ type: "text", text: "written" }] };
      },
    });

    api.hooks.on("before_tool_call", (event) => {
      if (event.answer !== undefined) {
        receivedAnswer = event.answer;
        return event.answer === "allow"
          ? { allow: true }
          : { allow: false, reason: "Permission denied by user" };
      }
      const args = event.args as Record<string, any>;
      return {
        interaction: {
          kind: "permission",
          prompt: `Allow writing to ${args.path}?`,
          payload: { path: args.path },
        },
      };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_write_1";
      const args = JSON.stringify({ path: "secrets.txt", data: "12345" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "file_writer", args }],
      };
      yield { type: "tool_call_start", id, name: "file_writer", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "file_writer", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "file written successfully", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "file written successfully" }] } };
    yield { type: "done", response: stopResponse("file written successfully") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-permission-allow",
      stream,
      options: { idempotencyKey: "agent-permission-allow-key" },
    });
    const run = await runtime.start(agentId, "write secret", { idempotencyKey: "run-permission-allow-key" });

    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");
    if (boundary.type !== "input_required") return;

    expect(boundary.interactions).toHaveLength(1);
    const interaction = boundary.interactions[0]!;
    expect(interaction.kind).toBe("permission");
    expect(interaction.prompt).toBe("Allow writing to secrets.txt?");
    expect(interaction.payload).toEqual({ path: "secrets.txt" });
    expect(interaction.status).toBe("pending");

    // Tool should not have executed yet
    expect(executionsCount).toBe(0);

    const snapshotBefore = await run.snapshot();
    expect(snapshotBefore.state).toBe("input_required");
    if (snapshotBefore.state === "input_required") {
      expect(snapshotBefore.interactions).toHaveLength(1);
    }

    // Answer allow
    await run.respondInteraction({ interactionId: interaction.id, input: "allow" });

    const finalBoundary = await run.wait();
    expect(finalBoundary.type).toBe("completed");

    expect(receivedAnswer).toBe("allow");
    expect(executionsCount).toBe(1);
    expect(receivedArgs).toEqual({ path: "secrets.txt", data: "12345" });

    const snapshotAfter = await run.snapshot();
    expect(snapshotAfter.state).toBe("completed");

    const history = await runtime.history(agentId) as any[];
    expect(history).toHaveLength(5);
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content).toBe("write secret");
    expect(history[1]!.role).toBe("assistant");
    expect(Array.isArray(history[1]!.content)).toBe(true);
    expect((history[1]!.content as any)[0].type).toBe("tool_use");
    expect(history[2]!.role).toBe("interaction");
    expect((history[2] as any).status).toBe("answered");
    expect((history[2] as any).answer).toBe("allow");
    expect(history[3]!.role).toBe("tool");
    expect(Array.isArray(history[3]!.content)).toBe(true);
    expect((history[3]!.content as any)[0].type).toBe("tool_result");
    expect(history[4]!.role).toBe("assistant");
    expect(history[4]!.content).toBe("file written successfully");
    // Stored history must not contain the prompt assistant message nor the answer user message
    expect(history.some((m) => (m as any).content === "Allow writing to secrets.txt?")).toBe(false);
    expect(history.some((m) => m.role === "user" && m.content === "allow")).toBe(false);
  } finally {
    await runtime.close();
  }
});

test("tool call interaction suspends into input_required and answer deny produces failed result without executing tool", async () => {
  let executionsCount = 0;
  let receivedAnswer: any;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "delete_db",
      description: "Delete database",
      parameters: { type: "object", properties: { db: { type: "string" } } },
      execute: async () => {
        executionsCount += 1;
        return { content: [{ type: "text", text: "deleted" }] };
      },
    });

    api.hooks.on("before_tool_call", (event) => {
      if (event.answer !== undefined) {
        receivedAnswer = event.answer;
        return event.answer === "allow"
          ? { allow: true }
          : { allow: false, reason: "Permission denied by host policy" };
      }
      const args = event.args as Record<string, any>;
      return {
        interaction: {
          kind: "permission",
          prompt: `Confirm deleting ${args.db}?`,
        },
      };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  let sawToolResultError: string | undefined;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_delete_db";
      const args = JSON.stringify({ db: "production" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "delete_db", args }],
      };
      yield { type: "tool_call_start", id, name: "delete_db", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "delete_db", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolMsg = request.messages.find((m) => m.role === "tool");
    if (toolMsg && Array.isArray(toolMsg.content)) {
      const part = toolMsg.content.find((p: any) => p.type === "tool_result");
      if (part && "content" in part) sawToolResultError = String(part.content);
    }
    yield { type: "text_delta", text: "operation aborted", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "operation aborted" }] } };
    yield { type: "done", response: stopResponse("operation aborted") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-permission-deny",
      stream,
      options: { idempotencyKey: "agent-permission-deny-key" },
    });
    const run = await runtime.start(agentId, "drop db", { idempotencyKey: "run-permission-deny-key" });

    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");
    if (boundary.type !== "input_required") return;

    expect(executionsCount).toBe(0);

    // Answer deny
    await run.respondInteraction({ interactionId: boundary.interactions[0]!.id, input: "deny" });

    const finalBoundary = await run.wait();
    expect(finalBoundary.type).toBe("completed");

    expect(receivedAnswer).toBe("deny");
    // Tool was never executed
    expect(executionsCount).toBe(0);
    // Model received the failure
    expect(sawToolResultError).toContain("Permission denied by host policy");
  } finally {
    await runtime.close();
  }
});

test("tool call interaction survives process restart/rehydrate while pending then answers allow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rowan-tool-restart-"));
  const dbPath = join(dir, "runtime.sqlite");

  let executionsCount = 0;

  const createExtension = () => loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "safe_tool",
      description: "A tool requiring approval",
      parameters: { type: "object", properties: { key: { type: "string" } } },
      execute: async () => {
        executionsCount += 1;
        return { content: [{ type: "text", text: "success" }] };
      },
    });

    api.hooks.on("before_tool_call", (event) => {
      if (event.answer !== undefined) {
        return event.answer === "yes"
          ? { allow: true }
          : { allow: false, reason: "Host rejected" };
      }
      return {
        interaction: {
          kind: "confirmation",
          prompt: "Approve execution?",
        },
      };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_restart_1";
      const args = JSON.stringify({ key: "val" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "safe_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "safe_tool", partial };
      yield { type: "tool_call_delta", id, arguments: args, partial };
      yield { type: "tool_call_end", id, name: "safe_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "done after restart", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "done after restart" }] } };
    yield { type: "done", response: stopResponse("done after restart") };
  };

  const configs = new InMemoryConfigProvider();
  const store1 = new SqliteStore(dbPath);
  const runtime1 = await AgentRuntime.init({
    store: store1,
    configs,
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([createExtension()]); },
  });

  let agentId: any;
  let runId: any;
  let interactionId: any;

  try {
    agentId = await createAgentWith(runtime1, {
      identity: "agent-tool-restart",
      stream,
      options: { idempotencyKey: "agent-tool-restart-key" },
    });
    const run = await runtime1.start(agentId, "test restart", { idempotencyKey: "run-tool-restart-key" });
    runId = run.id;

    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");
    if (boundary.type !== "input_required") return;

    interactionId = boundary.interactions[0]!.id;
    expect(interactionId).toBeDefined();
    expect(executionsCount).toBe(0);
  } finally {
    // Simulate process shutdown
    await runtime1.close();
  }

  // Rehydrate in a new runtime instance
  const store2 = new SqliteStore(dbPath);
  const runtime2 = await AgentRuntime.init({
    store: store2,
    configs,
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([createExtension()]); },
  });

  try {
    const run2 = runtime2.run(runId);
    const snapshot = await run2.snapshot();
    expect(snapshot.state).toBe("input_required");
    if (snapshot.state === "input_required") {
      expect(snapshot.interactions).toHaveLength(1);
      expect(snapshot.interactions[0]!.id).toBe(interactionId);
    }

    // Answer the interaction in the new process
    await run2.respondInteraction({ interactionId, input: "yes" });

    const finalBoundary = await run2.wait();
    expect(finalBoundary.type).toBe("completed");
    expect(executionsCount).toBe(1);

    const historyAfterRestart = await runtime2.history(agentId) as any[];
    expect(historyAfterRestart.some((m) => m.content === "Approve execution?")).toBe(false);
    expect(historyAfterRestart.some((m) => m.content === "yes")).toBe(false);
  } finally {
    await runtime2.close();
  }
});

test("stop/cancel while pending interaction moves run to cancelled and tool is not executed", async () => {
  let executionsCount = 0;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "cancellable_tool",
      description: "A tool to cancel",
      parameters: { type: "object", properties: { x: { type: "number" } } },
      execute: async () => {
        executionsCount += 1;
        return { content: [{ type: "text", text: "42" }] };
      },
    });

    api.hooks.on("before_tool_call", () => {
      return {
        interaction: {
          kind: "permission",
          prompt: "Allow cancellable tool?",
        },
      };
    });
  }, process.cwd(), "<runtime-extension>");

  const stream: StreamFn = async function* () {
    const id = "call_cancellable";
    const args = JSON.stringify({ x: 1 });
    const partial = {
      role: "assistant" as const,
      contentBlocks: [{ type: "tool_call" as const, id, name: "cancellable_tool", args }],
    };
    yield { type: "tool_call_start", id, name: "cancellable_tool", partial };
    yield { type: "tool_call_delta", id, arguments: args, partial };
    yield { type: "tool_call_end", id, name: "cancellable_tool", arguments: args, partial };
    yield { type: "done" };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-cancel-pending",
      stream,
      options: { idempotencyKey: "agent-cancel-pending-key" },
    });
    const run = await runtime.start(agentId, "will cancel", { idempotencyKey: "run-cancel-pending-key" });

    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");

    // Cancel while pending
    const cancelResult = await run.cancel("Cancelled by test");
    expect(cancelResult.type).toBe("cancelled");

    const snapshot = await run.snapshot();
    expect(snapshot.state).toBe("cancelled");
    expect(executionsCount).toBe(0);
  } finally {
    await runtime.close();
  }
});

test("legacy {allow:false} hook denies tool execution without suspending", async () => {
  let executionsCount = 0;

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "legacy_tool",
      description: "Legacy tool",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        executionsCount += 1;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    api.hooks.on("before_tool_call", () => {
      return { allow: false, reason: "Legacy denial reason" };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  let receivedError: string | undefined;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_legacy";
      const args = "{}";
      const partial = {
        role: "assistant" as const,
        contentBlocks: [{ type: "tool_call" as const, id, name: "legacy_tool", args }],
      };
      yield { type: "tool_call_start", id, name: "legacy_tool", partial };
      yield { type: "tool_call_end", id, name: "legacy_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolMsg = request.messages.find((m) => m.role === "tool");
    if (toolMsg && Array.isArray(toolMsg.content)) {
      const part = toolMsg.content.find((p: any) => p.type === "tool_result");
      if (part && "content" in part) receivedError = String(part.content);
    }
    yield { type: "text_delta", text: "handled legacy denial", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "handled legacy denial" }] } };
    yield { type: "done", response: stopResponse("handled legacy denial") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-legacy-deny",
      stream,
      options: { idempotencyKey: "agent-legacy-deny-key" },
    });
    const run = await runtime.start(agentId, "test legacy deny", { idempotencyKey: "run-legacy-deny-key" });

    // Should complete directly without input_required
    const finalBoundary = await run.wait();
    expect(finalBoundary.type).toBe("completed");
    expect(executionsCount).toBe(0);
    expect(receivedError).toContain("Legacy denial reason");
  } finally {
    await runtime.close();
  }
});

test("multiple tool calls in one assistant turn: sequential suspension per call", async () => {
  const executed: string[] = [];

  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "tool_a",
      description: "First tool",
      parameters: { type: "object", properties: { a: { type: "string" } } },
      execute: async (args: any) => {
        executed.push(`tool_a:${args.a}`);
        return { content: [{ type: "text", text: "res_a" }] };
      },
    });

    api.tools.register({
      name: "tool_b",
      description: "Second tool",
      parameters: { type: "object", properties: { b: { type: "string" } } },
      execute: async (args: any) => {
        executed.push(`tool_b:${args.b}`);
        return { content: [{ type: "text", text: "res_b" }] };
      },
    });

    api.hooks.on("before_tool_call", (event) => {
      if (event.answer !== undefined) {
        return event.answer === "allow"
          ? { allow: true }
          : { allow: false, reason: "Denied" };
      }
      return {
        interaction: {
          kind: "permission",
          prompt: `Permission for ${event.tool.name}?`,
          payload: { tool: event.tool.name },
        },
      };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* () {
    modelCalls += 1;
    if (modelCalls === 1) {
      const idA = "call_a";
      const argsA = JSON.stringify({ a: "1" });
      const idB = "call_b";
      const argsB = JSON.stringify({ b: "2" });
      const partial = {
        role: "assistant" as const,
        contentBlocks: [
          { type: "tool_call" as const, id: idA, name: "tool_a", args: argsA },
          { type: "tool_call" as const, id: idB, name: "tool_b", args: argsB },
        ],
      };
      yield { type: "tool_call_start", id: idA, name: "tool_a", partial };
      yield { type: "tool_call_delta", id: idA, arguments: argsA, partial };
      yield { type: "tool_call_end", id: idA, name: "tool_a", arguments: argsA, partial };
      yield { type: "tool_call_start", id: idB, name: "tool_b", partial };
      yield { type: "tool_call_delta", id: idB, arguments: argsB, partial };
      yield { type: "tool_call_end", id: idB, name: "tool_b", arguments: argsB, partial };
      yield { type: "done" };
      return;
    }
    yield { type: "text_delta", text: "both finished", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "both finished" }] } };
    yield { type: "done", response: stopResponse("both finished") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });

  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-multi-tools",
      stream,
      options: { idempotencyKey: "agent-multi-tools-key" },
    });
    const run = await runtime.start(agentId, "run both", { idempotencyKey: "run-multi-tools-key" });

    // First tool suspends
    const boundary1 = await run.wait();
    expect(boundary1.type).toBe("input_required");
    if (boundary1.type !== "input_required") return;
    expect(boundary1.interactions).toHaveLength(1);
    expect(boundary1.interactions[0]!.prompt).toBe("Permission for tool_a?");
    expect(executed).toEqual([]);

    // Answer first tool
    await run.respondInteraction({ interactionId: boundary1.interactions[0]!.id, input: "allow" });

    // Second tool suspends
    const boundary2 = await run.wait();
    expect(boundary2.type).toBe("input_required");
    if (boundary2.type !== "input_required") return;
    expect(boundary2.interactions).toHaveLength(1);
    expect(boundary2.interactions[0]!.prompt).toBe("Permission for tool_b?");
    // tool_a has executed once
    expect(executed).toEqual(["tool_a:1"]);

    // Answer second tool
    await run.respondInteraction({ interactionId: boundary2.interactions[0]!.id, input: "allow" });

    // Both should now be complete
    const finalBoundary = await run.wait();
    expect(finalBoundary.type).toBe("completed");
    expect(executed).toEqual(["tool_a:1", "tool_b:2"]);
  } finally {
    await runtime.close();
  }
});

test("a Tool execute interaction resumes with its answer and checkpoint, while cancellation does not re-enter it", async () => {
  const executions: Array<{ answer: unknown; checkpoint: unknown }> = [];
  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "interactive_tool",
      description: "Ask during execution",
      parameters: { type: "object", properties: {} },
      execute: async (_args, context) => {
        executions.push({
          answer: context.interaction.answers().get("tool_question"),
          checkpoint: context.interaction.checkpoint(),
        });
        const request = context.interaction.request({
          id: "tool_question",
          kind: "elicitation",
          prompt: "Choose a value",
          result: { answered: "Selected {{answer}} for {{prompt}}" },
        });
        if (!context.interaction.answers().has(request.id)) {
          context.interaction.suspend({ checkpoint: { step: "after-question" } });
        }
        return { content: [{ type: "text", text: String(context.interaction.answers().get(request.id)) }] };
      },
    });
  }, process.cwd(), "<runtime-extension>");

  const toolStream: StreamFn = async function* (request) {
    if (!request.messages.some((message) => message.role === "tool")) {
      const id = "call_interactive";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "interactive_tool", args }] };
      yield { type: "tool_call_start", id, name: "interactive_tool", partial };
      yield { type: "tool_call_end", id, name: "interactive_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const toolMessage = request.messages.find((message) => message.role === "tool");
    const toolResult = JSON.parse((toolMessage?.content as any[])[0].content);
    expect(toolResult.content).toContain('Selected {"choice":"blue"} for Choose a value');
    yield { type: "text_delta", text: "finished", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "finished" }] } };
    yield { type: "done", response: stopResponse("finished") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-execute-interaction",
      stream: toolStream,
      options: { idempotencyKey: "agent-execute-interaction-key" },
    });
    const run = await runtime.start(agentId, "ask the tool", { idempotencyKey: "run-execute-interaction-key" });
    const boundary = await run.wait();
    expect(boundary.type).toBe("input_required");
    if (boundary.type !== "input_required") return;
    expect(boundary.interactions).toMatchObject([{ toolCallId: expect.any(String), kind: "elicitation" }]);
    await run.respondInteraction({ interactionId: "tool_question", input: { choice: "blue" } });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(executions).toEqual([
      { answer: undefined, checkpoint: undefined },
      { answer: { choice: "blue" }, checkpoint: { step: "after-question" } },
    ]);
  } finally {
    await runtime.close();
  }
});

test("a new Agent Input reaches a suspended before_tool_call hook as a replied answer", async () => {
  const answers: unknown[] = [];
  let executions = 0;
  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "approval_tool",
      description: "A tool that needs approval",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        executions += 1;
        return { content: [{ type: "text", text: "executed" }] };
      },
    });
    api.hooks.on("before_tool_call", (event) => {
      answers.push(event.answer);
      if (event.answer !== undefined) return { allow: false, reason: "Permission denied by user" };
      return { interaction: { kind: "permission", prompt: "Allow this tool?" } };
    });
  }, process.cwd(), "<runtime-extension>");

  let modelCalls = 0;
  const stream: StreamFn = async function* (request) {
    modelCalls += 1;
    if (modelCalls === 1) {
      const id = "call_approval";
      const args = "{}";
      const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "approval_tool", args }] };
      yield { type: "tool_call_start", id, name: "approval_tool", partial };
      yield { type: "tool_call_end", id, name: "approval_tool", arguments: args, partial };
      yield { type: "done" };
      return;
    }
    const result = request.messages.flatMap((message) =>
      message.role === "tool" && Array.isArray(message.content) ? message.content : [],
    ).find((part) => part.type === "tool_result");
    expect(result && "content" in result ? result.content : undefined).toContain("Permission denied by user");
    yield { type: "text_delta", text: "refused", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "refused" }] } };
    yield { type: "done", response: stopResponse("refused") };
  };

  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-replied-tool-interaction",
      stream,
      options: { idempotencyKey: "agent-replied-tool-interaction" },
    });
    const run = await runtime.start(agentId, "try the tool", { idempotencyKey: "run-replied-tool-interaction" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });

    const resumed = await runtime.start(agentId, "I changed my mind", { idempotencyKey: "run-replied-tool-message" });
    expect(resumed.id).toBe(run.id);
    const boundary = await Promise.race([
      run.wait(),
      Bun.sleep(2_000).then(() => undefined),
    ]);
    expect(boundary?.type).toBe("completed");
    expect(answers).toEqual([undefined, { status: "replied", reply: "I changed my mind" }]);
    const history = await runtime.history(agentId);
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "I changed my mind" }),
      expect.objectContaining({
        role: "tool",
        content: [expect.objectContaining({ result: { ok: false, content: null, error: "Permission denied by user" } })],
      }),
    ]));
    expect(executions).toBe(0);
    expect(await run.snapshot()).toMatchObject({ state: "completed", toolCallCount: 1 });
  } finally {
    await runtime.close();
  }
});

test("cancelling a Tool execute interaction does not re-enter the Tool", async () => {
  let executions = 0;
  const extension = loadExtensionFromFactory((api) => {
    api.tools.register({
      name: "cancelled_interactive_tool",
      description: "Ask before continuing",
      parameters: { type: "object", properties: {} },
      execute: async (_args, context) => {
        executions += 1;
        const request = context.interaction.request({ kind: "permission", prompt: "Continue?" });
        context.interaction.suspend({ checkpoint: { requestId: request.id } });
        return { content: [{ type: "text", text: "cancelled" }] };
      },
    });
  }, process.cwd(), "<runtime-extension>");
  const stream: StreamFn = async function* () {
    const id = "call_cancel_interactive";
    const args = "{}";
    const partial = { role: "assistant" as const, contentBlocks: [{ type: "tool_call" as const, id, name: "cancelled_interactive_tool", args }] };
    yield { type: "tool_call_start", id, name: "cancelled_interactive_tool", partial };
    yield { type: "tool_call_end", id, name: "cancelled_interactive_tool", arguments: args, partial };
    yield { type: "done" };
  };
  const runtime = await AgentRuntime.init({
    store: new InMemoryStore(),
    concurrency: 1,
    bootstrap: async (registry) => { await registry.loadExtensions([extension]); },
  });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "agent-cancel-execute-interaction",
      stream,
      options: { idempotencyKey: "agent-cancel-execute-interaction-key" },
    });
    const run = await runtime.start(agentId, "cancel the tool", { idempotencyKey: "run-cancel-execute-interaction-key" });
    await expect(run.wait()).resolves.toMatchObject({ type: "input_required" });
    await expect(run.cancel("cancel pending tool interaction")).resolves.toMatchObject({ type: "cancelled" });
    expect(executions).toBe(1);
  } finally {
    await runtime.close();
  }
});

