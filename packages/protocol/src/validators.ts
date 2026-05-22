import type { Outcome, Task, RoutingDecision, VerificationResult } from "./task";
import type { ToolCall, ToolResult } from "./tool";

type Parser<T> = {
  Parse(value: unknown): T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireString(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${label} to be a boolean.`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${label} to be a finite number.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Expected ${label} to be an array of strings.`);
  }
  return value;
}

function parseAcceptanceCriterion(value: unknown): Task["acceptanceCriteria"][number] {
  const record = requireRecord(value, "acceptance criterion");
  const id = requireString(record.id, "acceptance criterion id");
  const description = requireString(record.description, "acceptance criterion description");
  const required = requireBoolean(record.required, "acceptance criterion required");
  const type = record.type;

  if (type === "model_judge") {
    return { id, type, description, required };
  }

  if (type === "tool_observation") {
    const toolName = optionalString(record.toolName, "acceptance criterion toolName");
    return {
      id,
      type,
      description,
      required,
      ...(toolName ? { toolName } : {}),
    };
  }

  throw new Error("Expected acceptance criterion type to be model_judge or tool_observation.");
}

function parseTask(value: unknown): Task {
  const record = requireRecord(value, "task");
  const status = record.status;
  if (status !== "pending" && status !== "running" && status !== "passed" && status !== "failed") {
    throw new Error("Expected task status to be pending, running, passed, or failed.");
  }
  if (!Array.isArray(record.acceptanceCriteria)) {
    throw new Error("Expected task acceptanceCriteria to be an array.");
  }

  return {
    id: requireString(record.id, "task id"),
    title: requireString(record.title, "task title"),
    instruction: requireString(record.instruction, "task instruction"),
    acceptanceCriteria: record.acceptanceCriteria.map(parseAcceptanceCriterion),
    toolNames: requireStringArray(record.toolNames, "task toolNames"),
    skillIds: requireStringArray(record.skillIds, "task skillIds"),
    status,
    attempts: requireNumber(record.attempts, "task attempts"),
  };
}

function parseRoutingDecision(value: unknown): RoutingDecision {
  const record = requireRecord(value, "task routing decision");
  const route = record.route;
  if (typeof route !== "string" || route.trim().length === 0) {
    throw new Error("Expected route to be a non-empty string (e.g., \"direct\", \"plan\", \"execute\", \"phase-id\").");
  }

  const threadRecord = record.thread === undefined ? undefined : requireRecord(record.thread, "thread route");
  return {
    route,
    message: requireString(record.message, "task routing message"),
    ...(threadRecord
      ? {
          thread: {
            prompt: requireString(threadRecord.prompt, "thread prompt"),
            task: requireString(threadRecord.task, "thread task"),
            goal: requireString(threadRecord.goal, "thread goal"),
          },
        }
      : {}),
  };
}

function parseToolCall(value: unknown): ToolCall {
  const record = requireRecord(value, "tool call");
  return {
    id: requireString(record.id, "tool call id"),
    name: requireString(record.name, "tool call name"),
    args: record.args,
  };
}

function parseToolResult(value: unknown): ToolResult {
  const record = requireRecord(value, "tool result");
  return {
    toolCallId: requireString(record.toolCallId, "tool result toolCallId"),
    toolName: requireString(record.toolName, "tool result toolName"),
    ok: requireBoolean(record.ok, "tool result ok"),
    content: record.content,
    ...(record.error !== undefined ? { error: requireString(record.error, "tool result error") } : {}),
  };
}

function parseVerificationResult(value: unknown): VerificationResult {
  const record = requireRecord(value, "verification result");
  return {
    passed: requireBoolean(record.passed, "verification result passed"),
    message: requireString(record.message, "verification result message"),
  };
}

function parseOutcome(value: unknown): Outcome {
  const record = requireRecord(value, "outcome");
  return {
    id: requireString(record.id, "outcome id"),
    ...(record.taskId !== undefined ? { taskId: requireString(record.taskId, "outcome taskId") } : {}),
    passed: requireBoolean(record.passed, "outcome passed"),
    message: requireString(record.message, "outcome message"),
  };
}

export const Validators: {
  task: Parser<Task>;
  routingDecision: Parser<RoutingDecision>;
  toolCall: Parser<ToolCall>;
  toolResult: Parser<ToolResult>;
  verificationResult: Parser<VerificationResult>;
  outcome: Parser<Outcome>;
} = {
  task: { Parse: parseTask },
  routingDecision: { Parse: parseRoutingDecision },
  toolCall: { Parse: parseToolCall },
  toolResult: { Parse: parseToolResult },
  verificationResult: { Parse: parseVerificationResult },
  outcome: { Parse: parseOutcome },
};

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createDefaultCriteria(description: string): Task["acceptanceCriteria"] {
  return [
    {
      id: createId("crit"),
      type: "model_judge",
      description,
      required: true,
    },
  ];
}
