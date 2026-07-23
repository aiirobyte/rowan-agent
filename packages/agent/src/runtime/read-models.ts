import type {
  AgentId,
  AgentListCursor,
  AgentRecord,
  AgentSummary,
  Page,
  RunListCursor,
  RunRecord,
  RunState,
  RunSummary,
} from "./contracts";
import { canonicalJson } from "./json";
import { RuntimeError } from "./errors";

type CursorPayload = Readonly<{
  store: string;
  collection: "agents" | "runs";
  filter: string;
  key: readonly [string, string];
}>;

export function pageAgents(
  records: readonly AgentRecord[],
  options: { storeIncarnation: string; after?: AgentListCursor; limit?: number } ,
): Page<AgentSummary, AgentListCursor> {
  const filter = canonicalJson({ state: "active" } as never);
  const after = decodeCursor(options.after, options.storeIncarnation, "agents", filter);
  const items = records
    .filter((record): record is AgentRecord & { activatedAt: string } => record.activatedAt !== undefined)
    .sort((left, right) => left.activatedAt.localeCompare(right.activatedAt) || left.id.localeCompare(right.id))
    .filter((record) => !after || compareKey([record.activatedAt, record.id], after.key) > 0)
    .slice(0, pageLimit(options.limit));
  const summaries: AgentSummary[] = items.map((record) => ({
    id: record.id,
    ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
    ...(record.currentConfigIdentity === undefined ? {} : { currentConfigIdentity: record.currentConfigIdentity }),
    createdAt: record.createdAt,
    activatedAt: record.activatedAt,
    updatedAt: record.updatedAt,
  }));
  return {
    items: summaries,
    ...(items.length > 0 && hasMoreAgents(records, items.at(-1)!, after, options.storeIncarnation, filter, options.limit)
      ? { next: encodeCursor({ store: options.storeIncarnation, collection: "agents", filter, key: [items.at(-1)!.activatedAt, items.at(-1)!.id] }) }
      : {}),
  };
}

export function pageRuns(
  records: readonly RunRecord[],
  options: { storeIncarnation: string; agentId?: AgentId; states?: readonly RunState[]; after?: RunListCursor; limit?: number },
): Page<RunSummary, RunListCursor> {
  const filter = canonicalJson({
    ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
    ...(options.states === undefined ? {} : { states: [...options.states].sort() }),
  } as never);
  const after = decodeCursor(options.after, options.storeIncarnation, "runs", filter);
  const items = records
    .filter((record) => options.agentId === undefined || record.agentId === options.agentId)
    .filter((record) => options.states === undefined || options.states.includes(record.state))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .filter((record) => !after || compareKey([record.createdAt, record.id], after.key) > 0)
    .slice(0, pageLimit(options.limit));
  const summaries: RunSummary[] = items.map((record) => ({
    id: record.id,
    agentId: record.agentId,
    agentSequence: record.agentSequence,
    state: record.state,
    ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
  return {
    items: summaries,
    ...(items.length > 0 && hasMoreRuns(records, items.at(-1)!, after, options.storeIncarnation, filter, options)
      ? { next: encodeCursor({ store: options.storeIncarnation, collection: "runs", filter, key: [items.at(-1)!.createdAt, items.at(-1)!.id] }) }
      : {}),
  };
}

function hasMoreAgents(
  records: readonly AgentRecord[],
  last: AgentRecord & { activatedAt: string },
  after: CursorPayload | undefined,
  storeIncarnation: string,
  filter: string,
  limit: number | undefined,
): boolean {
  const next = pageAgentsUnbounded(records, after, last, limit);
  return next.length > 0 && Boolean(encodeCursor({ store: storeIncarnation, collection: "agents", filter, key: [last.activatedAt, last.id] }));
}

function pageAgentsUnbounded(
  records: readonly AgentRecord[],
  after: CursorPayload | undefined,
  last: AgentRecord & { activatedAt: string },
  _limit: number | undefined,
): AgentRecord[] {
  return records
    .filter((record): record is AgentRecord & { activatedAt: string } => record.activatedAt !== undefined)
    .sort((left, right) => left.activatedAt.localeCompare(right.activatedAt) || left.id.localeCompare(right.id))
    .filter((record) => !after || compareKey([record.activatedAt, record.id], after.key) > 0)
    .filter((record) => compareKey([record.activatedAt, record.id], [last.activatedAt, last.id]) > 0);
}

function hasMoreRuns(
  records: readonly RunRecord[],
  last: RunRecord,
  after: CursorPayload | undefined,
  storeIncarnation: string,
  filter: string,
  options: { agentId?: AgentId; states?: readonly RunState[] },
): boolean {
  const next = records
    .filter((record) => options.agentId === undefined || record.agentId === options.agentId)
    .filter((record) => options.states === undefined || options.states.includes(record.state))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .filter((record) => !after || compareKey([record.createdAt, record.id], after.key) > 0)
    .filter((record) => compareKey([record.createdAt, record.id], [last.createdAt, last.id]) > 0);
  return next.length > 0 && Boolean(encodeCursor({ store: storeIncarnation, collection: "runs", filter, key: [last.createdAt, last.id] }));
}

function encodeCursor(payload: CursorPayload): AgentListCursor & RunListCursor {
  return encodeURIComponent(canonicalJson(payload) as string) as AgentListCursor & RunListCursor;
}

function decodeCursor(
  cursor: AgentListCursor | RunListCursor | undefined,
  store: string,
  collection: CursorPayload["collection"],
  filter: string,
): CursorPayload | undefined {
  if (!cursor) return undefined;
  let value: unknown;
  try {
    const raw = decodeURIComponent(String(cursor));
    value = JSON.parse(raw);
    if (canonicalJson(value as never) !== raw) throw new Error("non-canonical");
  } catch {
    throw invalidCursor(collection === "agents" ? "agent_list" : "run_list", "malformed");
  }
  if (!isCursorPayload(value)) throw invalidCursor(collection === "agents" ? "agent_list" : "run_list", "malformed");
  if (value.store !== store) throw invalidCursor(collection === "agents" ? "agent_list" : "run_list", "wrong_store");
  if (value.collection !== collection) throw invalidCursor(collection === "agents" ? "agent_list" : "run_list", "wrong_collection");
  if (value.filter !== filter) throw invalidCursor(collection === "agents" ? "agent_list" : "run_list", "filter_mismatch");
  return value;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.store === "string"
    && (candidate.collection === "agents" || candidate.collection === "runs")
    && typeof candidate.filter === "string"
    && Array.isArray(candidate.key)
    && candidate.key.length === 2
    && candidate.key.every((part) => typeof part === "string");
}

function compareKey(left: readonly [string, string], right: readonly [string, string]): number {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}

function pageLimit(limit: number | undefined): number {
  const value = limit ?? 100;
  if (!Number.isInteger(value) || value < 1 || value > 1_000) throw new TypeError("limit must be an integer from 1 through 1000");
  return value;
}

function invalidCursor(cursorType: "agent_list" | "run_list", reason: "malformed" | "wrong_store" | "wrong_collection" | "filter_mismatch"): RuntimeError<"invalid_cursor"> {
  return new RuntimeError("invalid_cursor", { cursorType, reason });
}
