import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AgentEvent } from "@rowan-agent/agent";
import { resolveRowanWorkspacePaths } from "@rowan-agent/workspace";
import { readTraceFile } from "./jsonl-reader";

export type TraceRunSummary = {
  filePath: string;
  fileName: string;
  runId?: string;
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

const RUN_FILE_PATTERN = /^(?<timestamp>.+)-(?<runId>run_[a-f0-9]{8})\.jsonl$/;

function defaultRunsDir(): string {
  return resolveRowanWorkspacePaths().runsDir;
}

function maybeRunMetadata(fileName: string): Pick<TraceRunSummary, "runId" | "timestamp"> {
  const match = fileName.match(RUN_FILE_PATTERN);
  return {
    ...(match?.groups?.runId ? { runId: match.groups.runId } : {}),
    ...(match?.groups?.timestamp ? { timestamp: match.groups.timestamp } : {}),
  };
}

function eventSessionId(event: AgentEvent): string | undefined {
  if ("sessionId" in event && typeof event.sessionId === "string") {
    return event.sessionId;
  }
  if (event.type === "session_created") {
    return event.session.id;
  }
  if ("childSessionId" in event && typeof event.childSessionId === "string") {
    return event.childSessionId;
  }
  return undefined;
}

export async function listTraceRuns(runsDir = defaultRunsDir()): Promise<TraceRunSummary[]> {
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
          ...maybeRunMetadata(entry.name),
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        };
      }),
  );

  return summaries.sort((left, right) => right.fileName.localeCompare(left.fileName));
}

export async function resolveTraceRunPath(input: string, runsDir = defaultRunsDir()): Promise<string> {
  if (input.endsWith(".jsonl") || input.includes("/") || input.includes("\\")) {
    return input;
  }

  const runs = await listTraceRuns(runsDir);
  const match = runs.find((run) => run.runId === input || run.fileName.includes(input));
  if (!match) {
    throw new Error(`Trace run not found: ${input}`);
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
      addSubSession(event.parentSessionId, event.sessionId);
    }
    if (event.type === "session_created" && event.session.parentSessionId) {
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

export async function inspectTraceRun(input: string, runsDir = defaultRunsDir()): Promise<TraceInspectSummary> {
  const filePath = await resolveTraceRunPath(input, runsDir);
  const events = await readTraceFile(filePath);
  return summarizeTraceEvents(filePath, events);
}

export function traceRunLabel(run: TraceRunSummary): string {
  return run.runId ?? basename(run.fileName, ".jsonl");
}
