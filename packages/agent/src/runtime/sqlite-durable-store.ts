import { Database } from "bun:sqlite";
import type {
  AgentId,
  AgentDeletionRequest,
  AgentRecord,
  AssistantMessage,
  ConfigToken,
  ConsumerRegistration,
  DurableRunEvent,
  ExecutionCheckpoint,
  ExecutionId,
  ExecutionToken,
  EventCursor,
  InputRequestId,
  InputRequiredCommit,
  MessageId,
  Metadata,
  Outcome,
  OwnerLease,
  OwnerToken,
  RunClaim,
  RunFailure,
  RunId,
  RunRecord,
  RunSnapshot,
  RunState,
  RetentionResult,
  ToolCommit,
  UserInput,
} from "./contracts";
import { InMemoryStore } from "./durable-store";
import type { InMemoryStoreState } from "./durable-store";
import { RuntimeError } from "./errors";
import type { DurableStore, OwnedStore } from "./contracts";
import type { ToolCallId, ToolExecutionResult, JsonValue } from "../runtime-events";
import type { PhaseInteraction } from "../harness/phases/interactions";

const SCHEMA_ID = "rowan.agent.runtime";
// Message revisions and history seeds are a clean durable-store cutover. Old
// Rowan databases are rejected and must be removed/recreated by Doctor Repair.
const SCHEMA_VERSION = "2";
const SCHEMA_VALUE = `${SCHEMA_ID}:${SCHEMA_VERSION}`;
const RETENTION_FLOOR_KEY = "retention_floor";
const STATE_ROW = 1;

const CURRENT_TABLES = new Set([
  "runtime_meta",
  "runtime_owner",
  "runtime_state",
  "agents",
  "runs",
  "messages",
  "input_requests",
  "tool_calls",
  "run_events",
  "consumer_checkpoints",
  "idempotency",
  "agents_created_idx",
  "runs_agent_sequence_unique",
  "runs_active_idx",
  "run_events_sequence_idx",
]);

const CURRENT_SCHEMA_SQL = `
  CREATE TABLE runtime_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE runtime_owner (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    owner_id TEXT,
    owner_token TEXT,
    epoch INTEGER NOT NULL,
    expires_at INTEGER,
    released_epoch INTEGER
  );
  CREATE TABLE runtime_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    state_json TEXT NOT NULL
  );
  CREATE TABLE agents (
    id TEXT PRIMARY KEY NOT NULL,
    agent_sequence INTEGER,
    metadata_json TEXT,
    config_token TEXT,
    config_identity TEXT,
    created_at TEXT NOT NULL,
    activated_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL,
    agent_sequence INTEGER NOT NULL,
    state TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    sequence_within_run INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (run_id, sequence_within_run)
  );
  CREATE TABLE input_requests (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    state TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE run_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE consumer_checkpoints (
    consumer_id TEXT PRIMARY KEY NOT NULL,
    sequence INTEGER NOT NULL,
    event_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE idempotency (
    scope TEXT PRIMARY KEY NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT NOT NULL
  );
  CREATE INDEX agents_created_idx ON agents (created_at, id);
  CREATE UNIQUE INDEX runs_agent_sequence_unique ON runs (agent_id, agent_sequence);
  CREATE INDEX runs_active_idx ON runs (agent_id, state, agent_sequence);
  CREATE INDEX run_events_sequence_idx ON run_events (sequence);
`;

type OwnerRow = {
  singleton: number;
  owner_id: string | null;
  owner_token: string | null;
  epoch: number;
  expires_at: number | null;
  released_epoch: number | null;
};

type StateRow = { state_json: string };
type EventRow = { payload_json: string };

type SqliteOperation<T> = (store: InMemoryStore, lease: OwnerLease) => T;

export class SqliteStore implements DurableStore {
  private readonly database: Database;
  private closed = false;
  private configured = false;

  constructor(filename = ":memory:") {
    // Opening the SQLite handle is intentionally the only constructor side effect.
    // Schema inspection, PRAGMAs, and all writes happen in openOwner().
    this.database = new Database(filename, { create: true, readwrite: true, strict: true });
  }

  async openOwner(input: { ownerId: string; leaseMs: number }): Promise<OwnedStore> {
    this.assertOpen();
    assertOwnerInput(input.ownerId, input.leaseMs);
    this.ensureSchema();

    const lease = this.immediateTransaction(() => {
      const row = this.readOwner();
      const now = Date.now();
      if (row.owner_id && row.owner_token && row.expires_at !== null && row.expires_at > now) {
        if (row.owner_id !== input.ownerId) {
          throw new RuntimeError("runtime_already_owned", {
            expiresAt: new Date(row.expires_at).toISOString(),
            retryAfterMs: Math.max(1, row.expires_at - now),
          });
        }
        const replay = ownerLease(row);
        this.writeOwner({ ...row, expires_at: now + input.leaseMs });
        return { ...replay, expiresAt: new Date(now + input.leaseMs).toISOString() };
      }

      const state = this.readState();
      const memory = InMemoryStore.fromState(state);
      if (row.owner_id && row.owner_token && row.epoch > 0) {
        memory.attachOwner(ownerLease(row));
        memory.interruptOwner(row.epoch);
      }
      const epoch = row.epoch + 1;
      const token = `${state.incarnation}:${epoch}:${input.ownerId}` as OwnerToken;
      const next: OwnerRow = {
        singleton: STATE_ROW,
        owner_id: input.ownerId,
        owner_token: token,
        epoch,
        expires_at: now + input.leaseMs,
        released_epoch: row.released_epoch,
      };
      this.writeOwner(next);
      this.persistState(memory.exportState());
      return {
        ownerId: input.ownerId,
        token,
        epoch,
        expiresAt: new Date(now + input.leaseMs).toISOString(),
      } satisfies OwnerLease;
    });
    return new SqliteOwnedStore(this, lease);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }

  async reserveAgent(lease: OwnerLease, input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string; historySeed?: import("./contracts").HistorySeed }): Promise<AgentRecord> {
    return this.invoke(lease, (store, current) => store.reserveAgent(current, input));
  }

  async activateAgent(lease: OwnerLease, agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord> {
    return this.invoke(lease, (store, current) => store.activateAgent(current, agentId, configToken, configIdentity));
  }

  async updateAgentConfigToken(lease: OwnerLease, input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord> {
    return this.invoke(lease, (store, current) => store.updateAgentConfigToken(current, input));
  }

  async deleteAgent(lease: OwnerLease, input: AgentDeletionRequest): Promise<void> {
    return this.invoke(lease, (store, current) => store.deleteAgent(current, input));
  }

  async reviseMessage(lease: OwnerLease, input: {
    agentId: AgentId;
    messageId: MessageId;
    expectedMessageRevision: number;
    content: import("../runtime-events").UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<import("./contracts").MessageRevisionResult> {
    return this.invoke(lease, (store, current) => store.reviseMessage(current, input));
  }

  async createRun(lease: OwnerLease, input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.createRun(current, input));
  }

  async claimRun(lease: OwnerLease, input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): Promise<RunClaim> {
    return this.invoke(lease, (store, current) => store.claimRun(current, input));
  }

  async failQueuedRun(lease: OwnerLease, input: { runId: RunId; expectedRevision: number; failure: Extract<RunFailure, { code: "configuration_unavailable" | "checkpoint_incompatible" }> }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.failQueuedRun(current, input));
  }

  async commitInputRequired(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    requestId?: InputRequestId;
    phase: string;
    prompt: AssistantMessage;
    checkpoint: ExecutionCheckpoint;
    interactions?: readonly PhaseInteraction[];
    interactionAnswers?: Readonly<Record<string, JsonValue>>;
  }): Promise<InputRequiredCommit> {
    return this.invoke(lease, (store, current) => store.commitInputRequired(current, input));
  }

  async answerInput(lease: OwnerLease, input: { runId: RunId; requestId: InputRequestId; expectedRevision: number; input: UserInput; messageId?: MessageId }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.answerInput(current, input));
  }

  async answerInteraction(lease: OwnerLease, input: { runId: RunId; interactionId: string; expectedRevision: number; input: JsonValue }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.answerInteraction(current, input));
  }

  async commitOutcome(lease: OwnerLease, input: {
    runId: RunId;
    execution: ExecutionToken;
    expectedRevision: number;
    outcome?: Outcome;
    failure?: RunFailure;
    output?: AssistantMessage;
  }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.commitOutcome(current, input));
  }

  async reserveToolCall(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; name: string; args: JsonValue; toolCallId?: ToolCallId; providerToolCallId?: string }): Promise<ToolCommit> {
    return this.invoke(lease, (store, current) => store.reserveToolCall(current, input));
  }

  async reserveToolCalls(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; calls: readonly Readonly<{ providerToolCallId: string; name: string; args: JsonValue; toolCallId?: ToolCallId }>[] }): Promise<import("./contracts").ToolBatchCommit> {
    return this.invoke(lease, (store, current) => store.reserveToolCalls(current, input));
  }

  async startToolCall(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId }): Promise<ToolCommit> {
    return this.invoke(lease, (store, current) => store.startToolCall(current, input));
  }

  async commitToolResult(lease: OwnerLease, input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId; result: ToolExecutionResult; state: "completed" | "failed" | "indeterminate"; reason?: string }): Promise<ToolCommit> {
    return this.invoke(lease, (store, current) => store.commitToolResult(current, input));
  }

  async cancelRun(lease: OwnerLease, input: { runId: RunId; expectedRevision?: number; reason?: string; output?: AssistantMessage }): Promise<RunRecord> {
    return this.invoke(lease, (store, current) => store.cancelRun(current, input));
  }

  async snapshotRun(lease: OwnerLease, runId: RunId): Promise<RunSnapshot> {
    return this.invoke(lease, (store, current) => store.snapshotRun(current, runId), false);
  }

  async history(lease: OwnerLease, agentId: AgentId): Promise<readonly import("../runtime-events").Message[]> {
    return this.invoke(lease, (store, current) => store.history(current, agentId), false);
  }

  async listAgents(lease: OwnerLease): Promise<readonly AgentRecord[]> {
    return this.invoke(lease, (store, current) => store.listAgents(current), false);
  }

  async listRuns(lease: OwnerLease, input: { agentId?: AgentId; states?: readonly RunState[] } = {}): Promise<readonly RunRecord[]> {
    return this.invoke(lease, (store, current) => store.listRuns(current, input), false);
  }

  async listEvents(lease: OwnerLease, input: { after?: EventCursor } = {}): Promise<readonly DurableRunEvent[]> {
    this.assertOpen();
    return this.readTransaction(() => {
      this.requireMatchingOwner(lease, true);
      const retentionRow = this.database.query(
        "SELECT value FROM runtime_meta WHERE key = ?",
      ).get(RETENTION_FLOOR_KEY) as { value: string } | null;
      const retentionFloor = Math.max(1, Number(retentionRow?.value ?? "1"));
      const after = input.after ? parseEventCursor(lease, input.after) : retentionFloor - 1;
      if (input.after && after < retentionFloor - 1) {
        throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "expired" });
      }
      if (input.after) {
        const latest = this.database.query(
          "SELECT max(sequence) AS sequence FROM run_events",
        ).get() as { sequence: number | null };
        const waterline = latest.sequence ?? 0;
        if (after > waterline) {
          throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "beyond_waterline" });
        }
        if (after === waterline) return [];
      }
      const rows = this.database.query(
        "SELECT payload_json FROM run_events ORDER BY sequence",
      ).all() as EventRow[];
      return rows
        .map((row) => JSON.parse(row.payload_json) as DurableRunEvent)
        .filter((event) => parseEventCursor(lease, event.cursor) > after);
    });
  }

  async openConsumer(lease: OwnerLease, consumerId: string): Promise<ConsumerRegistration> {
    return this.invoke(lease, (store, current) => store.openConsumer(current, consumerId), false);
  }

  async advanceConsumerCheckpoint(lease: OwnerLease, input: { consumerId: string; cursor: EventCursor }): Promise<void> {
    return this.invoke(lease, (store, current) => store.advanceConsumerCheckpoint(current, input));
  }

  async compact(lease: OwnerLease, input: { now?: string; retentionMs?: number } = {}): Promise<RetentionResult> {
    this.assertOpen();
    const result = this.invoke(lease, (store, current) => store.compact(current, input));
    if (result.deletedEventCount > 0 || result.deletedRunIds.length > 0) {
      this.database.run("PRAGMA wal_checkpoint(PASSIVE)");
      this.database.run("PRAGMA incremental_vacuum");
    }
    return result;
  }

  async renewOwner(lease: OwnerLease, leaseMs: number): Promise<OwnerLease> {
    this.assertOpen();
    assertOwnerInput(lease.ownerId, leaseMs);
    return this.immediateTransaction(() => {
      // This transaction races atomically with openOwner(). A delayed
      // heartbeat may revive the same identity only while its epoch remains
      // current; an owner that already advanced the epoch still fences it.
      const row = this.requireMatchingOwner(lease, false);
      const expiresAt = Date.now() + leaseMs;
      this.writeOwner({ ...row, expires_at: expiresAt });
      return { ...lease, expiresAt: new Date(expiresAt).toISOString() };
    });
  }

  async sealAndReleaseOwner(lease: OwnerLease): Promise<void> {
    this.assertOpen();
    this.immediateTransaction(() => {
      const row = this.readOwner();
      if (!row.owner_id && row.released_epoch === lease.epoch) return;
      if (row.owner_id !== lease.ownerId || row.owner_token !== lease.token || row.epoch !== lease.epoch) {
        throw ownershipLost(lease, row);
      }
      const memory = InMemoryStore.fromState(this.readState());
      memory.attachOwner(lease);
      memory.interruptOwner(lease.epoch, "The Runtime owner was sealed.");
      this.persistState(memory.exportState());
      this.writeOwner({ ...row, owner_id: null, owner_token: null, expires_at: null, released_epoch: lease.epoch });
    });
  }

  private invoke<T>(lease: OwnerLease, operation: SqliteOperation<T>, persist = true): T {
    this.assertOpen();
    return this.immediateTransaction(() => {
      this.requireMatchingOwner(lease, true);
      const memory = InMemoryStore.fromState(this.readState());
      memory.attachOwner(lease);
      const result = operation(memory, lease);
      if (persist) {
        this.requireMatchingOwner(lease, true);
        this.persistState(memory.exportState());
      }
      return result;
    });
  }

  private ensureSchema(): void {
    const catalog = this.catalog();
    if (catalog.length > 0 && !this.isCurrentSchema(catalog)) {
      throw unsupportedStoreVersion(catalog.join(","));
    }
    if (catalog.length === 0) {
      this.configure();
      this.immediateTransaction(() => {
        for (const statement of CURRENT_SCHEMA_SQL.split(";")) {
          const sql = statement.trim();
          if (sql) this.database.run(sql);
        }
        this.database.run("INSERT INTO runtime_meta (key, value) VALUES (?, ?)", ["schema_version", SCHEMA_VALUE]);
        this.database.run("INSERT INTO runtime_meta (key, value) VALUES (?, ?)", [RETENTION_FLOOR_KEY, "1"]);
        const state = new InMemoryStore();
        this.database.run("INSERT INTO runtime_owner (singleton, epoch) VALUES (?, ?)", [STATE_ROW, 0]);
        this.database.run("INSERT INTO runtime_state (singleton, state_json) VALUES (?, ?)", [STATE_ROW, JSON.stringify(state.exportState())]);
      });
      return;
    }
    this.configure();
  }

  private isCurrentSchema(catalog: readonly string[]): boolean {
    if (catalog.length !== CURRENT_TABLES.size || catalog.some((name) => !CURRENT_TABLES.has(name))) return false;
    const row = this.database.query("SELECT value FROM runtime_meta WHERE key = 'schema_version'").get() as { value: string } | null;
    return row?.value === SCHEMA_VALUE;
  }

  private configure(): void {
    if (this.configured) return;
    this.database.run("PRAGMA foreign_keys = ON");
    this.database.run("PRAGMA busy_timeout = 5000");
    this.database.run("PRAGMA journal_mode = WAL");
    this.database.run("PRAGMA synchronous = NORMAL");
    this.configured = true;
  }

  private catalog(): string[] {
    const rows = this.database.query(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  private readOwner(): OwnerRow {
    const row = this.database.query("SELECT * FROM runtime_owner WHERE singleton = ?").get(STATE_ROW) as OwnerRow | null;
    if (!row) throw new RuntimeError("store_unavailable", { operation: "read_owner", retryable: false, reason: "runtime_owner row is missing" });
    return row;
  }

  private writeOwner(row: OwnerRow): void {
    this.database.run(
      "UPDATE runtime_owner SET owner_id = ?, owner_token = ?, epoch = ?, expires_at = ?, released_epoch = ? WHERE singleton = ?",
      [row.owner_id, row.owner_token, row.epoch, row.expires_at, row.released_epoch, STATE_ROW],
    );
  }

  private readState(): InMemoryStoreState {
    const row = this.database.query("SELECT state_json FROM runtime_state WHERE singleton = ?").get(STATE_ROW) as StateRow | null;
    if (!row) throw new RuntimeError("store_unavailable", { operation: "read_state", retryable: false, reason: "runtime_state row is missing" });
    return JSON.parse(row.state_json) as InMemoryStoreState;
  }

  private writeState(state: InMemoryStoreState): void {
    this.database.run("UPDATE runtime_state SET state_json = ? WHERE singleton = ?", [JSON.stringify(state), STATE_ROW]);
  }

  private persistState(state: InMemoryStoreState): void {
    this.writeState(state);
    this.database.run(
      "INSERT INTO runtime_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [RETENTION_FLOOR_KEY, String(Math.max(1, state.retentionFloor ?? 1))],
    );
    for (const table of ["consumer_checkpoints", "idempotency", "run_events", "messages", "input_requests", "tool_calls", "runs", "agents"] as const) {
      this.database.run(`DELETE FROM ${table}`);
    }
    for (const agent of state.agents) {
      this.database.run(
        "INSERT INTO agents (id, metadata_json, config_token, config_identity, created_at, activated_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [agent.id, agent.metadata === undefined ? null : JSON.stringify(agent.metadata), agent.currentConfigToken ?? null, agent.currentConfigIdentity ?? null, agent.createdAt, agent.activatedAt ?? null, agent.updatedAt],
      );
    }
    for (const run of state.runs) {
      this.database.run(
        "INSERT INTO runs (id, agent_id, agent_sequence, state, revision, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [run.id, run.agentId, run.agentSequence, run.state, run.revision, JSON.stringify(run), run.createdAt, run.updatedAt],
      );
    }
    for (const message of state.messages) {
      this.database.run(
        "INSERT INTO messages (id, run_id, sequence_within_run, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
        [message.id, message.runId, message.sequenceWithinRun, JSON.stringify(message), message.createdAt],
      );
    }
    for (const toolCall of state.toolCalls) {
      this.database.run(
        "INSERT INTO tool_calls (id, run_id, execution_id, state, payload_json) VALUES (?, ?, ?, ?, ?)",
        [toolCall.id, toolCall.runId, toolCall.executionId, toolCall.state, JSON.stringify(toolCall)],
      );
    }
    for (const event of state.events) {
      this.database.run(
        "INSERT INTO run_events (id, run_id, payload_json, created_at) VALUES (?, ?, ?, ?)",
        [event.id, event.runId, JSON.stringify(event), event.createdAt],
      );
    }
    for (const [scope, receipt] of state.idempotency) {
      this.database.run(
        "INSERT INTO idempotency (scope, payload_json, result_json) VALUES (?, ?, ?)",
        [scope, receipt.payload, JSON.stringify(receipt.result)],
      );
    }
    for (const [scope, receipt] of state.operationReceipts) {
      this.database.run(
        "INSERT INTO idempotency (scope, payload_json, result_json) VALUES (?, ?, ?)",
        [`operation:${scope}`, receipt.payload, JSON.stringify(receipt.result)],
      );
    }
    for (const [consumerId, cursor] of state.consumerCheckpoints ?? []) {
      this.database.run(
        "INSERT INTO consumer_checkpoints (consumer_id, sequence, event_id, updated_at) VALUES (?, ?, ?, ?)",
        [consumerId, Number(String(cursor).split(":").at(-1)), null, new Date().toISOString()],
      );
    }
  }

  private requireMatchingOwner(lease: OwnerLease, requireLive: boolean): OwnerRow {
    const row = this.readOwner();
    if (row.owner_id !== lease.ownerId || row.owner_token !== lease.token || row.epoch !== lease.epoch) {
      throw ownershipLost(lease, row);
    }
    if (requireLive && (row.expires_at === null || row.expires_at <= Date.now())) {
      throw new RuntimeError("runtime_ownership_lost", {
        reason: "expired",
        expectedEpoch: lease.epoch,
        actualEpoch: row.epoch,
        ...(row.expires_at === null ? {} : { expiresAt: new Date(row.expires_at).toISOString() }),
      });
    }
    return row;
  }

  private immediateTransaction<T>(operation: () => T): T {
    this.database.run("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.run("COMMIT");
      return result;
    } catch (error) {
      try { this.database.run("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    }
  }

  private readTransaction<T>(operation: () => T): T {
    this.database.run("BEGIN");
    try {
      const result = operation();
      this.database.run("COMMIT");
      return result;
    } catch (error) {
      try { this.database.run("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new RuntimeError("runtime_closed", null);
  }
}

class SqliteOwnedStore implements OwnedStore {
  constructor(private readonly store: SqliteStore, public lease: OwnerLease) {}

  reserveAgent(input: { idempotencyKey: string; metadata?: Metadata; configIdentity?: string; historySeed?: import("./contracts").HistorySeed }): Promise<AgentRecord> { return this.store.reserveAgent(this.lease, input); }
  activateAgent(agentId: AgentId, configToken?: ConfigToken, configIdentity?: string): Promise<AgentRecord> { return this.store.activateAgent(this.lease, agentId, configToken, configIdentity); }
  updateAgentConfigToken(input: { agentId: AgentId; token: ConfigToken; configIdentity?: string; idempotencyKey: string }): Promise<AgentRecord> { return this.store.updateAgentConfigToken(this.lease, input); }
  deleteAgent(input: AgentDeletionRequest): Promise<void> { return this.store.deleteAgent(this.lease, input); }
  reviseMessage(input: {
    agentId: AgentId;
    messageId: MessageId;
    expectedMessageRevision: number;
    content: import("../runtime-events").UserContent;
    operationId: string;
    effectDigestConfirmation?: string;
  }): Promise<import("./contracts").MessageRevisionResult> { return this.store.reviseMessage(this.lease, input); }
  compact(input?: { now?: string; retentionMs?: number }): Promise<RetentionResult> { return this.store.compact(this.lease, input); }
  createRun(input: { agentId: AgentId; input: UserInput; metadata?: Metadata; idempotencyKey: string }): Promise<RunRecord> { return this.store.createRun(this.lease, input); }
  claimRun(input: { runId: RunId; expectedRevision: number; executionId?: ExecutionId; messageId?: MessageId; configToken?: ConfigToken }): Promise<RunClaim> { return this.store.claimRun(this.lease, input); }
  failQueuedRun(input: { runId: RunId; expectedRevision: number; failure: Extract<RunFailure, { code: "configuration_unavailable" | "checkpoint_incompatible" }> }): Promise<RunRecord> { return this.store.failQueuedRun(this.lease, input); }
  commitInputRequired(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestId?: InputRequestId; phase: string; prompt: AssistantMessage; checkpoint: ExecutionCheckpoint; interactions?: readonly PhaseInteraction[]; interactionAnswers?: Readonly<Record<string, JsonValue>> }): Promise<InputRequiredCommit> { return this.store.commitInputRequired(this.lease, input); }
  answerInput(input: { runId: RunId; requestId: InputRequestId; expectedRevision: number; input: UserInput; messageId?: MessageId }): Promise<RunRecord> { return this.store.answerInput(this.lease, input); }
  answerInteraction(input: { runId: RunId; interactionId: string; expectedRevision: number; input: JsonValue }): Promise<RunRecord> { return this.store.answerInteraction(this.lease, input); }
  commitOutcome(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; outcome?: Outcome; failure?: RunFailure; output?: AssistantMessage }): Promise<RunRecord> { return this.store.commitOutcome(this.lease, input); }
  reserveToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; name: string; args: JsonValue; toolCallId?: ToolCallId; providerToolCallId?: string }): Promise<ToolCommit> { return this.store.reserveToolCall(this.lease, input); }
  reserveToolCalls(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; requestMessageId: MessageId; calls: readonly Readonly<{ providerToolCallId: string; name: string; args: JsonValue; toolCallId?: ToolCallId }>[] }): Promise<import("./contracts").ToolBatchCommit> { return this.store.reserveToolCalls(this.lease, input); }
  startToolCall(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId }): Promise<ToolCommit> { return this.store.startToolCall(this.lease, input); }
  commitToolResult(input: { runId: RunId; execution: ExecutionToken; expectedRevision: number; toolCallId: ToolCallId; result: ToolExecutionResult; state: "completed" | "failed" | "indeterminate"; reason?: string }): Promise<ToolCommit> { return this.store.commitToolResult(this.lease, input); }
  cancelRun(input: { runId: RunId; expectedRevision?: number; reason?: string; output?: AssistantMessage }): Promise<RunRecord> { return this.store.cancelRun(this.lease, input); }
  snapshotRun(runId: RunId): Promise<RunSnapshot> { return this.store.snapshotRun(this.lease, runId); }
  history(agentId: AgentId): Promise<readonly import("../runtime-events").Message[]> { return this.store.history(this.lease, agentId); }
  listAgents(): Promise<readonly AgentRecord[]> { return this.store.listAgents(this.lease); }
  listRuns(input?: { agentId?: AgentId; states?: readonly RunState[] }): Promise<readonly RunRecord[]> { return this.store.listRuns(this.lease, input); }
  listEvents(input?: { after?: EventCursor }): Promise<readonly DurableRunEvent[]> { return this.store.listEvents(this.lease, input); }
  openConsumer(consumerId: string): Promise<ConsumerRegistration> { return this.store.openConsumer(this.lease, consumerId); }
  advanceConsumerCheckpoint(input: { consumerId: string; cursor: EventCursor }): Promise<void> { return this.store.advanceConsumerCheckpoint(this.lease, input); }
  async renewOwner(leaseMs: number): Promise<OwnerLease> { this.lease = await this.store.renewOwner(this.lease, leaseMs); return this.lease; }
  sealAndReleaseOwner(): Promise<void> { return this.store.sealAndReleaseOwner(this.lease); }
}

function ownerLease(row: OwnerRow): OwnerLease {
  if (!row.owner_id || !row.owner_token || row.expires_at === null) throw new Error("Owner row is empty.");
  return {
    ownerId: row.owner_id,
    token: row.owner_token as OwnerToken,
    epoch: row.epoch,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function parseEventCursor(lease: OwnerLease, cursor: EventCursor): number {
  const value = String(cursor);
  const separator = value.lastIndexOf(":");
  const incarnation = separator < 0 ? "" : value.slice(0, separator);
  const sequence = separator < 0 ? "" : value.slice(separator + 1);
  const token = String(lease.token);
  const ownerSuffix = `:${lease.epoch}:${lease.ownerId}`;
  const expectedIncarnation = token.endsWith(ownerSuffix)
    ? token.slice(0, -ownerSuffix.length)
    : "";
  if (incarnation !== expectedIncarnation || !/^\d+$/.test(sequence)) {
    throw new RuntimeError("invalid_cursor", { cursorType: "event", reason: "wrong_store" });
  }
  return Number(sequence);
}

function ownershipLost(lease: OwnerLease, row: OwnerRow): RuntimeError<"runtime_ownership_lost"> {
  return new RuntimeError("runtime_ownership_lost", {
    reason: row.epoch > lease.epoch ? "epoch_advanced" : row.owner_id ? "released" : "released",
    expectedEpoch: lease.epoch,
    actualEpoch: row.epoch,
    ...(row.expires_at === null ? {} : { expiresAt: new Date(row.expires_at).toISOString() }),
  });
}

function unsupportedStoreVersion(found: string | null): RuntimeError<"unsupported_store_version"> {
  return new RuntimeError("unsupported_store_version", { found, supported: SCHEMA_VALUE });
}

function assertOwnerInput(ownerId: string, leaseMs: number): void {
  if (typeof ownerId !== "string" || ownerId.length === 0) throw new TypeError("ownerId must be non-empty");
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new TypeError("leaseMs must be a positive finite number");
}
