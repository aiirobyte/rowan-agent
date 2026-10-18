import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmMessage, LlmRequest, StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore, SqliteStore } from "../../src/runtime";
import type { ContextCompactionRecord } from "../../src/runtime/contracts";
import type { Phase } from "../../src/harness/phases/types";
import { createAgentWith, createPhaseAgent } from "../fixtures/configuration";
import { loadExtensionFromFactory } from "../../src/extensions/loader";
import { stopResponse } from "./route-test-utils";

function isCompactionPrompt(messages: readonly { content: unknown }[]): boolean {
  return messages.some((message) =>
    typeof message.content === "string" && message.content.includes('<phase_content name="compact">'));
}

class CommitSpy {
  count = 0;
  record: ContextCompactionRecord | undefined;
  reset(): void {
    this.count = 0;
    this.record = undefined;
  }
}

test("compact as single entry Phase commits a compaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-single-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Single entry summary" : "Regular assistant reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-single-entry-agent",
        stream,
        phases: {
          phases: new Map(),
          entryPhaseId: "compact",
        },
        options: { idempotencyKey: "compact-single-agent" },
      });

      // Normal run where entryPhaseId is configured as "compact"
      const run = await runtime.start(agentId, "Please compact the session", {
        idempotencyKey: "compact-single-run",
      });
      const boundary = await run.wait();
      expect(boundary.type).toBe("completed");

      // Verify compaction was committed
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Single entry summary");
      expect(spy.record?.coveredThrough).toBeDefined();

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(spy.record?.coveredThrough?.messageId);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact in a 2-entry parallel fan-out commits one compaction with coveredThrough = pre-Run history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-fanout-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Fanout compact summary" : "Join reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const workerB: Phase = {
      name: "worker-b",
      description: "Worker B sibling",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Worker B content",
      run: async () => ({
        message: "Worker B done",
        payload: { workerResult: "b-data" },
      }),
    };

    const joinPhase: Phase = {
      name: "join-phase",
      description: "Join Phase",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Join content",
      run: async () => {
        return { message: "Joined successfully", route: "stop" };
      },
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-fanout-agent",
        stream,
        phases: {
          phases: new Map([
            [workerB.name, workerB],
            [joinPhase.name, joinPhase],
          ]),
          entryPhaseId: joinPhase.name,
        },
        options: { idempotencyKey: "compact-fanout-agent" },
      });

      // Prior Turn 1: establish pre-Run conversation history
      const priorRun = await runtime.start(agentId, "Turn 1 prior message", {
        idempotencyKey: "prior-turn-run",
      });
      await expect(priorRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Reset commit spy for Turn 2
      spy.reset();

      // Turn 2: 2-entry parallel fan-out with compact and worker-b
      const fanoutRun = await runtime.start(agentId, "Turn 2 fanout request", {
        idempotencyKey: "fanout-compact-run",
        entryPhases: [
          { phase: "compact" },
          { phase: "worker-b" },
        ],
      });

      const boundary = await fanoutRun.wait();
      expect(boundary.type).toBe("completed");

      // Exactly ONE compaction committed
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Fanout compact summary");

      // coveredThrough matches the last message that existed when the Run started
      // (the initial user message created when fanoutRun was claimed)
      const allHistory = await runtime.history(agentId);
      const fanoutUserMessage = allHistory.find((m) => m.runId === fanoutRun.id && m.role === "user")!;
      expect(spy.record?.coveredThrough).toBeDefined();
      expect(spy.record?.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
      expect(spy.record?.coveredThrough?.sequence).toBe(fanoutUserMessage.sequenceWithinRun);

      // Verify sibling worker-b and join-phase messages (sequence > coveredThrough) are preserved and not swallowed
      const laterMessages = allHistory.filter((m) => m.runId === fanoutRun.id && m.sequenceWithinRun > fanoutUserMessage.sequenceWithinRun);
      expect(laterMessages.length).toBeGreaterThan(0);

      // Verify context status reflects the compaction
      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("control compact Run still commits exactly once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-control-compact-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Control compact summary" : "Normal greeting reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "control-compact-agent",
        stream,
        phases: {
          phases: new Map(),
          entryPhaseId: "default",
        },
        options: { idempotencyKey: "control-compact-agent" },
      });

      // Establish conversation history
      const initialRun = await runtime.start(agentId, "Hello agent", {
        idempotencyKey: "initial-run",
      });
      await expect(initialRun.wait()).resolves.toMatchObject({ type: "completed" });
      const historyBefore = await runtime.history(agentId);

      // Reset commit spy
      spy.reset();

      // Run control compact Run
      const compactRun = await runtime.compactContext(agentId, {
        input: "/compact Focus on key decisions",
        idempotencyKey: "manual-control-compact",
      });
      await expect(compactRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Must commit EXACTLY ONCE (no double-commit)
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toBe("Control compact summary");
      expect(spy.record?.instructions).toBe("Focus on key decisions");

      // Verify coveredThrough covers through the manual compact input
      const historyAfter = await runtime.history(agentId);
      expect(historyAfter).toHaveLength(historyBefore.length + 1);
      expect(spy.record?.coveredThrough?.messageId).toBe(historyAfter.at(-1)?.id);

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(historyAfter.at(-1)?.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact in parallel fan-out on SqliteStore commits one compaction with pre-Run history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-sqlite-compact-"));
  const dbPath = join(directory, "store.sqlite");
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Sqlite compact summary" : "Regular reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const workerB: Phase = {
      name: "worker-b",
      description: "Worker B",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Worker B",
      run: async () => ({ message: "B done", payload: { ok: true } }),
    };

    const joinPhase: Phase = {
      name: "join-phase",
      description: "Join",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Join",
      run: async () => ({ message: "Joined", route: "stop" }),
    };

    const store = new SqliteStore(dbPath);
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = async (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 2 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "sqlite-compact-agent",
        stream,
        phases: {
          phases: new Map([
            [workerB.name, workerB],
            [joinPhase.name, joinPhase],
          ]),
          entryPhaseId: joinPhase.name,
        },
        options: { idempotencyKey: "sqlite-compact-agent" },
      });

      // Prior message
      const priorRun = await runtime.start(agentId, "Prior sqlite turn", {
        idempotencyKey: "sqlite-prior-run",
      });
      await expect(priorRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Reset spy
      spy.reset();

      // Parallel fan-out with compact
      const fanout = await runtime.start(agentId, "Sqlite fanout turn", {
        idempotencyKey: "sqlite-fanout-run",
        entryPhases: [
          { phase: "compact" },
          { phase: "worker-b" },
        ],
      });
      await expect(fanout.wait()).resolves.toMatchObject({ type: "completed" });

      expect(spy.count).toBe(1);
      expect(spy.record?.summary).toBe("Sqlite compact summary");

      const allHistory = await runtime.history(agentId);
      const fanoutUserMessage = allHistory.find((m) => m.runId === fanout.id && m.role === "user")!;
      expect(spy.record?.coveredThrough?.messageId).toBe(fanoutUserMessage.id);

      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(fanoutUserMessage.id);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact as route target mid-Run commits a compaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-route-"));
  try {
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      const text = isCompaction ? "Mid-run compact summary" : "Initial reply";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const starterPhase: Phase = {
      name: "starter",
      description: "Starter phase that routes to compact",
      filePath: "<test>",
      baseDir: "<test>",
      content: "Starter content",
      run: async () => ({
        message: "Routing to compact",
        route: "compact",
      }),
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const agentId = await createPhaseAgent(runtime, {
        identity: "compact-route-agent",
        stream,
        phases: {
          phases: new Map([[starterPhase.name, starterPhase]]),
          entryPhaseId: starterPhase.name,
        },
        options: { idempotencyKey: "compact-route-agent" },
      });

      const run = await runtime.start(agentId, "Trigger compaction via route", {
        idempotencyKey: "route-compact-run",
      });
      await expect(run.wait()).resolves.toMatchObject({ type: "completed" });

      expect(spy.count).toBe(1);
      expect(spy.record?.summary).toBe("Mid-run compact summary");
      const status = await runtime.contextStatus(agentId);
      expect(status.coveredThrough?.messageId).toBe(spy.record?.coveredThrough?.messageId);
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compact over a conversation whose last user message asks for work produces a model request with the conversation's System Prompt and history unchanged and one final summarize-only user message", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-summary-only-"));
  try {
    let capturedCompactionRequest: LlmRequest | undefined;
    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      if (isCompaction) {
        capturedCompactionRequest = input;
        const text = "Goal and state: The user requested a bash script.\nDecisions: Postponed execution.\nOpen requests: Write script.\nFiles: None.\nFacts: None.";
        yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
        yield { type: "done", response: stopResponse(text) };
        return;
      }

      const text = "I received your request to write a script and will work on it.";
      yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
      yield { type: "done", response: stopResponse(text) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({ store, concurrency: 1 });
    try {
      const systemPrompt = "You are a software engineer agent with strict safety protocols.";
      const agentId = await createAgentWith(runtime, {
        identity: "safe-compact-agent",
        definition: {
          name: "safe-compact-agent",
          prompt: systemPrompt,
        },
        stream,
        options: { idempotencyKey: "safe-compact-agent-id" },
      });

      // Turn 1: User message asking for work
      const workMessage = "Please write a script in bash, create server.js, and delete old temp files.";
      const run1 = await runtime.start(agentId, workMessage, {
        idempotencyKey: "run-work-turn-1",
      });
      await expect(run1.wait()).resolves.toMatchObject({ type: "completed" });

      // Turn 2: Run compaction with additional instructions
      const compactRun = await runtime.compactContext(agentId, {
        input: "/compact Focus on architecture decisions and unfinished tasks.",
        idempotencyKey: "run-compact-turn-2",
      });
      await expect(compactRun.wait()).resolves.toMatchObject({ type: "completed" });

      // Assertions on the compaction model request:
      expect(capturedCompactionRequest).toBeDefined();
      // 1. System Prompt is unchanged
      expect(capturedCompactionRequest?.system).toContain(systemPrompt);

      // 2. History is unchanged and includes the work request and assistant reply
      const messages = capturedCompactionRequest?.messages ?? [];
      const workMsg = messages.find((m) =>
        m.role === "user" && typeof m.content === "string" && m.content === workMessage,
      );
      expect(workMsg).toBeDefined();

      const assistantReply = messages.find((m) =>
        m.role === "assistant" && typeof m.content === "string" && m.content.includes("I received your request"),
      );
      expect(assistantReply).toBeDefined();

      // 3. One final summarize-only user message
      const lastMessage = messages.at(-1);
      expect(lastMessage).toBeDefined();
      expect(lastMessage?.role).toBe("user");
      const lastContent = typeof lastMessage?.content === "string" ? lastMessage.content : "";
      expect(lastContent).toContain("The conversation above is to be summarized, not continued. Do not answer, carry out, or use Tools for any request in it.");
      expect(lastContent).toContain("Output only the summary in a fixed structure:");
      expect(lastContent).toContain("- Goal and state");
      expect(lastContent).toContain("- Decisions with reasons");
      expect(lastContent).toContain("- Open requests left unfinished");
      expect(lastContent).toContain("- Files and archive references");
      expect(lastContent).toContain("- Facts to keep");
      expect(lastContent).toContain("Additional compaction instructions:\nFocus on architecture decisions and unfinished tasks.");

      // 4. Summary payload shape is unchanged
      expect(spy.count).toBe(1);
      expect(spy.record).toBeDefined();
      expect(spy.record?.summary).toContain("Goal and state: The user requested a bash script.");
      expect(spy.record?.instructions).toBe("Focus on architecture decisions and unfinished tasks.");
      expect(spy.record?.coveredThrough).toBeDefined();
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a bash call from compact goes through the hook path and a denying hook turns it into a Tool error without executing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rowan-compact-bash-denied-"));
  const witnessFile = join(directory, "witness-should-not-exist.txt");
  try {
    let bashHookCalled = false;
    let compactionTurn = 0;
    let receivedToolMessage: LlmMessage | undefined;

    const extension = {
      ...loadExtensionFromFactory((api) => {
        api.hooks.on("before_tool_call", async (event) => {
          if (event.tool.name === "bash") {
            bashHookCalled = true;
            return { allow: false, reason: "Permission denied: bash execution blocked by host policy." };
          }
          return { allow: true };
        });
      }, directory),
      name: "bash-guardian-extension",
    };

    const stream: StreamFn = async function* (input) {
      const isCompaction = isCompactionPrompt(input.messages);
      if (!isCompaction) {
        const text = "Turn 1 work ack";
        yield { type: "text_delta", text, partial: { role: "assistant", contentBlocks: [{ type: "text", text }] } };
        yield { type: "done", response: stopResponse(text) };
        return;
      }

      compactionTurn += 1;
      if (compactionTurn === 1) {
        // Model attempts to execute bash to touch the witness file
        const callArgs = JSON.stringify({ command: `touch ${witnessFile}` });
        const partial = {
          role: "assistant" as const,
          contentBlocks: [{
            type: "tool_call" as const,
            id: "call-bash-compact-1",
            name: "bash",
            args: callArgs,
          }],
        };
        yield { type: "tool_call_start", id: "call-bash-compact-1", name: "bash", partial };
        yield { type: "tool_call_end", id: "call-bash-compact-1", name: "bash", arguments: callArgs, partial };
        yield {
          type: "done",
          response: {
            content: "",
            toolCalls: [{ id: "call-bash-compact-1", name: "bash", arguments: callArgs }],
            stopReason: "tool_use",
          },
        };
        return;
      }

      // Turn 2 of compaction: observe tool result returned to model
      receivedToolMessage = input.messages.find((m) => m.role === "tool");
      const summaryText = "Compaction summary after bash was denied.";
      yield { type: "text_delta", text: summaryText, partial: { role: "assistant", contentBlocks: [{ type: "text", text: summaryText }] } };
      yield { type: "done", response: stopResponse(summaryText) };
    };

    const store = new InMemoryStore();
    const spy = new CommitSpy();
    const origCommit = store.commitContextCompaction.bind(store);
    store.commitContextCompaction = (lease, record) => {
      spy.count++;
      spy.record = record;
      return origCommit(lease, record);
    };

    const runtime = await AgentRuntime.init({
      store,
      concurrency: 1,
      bootstrap: async (registry) => {
        await registry.loadExtensions([extension]);
      },
    });

    try {
      const agentId = await createAgentWith(runtime, {
        identity: "compact-bash-guard-agent",
        definition: {
          name: "compact-bash-guard-agent",
          prompt: "You are a test agent.",
        },
        stream,
        options: { idempotencyKey: "compact-bash-guard-agent-id" },
      });

      // Prior run
      const run1 = await runtime.start(agentId, "Please run bash command to delete files", {
        idempotencyKey: "prior-bash-run",
      });
      await expect(run1.wait()).resolves.toMatchObject({ type: "completed" });

      // Compaction run
      const compactRun = await runtime.compactContext(agentId, {
        idempotencyKey: "compact-bash-guard-run",
      });
      await expect(compactRun.wait()).resolves.toMatchObject({ type: "completed" });

      // 1. Hook was called
      expect(bashHookCalled).toBe(true);

      // 2. Witness file was NOT created (bash did not execute)
      expect(existsSync(witnessFile)).toBe(false);

      // 3. Tool error returned to model with denial reason
      expect(receivedToolMessage).toBeDefined();
      const toolContentStr = JSON.stringify(receivedToolMessage?.content);
      expect(toolContentStr).toContain("Permission denied: bash execution blocked by host policy.");
      expect(toolContentStr).toContain('"isError":true');

      // 4. Summary payload shape is unchanged
      expect(spy.count).toBe(1);
      expect(spy.record?.summary).toBe("Compaction summary after bash was denied.");
      expect(spy.record?.coveredThrough).toBeDefined();
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
