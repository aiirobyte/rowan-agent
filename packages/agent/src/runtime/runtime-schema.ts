import type { Database } from "bun:sqlite";

const RUNTIME_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      factory_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('active', 'paused')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_messages (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      kind TEXT NOT NULL CHECK (kind IN ('agent_input')),
      payload_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'leased', 'acknowledged', 'dead_lettered')),
      attempts INTEGER NOT NULL DEFAULT 0,
      run_id TEXT,
      dead_letter_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      message_id TEXT NOT NULL REFERENCES runtime_messages(id),
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'suspended', 'completed', 'failed', 'cancelled')),
      attempt INTEGER NOT NULL DEFAULT 0,
      lease_id TEXT,
      outcome_json TEXT,
      suspension_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_leases (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id),
      worker_id TEXT NOT NULL,
      leased_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_events (
      id TEXT PRIMARY KEY NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL,
      agent_id TEXT,
      message_id TEXT,
      run_id TEXT,
      tool_call_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_tool_calls (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      run_id TEXT NOT NULL REFERENCES agent_runs(id),
      name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'indeterminate')),
      result_json TEXT,
      indeterminate_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_event_consumers (
      consumer_id TEXT PRIMARY KEY NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      event_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS runtime_messages_runnable_idx
      ON runtime_messages (agent_id, state, created_at);
    CREATE INDEX IF NOT EXISTS agent_runs_agent_state_idx
      ON agent_runs (agent_id, state, created_at);
    CREATE INDEX IF NOT EXISTS runtime_events_delivery_idx
      ON runtime_events (sequence);

    CREATE INDEX IF NOT EXISTS agent_runs_runnable_idx
      ON agent_runs (state, created_at);
`;

export function initializeRuntimeSchema(database: Database): void {
  const initialize = database.transaction(() => {
    for (const statement of RUNTIME_SCHEMA_SQL.split(";")) {
      const sql = statement.trim();
      if (sql.length > 0) {
        database.run(sql);
      }
    }
  });
  initialize();

}
