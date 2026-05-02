import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AgentEvent } from "@rowan-agent/agent";
import { resolveRowanWorkspacePaths } from "@rowan-agent/workspace";
import { readTraceFile } from "./jsonl-reader";

export type TraceSummary = {
  filePath: string;
  fileName: string;
  sessionId?: string;
  timestamp?: string;
  sizeBytes: number;
  updatedAt: string;
};

export type TraceEventFilter = {
  type?: AgentEvent["type"];
  sessionId?: string;
};

export type TraceInspectSummary = {
  filePath: string;
  eventCount: number;
  firstTs?: string;
  lastTs?: string;
  eventTypes: Record<string, number>;
  sessionIds: string[];
  subSessions: Array<{ parentSessionId: string; sessionId: string }>;
};

const SESSION_FILE_PATTERN = /^(?:(?<timestamp>.+)-)?(?<sessionId>ses_[a-f0-9]{8})\.jsonl$/;

function defaultRunsDir(): string {
  return resolveRowanWorkspacePaths().runsDir;
}

function maybeTraceMetadata(fileName: string): Pick<TraceSummary, "sessionId" | "timestamp"> {
  const sessionMatch = fileName.match(SESSION_FILE_PATTERN);
  if (sessionMatch?.groups?.sessionId) {
    return {
      sessionId: sessionMatch.groups.sessionId,
      ...(sessionMatch.groups.timestamp ? { timestamp: sessionMatch.groups.timestamp } : {}),
    };
  }

  return {};
}

function eventSessionId(event: AgentEvent): string | undefined {
  if (event.type === "session_created" || event.type === "session_loaded") {
    return event.session.id;
  }
  if (event.type === "sub_session_start" || event.type === "sub_session_end") {
    return event.sessionId;
  }
  return undefined;
}

export async function listTraces(runsDir = defaultRunsDir()): Promise<TraceSummary[]> {
  const entries = await readdir(runsDir, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const filePath = join(runsDir, entry.name);
        const fileStat = await stat(filePath);
        return {
          filePath,
          fileName: entry.name,
          ...maybeTraceMetadata(entry.name),
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        };
      }),
  );

  return summaries.sort((left, right) => right.fileName.localeCompare(left.fileName));
}

export async function resolveTracePath(input: string, runsDir = defaultRunsDir()): Promise<string> {
  if (input.endsWith(".jsonl") || input.includes("/") || input.includes("\\")) {
    return input;
  }

  const traces = await listTraces(runsDir);
  const match = traces.find((trace) => trace.sessionId === input || trace.fileName.includes(input));
  if (!match) {
    throw new Error(`Trace not found: ${input}`);
  }

  return match.filePath;
}

export function filterTraceEvents(events: AgentEvent[], filter: TraceEventFilter = {}): AgentEvent[] {
  return events.filter((event) => {
    if (filter.type && event.type !== filter.type) {
      return false;
    }

    if (filter.sessionId && eventSessionId(event) !== filter.sessionId) {
      return false;
    }

    return true;
  });
}

export function summarizeTraceEvents(filePath: string, events: AgentEvent[]): TraceInspectSummary {
  const eventTypes: Record<string, number> = {};
  const sessionIds = new Set<string>();
  const childSessionKeys = new Set<string>();
  const subSessions: Array<{ parentSessionId: string; sessionId: string }> = [];

  const addSubSession = (parentSessionId: string, sessionId: string) => {
    const key = `${parentSessionId}\0${sessionId}`;
    if (childSessionKeys.has(key)) {
      return;
    }
    childSessionKeys.add(key);
    subSessions.push({ parentSessionId, sessionId });
  };

  for (const event of events) {
    eventTypes[event.type] = (eventTypes[event.type] ?? 0) + 1;
    const sessionId = eventSessionId(event);
    if (sessionId) {
      sessionIds.add(sessionId);
    }
    if (event.type === "sub_session_start" || event.type === "sub_session_end") {
      sessionIds.add(event.parentSessionId);
      sessionIds.add(event.sessionId);
      addSubSession(event.parentSessionId, event.sessionId);
    }
    if ((event.type === "session_created" || event.type === "session_loaded") && event.session.parentSessionId) {
      addSubSession(event.session.parentSessionId, event.session.id);
    }
  }

  return {
    filePath,
    eventCount: events.length,
    ...(events[0]?.ts ? { firstTs: events[0].ts } : {}),
    ...(events.at(-1)?.ts ? { lastTs: events.at(-1)?.ts } : {}),
    eventTypes,
    sessionIds: [...sessionIds],
    subSessions,
  };
}

export async function inspectTrace(input: string, runsDir = defaultRunsDir()): Promise<TraceInspectSummary> {
  const filePath = await resolveTracePath(input, runsDir);
  const events = await readTraceFile(filePath);
  return summarizeTraceEvents(filePath, events);
}

export function traceLabel(trace: TraceSummary): string {
  return trace.sessionId ?? basename(trace.fileName, ".jsonl");
}
