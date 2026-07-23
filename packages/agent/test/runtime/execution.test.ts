import { expect, test } from "bun:test";
import {
  decodeExecutionCheckpoint,
  encodeExecutionCheckpoint,
  executeOnce,
  EXECUTION_CHECKPOINT_CODEC,
  EXECUTION_CHECKPOINT_VERSION,
  ExecutionCheckpointError,
} from "../../src/runtime/execution";
import { createMessage, type AgentContext, type StreamFn } from "../../src/types";
import type { ExecutionState } from "../../src/loop/types";
import type { Phase, PhaseRegistry } from "../../src/harness/phases/types";

function context(phases: AgentContext["phases"]): AgentContext {
  return {
    systemPrompt: "Test",
    messages: [],
    tools: [],
    skills: [],
    phases,
  };
}

function state(): ExecutionState {
  return {
    currentPhase: "plan",
    attempt: 1,
    status: "suspended",
    metrics: {
      iterations: 2,
      phaseTransitions: [],
      compactionCount: 0,
      retryCount: 0,
      startedAt: "2026-07-23T00:00:00.000Z",
      startedAtMs: 1,
    },
    continuation: {
      isContinuing: true,
      previousResults: [{ name: "plan", output: { ready: true } }],
    },
  };
}

test("execution checkpoint codec is explicit and rejects incompatible versions", () => {
  const checkpoint = encodeExecutionCheckpoint(state());
  expect(checkpoint.codec).toBe(EXECUTION_CHECKPOINT_CODEC);
  expect(checkpoint.version).toBe(EXECUTION_CHECKPOINT_VERSION);
  expect(decodeExecutionCheckpoint(checkpoint)).toMatchObject({ currentPhase: "plan", status: "suspended" });
  expect(() => decodeExecutionCheckpoint({ ...checkpoint, version: 2 })).toThrow(ExecutionCheckpointError);
});

test("one-shot execution returns input_required without retaining a continuation", async () => {
  const plan: Phase = {
    name: "plan",
    description: "Plan",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Plan",
    isolated: false,
  };
  const finish: Phase = {
    name: "finish",
    description: "Finish",
    filePath: "<test>",
    baseDir: "<test>",
    content: "Finish",
    isolated: false,
  };
  const phases: PhaseRegistry = {
    phases: new Map([
      ["plan", plan],
      ["finish", finish],
    ]),
    entryPhaseId: "plan",
  };
  const stream: StreamFn = async function* () {
    yield { type: "start", partial: { role: "assistant", contentBlocks: [] } };
    yield { type: "text_delta", text: "Which target?", partial: { role: "assistant", contentBlocks: [{ type: "text", text: "Which target?" }] } };
    yield { type: "done", response: { content: "Which target?", stopReason: "stop" } };
  };
  const canonical = [createMessage("user", "Deploy")];
  const result = await executeOnce({
    canonicalMessages: canonical,
    context: context(phases),
    execution: { agentId: "agt_test", runId: "run_test", executionId: "exec_test" },
    model: { provider: "test", id: "model" },
    stream,
  });
  expect(result.type).toBe("input_required");
  if (result.type !== "input_required") return;
  expect(result.request.prompt).toBe("Which target?");
  expect(result.checkpoint.codec).toBe(EXECUTION_CHECKPOINT_CODEC);
  expect(canonical).toHaveLength(1);
  expect(result.messages.length).toBeGreaterThan(1);
});
