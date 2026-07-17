import { Database } from "bun:sqlite";
import { createId, createTimestamp } from "../utils";
import type {
  AgentId,
  AgentRecord,
  AgentRunRecord,
  AgentRunId,
  LeaseId,
  RuntimeEvent,
  RuntimeEventCheckpoint,
  RuntimeEventId,
  RuntimeEventKind,
  RuntimeLease,
  RuntimeMessage,
  RuntimeMessageId,
  RuntimeMessageState,
  RuntimeToolCall,
  RuntimeToolCallId,
  RuntimeToolCallState,
} from "./domain";
import type {
  CompleteRunInput,
  ExhaustRunInput,
  CompleteToolCallInput,
  CreateAgentInput,
  CreateToolCallInput,
  EnqueueAgentInput,
  IndeterminateToolCallInput,
  LeaseRunInput,
  LeasedRun,
  RuntimeStateStore,
  RetryRunInput,
  RenewLeaseInput,
  SuspendRunInput,
} from "./store";
import { initializeRuntimeSchema } from "./runtime-schema";

type AgentRow = {
  id: string;
  session_id: string;
  factory_id: string | null;
  state: AgentRecord["state"];
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  agent_id: string;
  kind: RuntimeMessage["kind"];
  payload_json: string;
  state: RuntimeMessageState;
  attempts: number;
  run_id: string | null;
  dead_letter_reason: string | null;
  created_at: string;
  updated_at: string;
  lease_id: string | null;
  lease_run_id: string | null;
  worker_id: string | null;
  leased_at: string | null;
  expires_at: string | null;
};

type RunRow = {
  id: string;
  agent_id: string;
  message_id: string;
  state: AgentRunRecord["state"];
  attempt: number;
  lease_id: string | null;
  outcome_json: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  sequence: number;
  kind: RuntimeEventKind;
  agent_id: string | null;
  message_id: string | null;
  run_id: string | null;
  tool_call_id: string | null;
  payload_json: string | null;
  created_at: string;
};

type ToolCallRow = {
  id: string;
  agent_id: string;
  run_id: string;
  name: string;
  args_json: string;
  state: RuntimeToolCallState;
  result_json: string | null;
  indeterminate_reason: string | null;
  created_at: string;
  updated_at: string;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function json<T>(value: T): string {
  return JSON.stringify(value);
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function optionalJson<T>(value: string | null): T | undefined {
  return value === null ? undefined : parse<T>(value);
}

function transitionError(entity: string, id: string, state: string, action: string): Error {
  return new Error(`Cannot ${action} ${entity} ${id} from state "${state}".`);
}

function requireTransition(
  entity: string,
  id: string,
  state: string,
  action: string,
  allowedStates: readonly string[],
): void {
  if (!allowedStates.includes(state)) {
    throw transitionError(entity, id, state, action);
  }
}

function timestampFor(input?: Date): { date: Date; timestamp: string } {
  const date = input ? new Date(input) : new Date();
  return { date, timestamp: createTimestamp(date) };
}

export class SqliteRuntimeStateStore implements RuntimeStateStore {
  private readonly database: Database;

  constructor(filename = ":memory:") {
    this.database = new Database(filename, { create: true, readwrite: true, strict: true });
    this.database.run("PRAGMA foreign_keys = ON");
    initializeRuntimeSchema(this.database);
  }

  close(): void {
    this.database.close();
  }

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    const { timestamp } = timestampFor();
    const agent: AgentRecord = {
      id: createId("agt") as AgentId,
      sessionId: input.sessionId,
      ...(input.factoryId ? { factoryId: input.factoryId } : {}),
      state: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const create = this.database.transaction(() => {
      this.database.run(
        "INSERT INTO agents (id, session_id, factory_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [agent.id, agent.sessionId, agent.factoryId ?? null, agent.state, agent.createdAt, agent.updatedAt],
      );
      this.recordEvent("agent_created", { agentId: agent.id });
    });
    create();
    return clone(agent);
  }

  async getAgent(agentId: AgentId): Promise<AgentRecord | undefined> {
    const row = this.database.query("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | null;
    return row ? this.agentFromRow(row) : undefined;
  }

  async listAgents(): Promise<AgentRecord[]> {
    const rows = this.database.query("SELECT * FROM agents ORDER BY created_at, id").all() as AgentRow[];
    return rows.map((row) => this.agentFromRow(row));
  }

  async setAgentState(agentId: AgentId, state: AgentRecord["state"]): Promise<AgentRecord> {
    const current = this.requireAgent(agentId);
    if (current.state === state) return clone(current);
    const { timestamp } = timestampFor();
    const updated = this.database.transaction(() => {
      this.database.run("UPDATE agents SET state = ?, updated_at = ? WHERE id = ?", [state, timestamp, agentId]);
      this.recordEvent(state === "paused" ? "agent_paused" : "agent_resumed", { agentId });
      return this.requireAgent(agentId);
    })();
    return clone(updated);
  }

  async enqueueAgentInput(input: EnqueueAgentInput): Promise<{ message: RuntimeMessage; run: AgentRunRecord; resumed: boolean }> {
    this.requireAgent(input.agentId);
    const { timestamp } = timestampFor();
    const messageId = createId("rmsg") as RuntimeMessageId;
    const suspendedRow = this.database.query(
      "SELECT * FROM agent_runs WHERE agent_id = ? AND state = 'suspended' ORDER BY created_at, id LIMIT 1",
    ).get(input.agentId) as RunRow | null;
    const runId = (suspendedRow?.id as AgentRunId | undefined) ?? (createId("run") as AgentRunId);
    const message: RuntimeMessage = {
      id: messageId,
      agentId: input.agentId,
      kind: "agent_input",
      input: clone(input.input),
      state: "queued",
      attempts: 0,
      runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const run: AgentRunRecord = {
      id: runId,
      agentId: input.agentId,
      messageId,
      state: "queued",
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (suspendedRow) {
      message.runId = runId;
    }
    const enqueue = this.database.transaction(() => {
      this.insertMessage(message);
      if (suspendedRow) {
        this.database.run(
          "UPDATE agent_runs SET message_id = ?, state = 'queued', lease_id = NULL, suspension_reason = NULL, updated_at = ? WHERE id = ?",
          [messageId, timestamp, runId],
        );
      } else {
        this.database.run(
          "INSERT INTO agent_runs (id, agent_id, message_id, state, attempt, lease_id, outcome_json, suspension_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [run.id, run.agentId, run.messageId, run.state, run.attempt, null, null, null, run.createdAt, run.updatedAt],
        );
      }
      this.recordEvent("message_enqueued", { agentId: input.agentId, messageId });
      this.recordEvent("run_enqueued", { agentId: input.agentId, messageId, runId });
    });
    enqueue();
    const storedRun = this.requireRun(runId);
    return { message: clone(message), run: clone(storedRun), resumed: Boolean(suspendedRow) };
  }

  async getMessage(messageId: RuntimeMessageId): Promise<RuntimeMessage | undefined> {
    const row = this.messageRow(messageId);
    return row ? this.messageFromRow(row) : undefined;
  }

  async getRun(runId: AgentRunId): Promise<AgentRunRecord | undefined> {
    const row = this.runRow(runId);
    return row ? this.runFromRow(row) : undefined;
  }

  async listRuns(input: import("./store").ListRunsInput = {}): Promise<AgentRunRecord[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.agentId) {
      clauses.push("agent_id = ?");
      params.push(input.agentId);
    }
    if (input.states && input.states.length > 0) {
      clauses.push(`state IN (${input.states.map(() => "?").join(", ")})`);
      params.push(...input.states);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database.query(`SELECT * FROM agent_runs ${where} ORDER BY created_at, id`).all(...params) as RunRow[];
    return rows.map((row) => this.runFromRow(row));
  }

  async leaseRun(input: LeaseRunInput): Promise<LeasedRun> {
    const lease = this.database.transaction(() => {
      const run = this.requireRun(input.runId);
      requireTransition("Agent Run", run.id, run.state, "lease", ["queued"]);
      const message = this.requireMessage(run.messageId);
      requireTransition("Runtime Message", message.id, message.state, "lease", ["queued"]);
      const agent = this.requireAgent(run.agentId);
      if (agent.state !== "active") {
        throw transitionError("Agent", agent.id, agent.state, "lease a Run for");
      }
      const activeRun = this.database.query(
        "SELECT id FROM agent_runs WHERE agent_id = ? AND id <> ? AND state IN ('running', 'suspended') LIMIT 1",
      ).get(run.agentId, run.id);
      if (activeRun) {
        throw new Error(`Agent ${run.agentId} already has an active Run.`);
      }
      if (!Number.isFinite(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
        throw new Error("Lease duration must be a positive finite number.");
      }

      const { date, timestamp } = timestampFor(input.now);
      const runtimeLease: RuntimeLease = {
        id: createId("lease") as LeaseId,
        runId: run.id,
        workerId: input.workerId,
        leasedAt: timestamp,
        expiresAt: createTimestamp(new Date(date.getTime() + input.leaseDurationMs)),
      };
      this.database.run(
        "INSERT INTO runtime_leases (id, run_id, worker_id, leased_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        [runtimeLease.id, runtimeLease.runId, runtimeLease.workerId, runtimeLease.leasedAt, runtimeLease.expiresAt],
      );
      this.database.run(
        "UPDATE agent_runs SET state = ?, attempt = attempt + 1, lease_id = ?, updated_at = ? WHERE id = ?",
        ["running", runtimeLease.id, timestamp, run.id],
      );
      this.database.run(
        "UPDATE runtime_messages SET state = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
        ["leased", timestamp, message.id],
      );
      this.recordEvent("run_leased", { agentId: run.agentId, messageId: message.id, runId: run.id }, runtimeLease);
      return runtimeLease;
    })();
    const run = this.requireRun(input.runId);
    const message = this.requireMessage(run.messageId);
    return { run, message, lease: clone(lease) };
  }

  async renewLease(input: RenewLeaseInput): Promise<RuntimeLease> {
    const lease = this.database.transaction(() => {
      const run = this.requireRun(input.runId);
      requireTransition("Agent Run", run.id, run.state, "renew Lease", ["running"]);
      const message = this.requireMessage(run.messageId);
      requireTransition("Runtime Message", message.id, message.state, "renew Lease", ["leased"]);
      if (run.leaseId !== input.leaseId || message.lease?.id !== input.leaseId) {
        throw new Error(`Lease ${input.leaseId} does not own Agent Run ${run.id}.`);
      }
      if (!Number.isFinite(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
        throw new Error("Lease duration must be a positive finite number.");
      }
      const { date, timestamp } = timestampFor(input.now);
      const expiresAt = createTimestamp(new Date(date.getTime() + input.leaseDurationMs));
      this.database.run("UPDATE runtime_leases SET expires_at = ? WHERE id = ?", [expiresAt, input.leaseId]);
      this.database.run("UPDATE runtime_messages SET updated_at = ? WHERE id = ?", [timestamp, message.id]);
      return { ...message.lease, expiresAt };
    })();
    return clone(lease);
  }

  async suspendRun(input: SuspendRunInput): Promise<AgentRunRecord> {
    const run = this.database.transaction(() => {
      const current = this.requireRun(input.runId);
      requireTransition("Agent Run", current.id, current.state, "suspend", ["running"]);
      const message = this.requireMessage(current.messageId);
      requireTransition("Runtime Message", message.id, message.state, "acknowledge", ["leased"]);
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE agent_runs SET state = ?, lease_id = NULL, suspension_reason = ?, updated_at = ? WHERE id = ?",
        ["suspended", input.reason ?? null, timestamp, current.id],
      );
      this.database.run(
        "UPDATE runtime_messages SET state = ?, updated_at = ? WHERE id = ?",
        ["acknowledged", timestamp, message.id],
      );
      this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [current.id]);
      this.recordEvent("run_suspended", { agentId: current.agentId, messageId: message.id, runId: current.id }, {
        reason: input.reason,
      });
      return this.requireRun(current.id);
    })();
    return clone(run);
  }

  async completeRun(input: CompleteRunInput): Promise<AgentRunRecord> {
    const run = this.database.transaction(() => {
      const current = this.requireRun(input.runId);
      requireTransition("Agent Run", current.id, current.state, "complete", ["running"]);
      const message = this.requireMessage(current.messageId);
      requireTransition("Runtime Message", message.id, message.state, "acknowledge", ["leased"]);
      const { timestamp } = timestampFor();
      const state = input.state ?? "completed";
      this.database.run(
        "UPDATE agent_runs SET state = ?, lease_id = NULL, outcome_json = ?, updated_at = ? WHERE id = ?",
        [state, json(input.outcome), timestamp, current.id],
      );
      this.database.run(
        "UPDATE runtime_messages SET state = 'acknowledged', updated_at = ? WHERE id = ?",
        [timestamp, message.id],
      );
      this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [current.id]);
      this.recordEvent("run_completed", { agentId: current.agentId, messageId: current.messageId, runId: current.id }, {
        state,
        outcome: input.outcome,
      });
      this.recordEvent("message_acknowledged", { agentId: message.agentId, messageId: message.id });
      return this.requireRun(current.id);
    })();
    return clone(run);
  }

  async retryRun(input: RetryRunInput): Promise<AgentRunRecord> {
    const run = this.database.transaction(() => {
      const current = this.requireRun(input.runId);
      requireTransition("Agent Run", current.id, current.state, "retry", ["running"]);
      const message = this.requireMessage(current.messageId);
      requireTransition("Runtime Message", message.id, message.state, "retry", ["leased"]);
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE agent_runs SET state = 'queued', lease_id = NULL, updated_at = ? WHERE id = ?",
        [timestamp, current.id],
      );
      this.database.run(
        "UPDATE runtime_messages SET state = 'queued', updated_at = ? WHERE id = ?",
        [timestamp, message.id],
      );
      this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [current.id]);
      this.recordEvent("run_retry_scheduled", {
        agentId: current.agentId,
        messageId: message.id,
        runId: current.id,
      }, { reason: input.reason, attempt: current.attempt });
      return this.requireRun(current.id);
    })();
    return clone(run);
  }

  async exhaustRun(input: ExhaustRunInput): Promise<AgentRunRecord> {
    const run = this.database.transaction(() => {
      const current = this.requireRun(input.runId);
      requireTransition("Agent Run", current.id, current.state, "exhaust retries", ["running"]);
      const message = this.requireMessage(current.messageId);
      requireTransition("Runtime Message", message.id, message.state, "dead-letter", ["leased"]);
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE agent_runs SET state = 'failed', lease_id = NULL, outcome_json = ?, updated_at = ? WHERE id = ?",
        [json(input.outcome), timestamp, current.id],
      );
      this.database.run(
        "UPDATE runtime_messages SET state = 'dead_lettered', dead_letter_reason = ?, updated_at = ? WHERE id = ?",
        [input.reason, timestamp, message.id],
      );
      this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [current.id]);
      this.recordEvent("run_completed", { agentId: current.agentId, messageId: message.id, runId: current.id }, {
        state: "failed",
        outcome: input.outcome,
      });
      this.recordEvent("message_dead_lettered", { agentId: current.agentId, messageId: message.id }, {
        reason: input.reason,
      });
      return this.requireRun(current.id);
    })();
    return clone(run);
  }

  async abortRun(input: import("./store").AbortRunInput): Promise<AgentRunRecord> {
    const run = this.database.transaction(() => {
      const current = this.requireRun(input.runId);
      requireTransition("Agent Run", current.id, current.state, "abort", ["queued", "running", "suspended"]);
      const message = this.requireMessage(current.messageId);
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE agent_runs SET state = 'cancelled', lease_id = NULL, outcome_json = ?, updated_at = ? WHERE id = ?",
        [json(input.outcome), timestamp, current.id],
      );
      if (message.state === "queued" || message.state === "leased") {
        this.database.run("UPDATE runtime_messages SET state = 'acknowledged', updated_at = ? WHERE id = ?", [
          timestamp,
          message.id,
        ]);
      }
      this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [current.id]);
      this.recordEvent("run_aborted", { agentId: current.agentId, messageId: message.id, runId: current.id }, {
        outcome: input.outcome,
      });
      return this.requireRun(current.id);
    })();
    return clone(run);
  }

  async recoverExpiredLeases(input?: Date): Promise<AgentRunRecord[]> {
    const { timestamp } = timestampFor(input);
    const rows = this.database.query(`
      SELECT r.id
      FROM agent_runs r
      JOIN runtime_leases l ON l.id = r.lease_id
      WHERE r.state = 'running' AND l.expires_at <= ?
      ORDER BY l.expires_at, r.created_at
    `).all(timestamp) as Array<{ id: string }>;
    if (rows.length === 0) return [];
    const recover = this.database.transaction(() => {
      const recovered: AgentRunRecord[] = [];
      for (const row of rows) {
        const run = this.requireRun(row.id as AgentRunId);
        if (run.state !== "running") continue;
        const message = this.requireMessage(run.messageId);
        this.database.run("UPDATE agent_runs SET state = 'queued', lease_id = NULL, updated_at = ? WHERE id = ?", [
          timestamp,
          run.id,
        ]);
        this.database.run("UPDATE runtime_messages SET state = 'queued', updated_at = ? WHERE id = ?", [
          timestamp,
          message.id,
        ]);
        this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [run.id]);
        this.recordEvent("lease_expired", { agentId: run.agentId, messageId: message.id, runId: run.id });
        recovered.push(this.requireRun(run.id));
      }
      return recovered;
    })();
    return clone(recover);
  }

  async recoverLeases(): Promise<AgentRunRecord[]> {
    const { timestamp } = timestampFor();
    const rows = this.database.query(`
      SELECT r.id
      FROM agent_runs r
      JOIN runtime_leases l ON l.id = r.lease_id
      WHERE r.state = 'running'
      ORDER BY l.leased_at, r.created_at
    `).all() as Array<{ id: string }>;
    if (rows.length === 0) return [];
    const recovered = this.database.transaction(() => {
      const runs: AgentRunRecord[] = [];
      for (const row of rows) {
        const run = this.requireRun(row.id as AgentRunId);
        if (run.state !== "running") continue;
        const message = this.requireMessage(run.messageId);
        this.database.run("UPDATE agent_runs SET state = 'queued', lease_id = NULL, updated_at = ? WHERE id = ?", [
          timestamp,
          run.id,
        ]);
        this.database.run("UPDATE runtime_messages SET state = 'queued', updated_at = ? WHERE id = ?", [
          timestamp,
          message.id,
        ]);
        this.database.run("DELETE FROM runtime_leases WHERE run_id = ?", [run.id]);
        this.recordEvent("lease_recovered", { agentId: run.agentId, messageId: message.id, runId: run.id });
        runs.push(this.requireRun(run.id));
      }
      return runs;
    })();
    return clone(recovered);
  }

  async createToolCall(input: CreateToolCallInput): Promise<RuntimeToolCall> {
    this.requireAgent(input.agentId);
    this.requireRun(input.runId);
    const { timestamp } = timestampFor();
    const toolCall: RuntimeToolCall = {
      id: createId("call") as RuntimeToolCallId,
      agentId: input.agentId,
      runId: input.runId,
      name: input.name,
      args: clone(input.args),
      state: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const create = this.database.transaction(() => {
      this.database.run(
        "INSERT INTO runtime_tool_calls (id, agent_id, run_id, name, args_json, state, result_json, indeterminate_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [toolCall.id, toolCall.agentId, toolCall.runId, toolCall.name, json(toolCall.args), toolCall.state, null, null, toolCall.createdAt, toolCall.updatedAt],
      );
      this.recordEvent("tool_call_created", { agentId: toolCall.agentId, runId: toolCall.runId, toolCallId: toolCall.id });
    });
    create();
    return clone(toolCall);
  }

  async startToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall> {
    const toolCall = this.database.transaction(() => {
      const current = this.requireToolCall(toolCallId);
      requireTransition("Tool Call", current.id, current.state, "start", ["queued"]);
      const { timestamp } = timestampFor();
      this.database.run("UPDATE runtime_tool_calls SET state = ?, updated_at = ? WHERE id = ?", [
        "running",
        timestamp,
        current.id,
      ]);
      this.recordEvent("tool_call_started", { agentId: current.agentId, runId: current.runId, toolCallId: current.id });
      return this.requireToolCall(current.id);
    })();
    return clone(toolCall);
  }

  async completeToolCall(input: CompleteToolCallInput): Promise<RuntimeToolCall> {
    const toolCall = this.database.transaction(() => {
      const current = this.requireToolCall(input.toolCallId);
      const state = input.state ?? (input.result.ok ? "completed" : "failed");
      requireTransition(
        "Tool Call",
        current.id,
        current.state,
        "complete",
        state === "failed" ? ["queued", "running"] : ["running"],
      );
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE runtime_tool_calls SET state = ?, result_json = ?, updated_at = ? WHERE id = ?",
        [state, json(input.result), timestamp, current.id],
      );
      this.recordEvent(state === "failed" ? "tool_call_failed" : "tool_call_completed", { agentId: current.agentId, runId: current.runId, toolCallId: current.id }, {
        state,
      });
      return this.requireToolCall(current.id);
    })();
    return clone(toolCall);
  }

  async markToolCallIndeterminate(input: IndeterminateToolCallInput): Promise<RuntimeToolCall> {
    const toolCall = this.database.transaction(() => {
      const current = this.requireToolCall(input.toolCallId);
      requireTransition("Tool Call", current.id, current.state, "mark indeterminate", ["running"]);
      const { timestamp } = timestampFor();
      this.database.run(
        "UPDATE runtime_tool_calls SET state = ?, indeterminate_reason = ?, updated_at = ? WHERE id = ?",
        ["indeterminate", input.reason, timestamp, current.id],
      );
      this.recordEvent("tool_call_indeterminate", { agentId: current.agentId, runId: current.runId, toolCallId: current.id }, {
        reason: input.reason,
      });
      return this.requireToolCall(current.id);
    })();
    return clone(toolCall);
  }

  async getToolCall(toolCallId: RuntimeToolCallId): Promise<RuntimeToolCall | undefined> {
    const row = this.database.query("SELECT * FROM runtime_tool_calls WHERE id = ?").get(toolCallId) as ToolCallRow | null;
    return row ? this.toolCallFromRow(row) : undefined;
  }

  async listEvents(cursor: import("./domain").RuntimeEventCursor = {}): Promise<RuntimeEvent[]> {
    const after = cursor.after ? this.database.query("SELECT sequence FROM runtime_events WHERE id = ?").get(cursor.after) as { sequence: number } | null : null;
    const limit = cursor.limit === undefined ? "" : ` LIMIT ${Math.max(0, Math.floor(cursor.limit))}`;
    const rows = this.database.query(`SELECT * FROM runtime_events ${after ? "WHERE sequence > ?" : ""} ORDER BY sequence${limit}`).all(...(after ? [after.sequence] : [])) as EventRow[];
    return rows.map((row) => this.eventFromRow(row));
  }

  async recordEvent(
    input: import("./store").RecordRuntimeEventInput | RuntimeEventKind,
    related: Pick<RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId"> = {},
    payload?: unknown,
  ): Promise<RuntimeEvent> {
    if (typeof input === "string") {
      this.recordEventInternal(input, related, payload);
      const row = this.database.query("SELECT * FROM runtime_events ORDER BY sequence DESC LIMIT 1").get() as EventRow;
      return clone(this.eventFromRow(row));
    }
    const event = this.database.transaction(() => {
      this.recordEventInternal(input.kind, input.related ?? {}, input.payload);
      const row = this.database.query("SELECT * FROM runtime_events ORDER BY sequence DESC LIMIT 1").get() as EventRow;
      return this.eventFromRow(row);
    })();
    return clone(event);
  }

  async getEventCheckpoint(consumerId: string): Promise<RuntimeEventCheckpoint> {
    return clone(this.eventCheckpoint(consumerId));
  }

  async acknowledgeEvent(
    consumerId: string,
    eventId: RuntimeEventId,
  ): Promise<RuntimeEventCheckpoint> {
    const checkpoint = this.database.transaction(() => {
      const event = this.requireEvent(eventId);
      const current = this.eventCheckpoint(consumerId);
      if (event.sequence <= current.sequence) return current;
      if (event.sequence !== current.sequence + 1) {
        throw new Error(`Runtime Event Consumer Checkpoint cannot advance from sequence ${current.sequence} to ${event.sequence}.`);
      }
      const updatedAt = createTimestamp();
      this.database.run(
        `INSERT INTO runtime_event_consumers (consumer_id, sequence, event_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(consumer_id) DO UPDATE SET
           sequence = excluded.sequence,
           event_id = excluded.event_id,
           updated_at = excluded.updated_at`,
        [consumerId, event.sequence, event.id, updatedAt],
      );
      return this.eventCheckpoint(consumerId);
    })();
    return clone(checkpoint);
  }

  private insertMessage(message: RuntimeMessage): void {
    this.database.run(
      "INSERT INTO runtime_messages (id, agent_id, kind, payload_json, state, attempts, run_id, dead_letter_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [message.id, message.agentId, message.kind, json(message.input), message.state, message.attempts, message.runId ?? null, null, message.createdAt, message.updatedAt],
    );
  }

  private agentFromRow(row: AgentRow): AgentRecord {
    return {
      id: row.id as AgentId,
      sessionId: row.session_id,
      ...(row.factory_id ? { factoryId: row.factory_id as AgentRecord["factoryId"] } : {}),
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private messageFromRow(row: MessageRow): RuntimeMessage {
    const message: RuntimeMessage = {
      id: row.id as RuntimeMessageId,
      agentId: row.agent_id as AgentId,
      kind: row.kind,
      input: parse(row.payload_json),
      state: row.state,
      attempts: row.attempts,
      ...(row.run_id ? { runId: row.run_id as AgentRunId } : {}),
      ...(row.dead_letter_reason ? { deadLetterReason: row.dead_letter_reason } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.lease_id && row.lease_run_id && row.worker_id && row.leased_at && row.expires_at) {
      message.lease = {
        id: row.lease_id as LeaseId,
        runId: row.lease_run_id as AgentRunId,
        workerId: row.worker_id,
        leasedAt: row.leased_at,
        expiresAt: row.expires_at,
      };
    }
    return message;
  }

  private runFromRow(row: RunRow): AgentRunRecord {
    return {
      id: row.id as AgentRunId,
      agentId: row.agent_id as AgentId,
      messageId: row.message_id as RuntimeMessageId,
      state: row.state,
      attempt: row.attempt,
      ...(row.lease_id ? { leaseId: row.lease_id as LeaseId } : {}),
      ...(row.outcome_json ? { outcome: parse(row.outcome_json) } : {}),
      ...(row.suspension_reason ? { suspensionReason: row.suspension_reason } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private eventFromRow(row: EventRow): RuntimeEvent {
    return {
      id: row.id as RuntimeEventId,
      sequence: row.sequence,
      kind: row.kind,
      ...(row.agent_id ? { agentId: row.agent_id as AgentId } : {}),
      ...(row.message_id ? { messageId: row.message_id as RuntimeMessageId } : {}),
      ...(row.run_id ? { runId: row.run_id as AgentRunId } : {}),
      ...(row.tool_call_id ? { toolCallId: row.tool_call_id as RuntimeToolCallId } : {}),
      ...(row.payload_json ? { payload: optionalJson(row.payload_json) } : {}),
      createdAt: row.created_at,
    };
  }

  private toolCallFromRow(row: ToolCallRow): RuntimeToolCall {
    return {
      id: row.id as RuntimeToolCallId,
      agentId: row.agent_id as AgentId,
      runId: row.run_id as AgentRunId,
      name: row.name,
      args: parse(row.args_json),
      state: row.state,
      ...(row.result_json ? { result: parse(row.result_json) } : {}),
      ...(row.indeterminate_reason ? { indeterminateReason: row.indeterminate_reason } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private messageRow(messageId: RuntimeMessageId): MessageRow | null {
    return this.database.query(`
      SELECT
        m.*,
        l.id AS lease_id,
        l.run_id AS lease_run_id,
        l.worker_id,
        l.leased_at,
        l.expires_at
      FROM runtime_messages m
      LEFT JOIN agent_runs r ON r.id = m.run_id
      LEFT JOIN runtime_leases l ON l.id = r.lease_id
      WHERE m.id = ?
    `).get(messageId) as MessageRow | null;
  }

  private runRow(runId: AgentRunId): RunRow | null {
    return this.database.query("SELECT * FROM agent_runs WHERE id = ?").get(runId) as RunRow | null;
  }

  private requireAgent(agentId: AgentId): AgentRecord {
    const row = this.database.query("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | null;
    if (!row) {
      throw new Error(`Agent not found: ${agentId}.`);
    }
    return this.agentFromRow(row);
  }

  private requireMessage(messageId: RuntimeMessageId): RuntimeMessage {
    const row = this.messageRow(messageId);
    if (!row) {
      throw new Error(`Runtime Message not found: ${messageId}.`);
    }
    return this.messageFromRow(row);
  }

  private requireRun(runId: AgentRunId): AgentRunRecord {
    const row = this.runRow(runId);
    if (!row) {
      throw new Error(`Agent Run not found: ${runId}.`);
    }
    return this.runFromRow(row);
  }

  private requireToolCall(toolCallId: RuntimeToolCallId): RuntimeToolCall {
    const row = this.database.query("SELECT * FROM runtime_tool_calls WHERE id = ?").get(toolCallId) as ToolCallRow | null;
    if (!row) {
      throw new Error(`Tool Call not found: ${toolCallId}.`);
    }
    return this.toolCallFromRow(row);
  }

  private requireEvent(eventId: RuntimeEventId): RuntimeEvent {
    const row = this.database.query("SELECT * FROM runtime_events WHERE id = ?").get(eventId) as EventRow | null;
    if (!row) {
      throw new Error(`Runtime Event not found: ${eventId}.`);
    }
    return this.eventFromRow(row);
  }

  private eventCheckpoint(consumerId: string): RuntimeEventCheckpoint {
    const row = this.database.query(
      "SELECT consumer_id, sequence, event_id, updated_at FROM runtime_event_consumers WHERE consumer_id = ?",
    ).get(consumerId) as {
      consumer_id: string;
      sequence: number;
      event_id: string | null;
      updated_at: string;
    } | null;
    if (!row) {
      return {
        consumerId,
        sequence: 0,
        updatedAt: createTimestamp(new Date(0)),
      };
    }
    return {
      consumerId: row.consumer_id,
      sequence: row.sequence,
      ...(row.event_id ? { eventId: row.event_id as RuntimeEventId } : {}),
      updatedAt: row.updated_at,
    };
  }

  private recordEventInternal(
    kind: RuntimeEventKind,
    related: Pick<RuntimeEvent, "agentId" | "messageId" | "runId" | "toolCallId">,
    payload?: unknown,
  ): void {
    this.database.run(
      "INSERT INTO runtime_events (id, sequence, kind, agent_id, message_id, run_id, tool_call_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        createId("evt"),
        ((this.database.query("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM runtime_events").get() as { sequence: number }).sequence ?? 0) + 1,
        kind,
        related.agentId ?? null,
        related.messageId ?? null,
        related.runId ?? null,
        related.toolCallId ?? null,
        payload === undefined ? null : json(payload),
        createTimestamp(),
      ],
    );
  }
}
