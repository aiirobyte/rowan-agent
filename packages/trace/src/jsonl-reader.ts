import { readFile } from "node:fs/promises";
import type { AgentEvent } from "@rowan-agent/agent";

export class TraceReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceReadError";
  }
}

export type TraceEventRecord = {
  event: AgentEvent;
  line: number;
};

export async function readTraceFile(path: string): Promise<AgentEvent[]> {
  return (await readTraceRecords(path)).map((record) => record.event);
}

export async function readTraceRecords(path: string): Promise<TraceEventRecord[]> {
  const content = await readFile(path, "utf8");
  const records: TraceEventRecord[] = [];

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      records.push({
        event: JSON.parse(trimmed) as AgentEvent,
        line: index + 1,
      });
    } catch (error) {
      throw new TraceReadError(
        `Invalid JSONL trace at ${path}:${index + 1}: ${
          error instanceof Error ? error.message : "parse failed"
        }`,
      );
    }
  }

  return records;
}
