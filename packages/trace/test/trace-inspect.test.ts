import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filterTraceEvents,
  inspectTraceRun,
  listTraceRuns,
  readTraceFile,
} from "../src";

test("trace reader and inspector read v0.1.0 JSONL events", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-trace-inspect-"));
  const tracePath = join(runsDir, "2026-05-01T121314-15+08:00-run_1234abcd.jsonl");
  await writeFile(
    tracePath,
    [
      JSON.stringify({ type: "session_start", sessionId: "ses_one", ts: "2026-05-01T121314-15+08:00" }),
      JSON.stringify({
        type: "model_call",
        phase: "plan",
        model: { provider: "test", name: "model" },
        usage: { inputMessages: 3, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        ts: "2026-05-01T121315-15+08:00",
      }),
      JSON.stringify({ type: "session_end", sessionId: "ses_one", ts: "2026-05-01T121316-15+08:00" }),
      "",
    ].join("\n"),
    "utf8",
  );

  const runs = await listTraceRuns(runsDir);
  expect(runs).toHaveLength(1);
  expect(runs[0]?.runId).toBe("run_1234abcd");

  const events = await readTraceFile(tracePath);
  expect(events).toHaveLength(3);
  expect(filterTraceEvents(events, { type: "model_call" })).toHaveLength(1);
  expect(filterTraceEvents(events, { sessionId: "ses_one" })).toHaveLength(2);

  const summary = await inspectTraceRun("run_1234abcd", runsDir);
  expect(summary.eventCount).toBe(3);
  expect(summary.eventTypes.model_call).toBe(1);
  expect(summary.sessionIds).toEqual(["ses_one"]);
});
