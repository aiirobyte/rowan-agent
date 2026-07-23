import { expect, test } from "bun:test";
import Type from "typebox";
import {
  RUN_STATES,
  assertAgentConfig,
  assertJsonValue,
  assertToolExecutionResult,
  assertValidRunSnapshot,
  canTransitionRun,
  canonicalStartRunRequest,
  createIdempotencyScope,
  encodeIdempotencyScope,
  isJsonValue,
  isRuntimeError,
  normalizeUserInput,
  projectToolDefinition,
  RuntimeError,
  type AgentConfig,
  type RunSnapshot,
  type RuntimeErrorCode,
  type UserInput,
} from "../../src/runtime";
import type { AgentId, EventCursor, Message, RunId, ToolExecutionResult, ToolUseContent } from "../../src/runtime-events";

const agentId = "agent-1" as AgentId;
const runId = "run-1" as RunId;
const cursor = "store-1:1" as EventCursor;
const prompt = {
  id: "message-1" as never,
  agentId,
  runId,
  role: "assistant",
  content: "Need more input",
  sequenceWithinRun: 1,
  createdAt: "2026-07-23T00:00:00.000Z",
} as const;
const base = {
  runId,
  agentId,
  agentSequence: 1,
  revision: 2,
  input: "hello",
  messageCount: 1,
  toolCallCount: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  cursor,
} as const;

test("Run transition table covers every allowed and rejected transition", () => {
  const allowed: Record<"nonexistent" | (typeof RUN_STATES)[number], readonly string[]> = {
    nonexistent: ["queued"],
    queued: ["running", "failed", "cancelled"],
    running: ["input_required", "completed", "failed", "cancelled"],
    input_required: ["queued", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };
  const sources = ["nonexistent", ...RUN_STATES] as const;
  for (const source of sources) {
    for (const target of RUN_STATES) {
      expect(canTransitionRun(source, target)).toBe(allowed[source].includes(target));
    }
  }
});

test("JSON values are strict, canonical, and bounded", () => {
  expect(isJsonValue({ nested: [null, true, 1, "text"] })).toBe(true);
  expect(isJsonValue(new Array(1))).toBe(false);
  expect(isJsonValue(Number.NaN)).toBe(false);
  expect(isJsonValue(new Date())).toBe(false);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(isJsonValue(cyclic)).toBe(false);
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, "value", { get: () => 1 });
  expect(isJsonValue(accessor)).toBe(false);
  expect(() => assertJsonValue(undefined, "input")).toThrow("input");
});

test("RuntimeError narrows the code/details discriminant", () => {
  const error = new RuntimeError("agent_not_found", { agentId });
  expect(error.code satisfies RuntimeErrorCode).toBe("agent_not_found");
  expect((error.details as unknown)).toEqual({ agentId });
  expect(isRuntimeError(error)).toBe(true);
  expect(isRuntimeError(new Error("same message"))).toBe(false);
});

test("UserInput cannot choose durable identity and uses canonical request bytes", () => {
  expect(normalizeUserInput("hello")).toEqual({ content: "hello" });
  expect(canonicalStartRunRequest("hello", { b: 2, a: 1 })).toBe(
    '{"input":{"content":"hello"},"metadata":{"a":1,"b":2}}',
  );
  expect(() => normalizeUserInput({ content: "hello", id: "message-1" } as never)).toThrow();
  // @ts-expect-error UserInput cannot choose a Message role.
  const invalidRole: UserInput = { role: "assistant", content: "not valid" };
  // @ts-expect-error UserInput cannot choose a Message identity.
  const invalidIdentity: UserInput = { id: "message-1", content: "not valid" };
  void invalidRole;
  void invalidIdentity;
});

test("input-required and terminal snapshots require valid committed Assistant messages", () => {
  const waiting = {
    ...base,
    state: "input_required",
    request: { id: "request-1" as never, prompt },
  } satisfies RunSnapshot;
  assertValidRunSnapshot(waiting, { committedMessages: [prompt] });
  expect(() => assertValidRunSnapshot(waiting)).toThrow();
  const invalid = { ...waiting, output: prompt };
  expect(() => assertValidRunSnapshot(invalid as never, { committedMessages: [prompt] })).toThrow();

  const completed = {
    ...base,
    state: "completed",
    outcome: { id: "outcome-1" as never, message: "done" },
    output: prompt,
  } satisfies RunSnapshot;
  assertValidRunSnapshot(completed, { committedMessages: [prompt] });
  expect(() => assertValidRunSnapshot(completed, { committedMessages: [{ ...prompt, agentId: "other" as never }] })).toThrow();
  // @ts-expect-error input-required snapshots cannot carry terminal output.
  const impossible: RunSnapshot = { ...waiting, output: prompt };
  void impossible;
});

test("Tool schemas retain TypeBox and project only JSON-safe provider data", () => {
  const config = {
    identity: "config-1",
    model: { provider: "test", id: "model" },
    context: {
      systemPrompt: "system",
      tools: [{
        name: "lookup",
        description: "Look something up",
        parameters: Type.Object({ query: Type.String() }),
        execute: async () => ({ ok: true as const, content: { answer: "yes" } }),
      }],
      skills: [],
    },
    stream: async function* () {},
  } satisfies AgentConfig;
  expect(projectToolDefinition(config.context.tools[0]!)).toEqual({
    name: "lookup",
    description: "Look something up",
    parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  });
  expect(() => projectToolDefinition({ ...config.context.tools[0]!, parameters: { execute: () => undefined } as never })).toThrow();
  expect(() => assertToolExecutionResult({ ok: true, content: null, toolCallId: "provider-id" })).toThrow();
  expect(() => assertAgentConfig({ ...config, identity: "" })).toThrow();
  // @ts-expect-error Provider correlation IDs are not durable ToolCall IDs.
  const invalidToolUse: ToolUseContent = { type: "tool_use", id: "provider-id", name: "lookup", input: null };
  // @ts-expect-error Tool results cannot choose a Runtime ToolCall ID.
  const invalidResult: ToolExecutionResult = { ok: true, content: null, toolCallId: "tool-id" };
  void invalidToolUse;
  void invalidResult;
});

test("idempotency scopes include Store incarnation and remain disjoint", () => {
  const create = createIdempotencyScope("create_agent", "key");
  const update = createIdempotencyScope("update_agent_config", agentId, "key");
  const start = createIdempotencyScope("start_run", agentId, "key");
  expect(encodeIdempotencyScope("store-1", create)).not.toBe(encodeIdempotencyScope("store-1", update));
  expect(encodeIdempotencyScope("store-1", update)).not.toBe(encodeIdempotencyScope("store-1", start));
  expect(encodeIdempotencyScope("store-1", start)).not.toBe(encodeIdempotencyScope("store-2", start));
  expect(() => createIdempotencyScope("create_agent", "é".repeat(200))).toThrow();
});

void (null as unknown as Message);
