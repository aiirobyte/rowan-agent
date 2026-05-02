import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filterTraceEvents,
  inspectTrace,
  listTraces,
  readTraceFile,
} from "../src";

test("trace reader and inspector read session-keyed JSONL events", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-trace-inspect-"));
  const tracePath = join(runsDir, "2026-05-01T121314-15+08:00-ses_1234abcd.jsonl");
  await writeFile(
    tracePath,
    [
      JSON.stringify({
        type: "session_created",
        session: {
          version: "0.3.2",
          id: "ses_1234abcd",
          systemPrompt: "Test",
          input: "hello",
          skills: [],
        },
        ts: "2026-05-01T121314-15+08:00",
      }),
      JSON.stringify({
        type: "model_requested",
        phase: "plan",
        model: { provider: "test", name: "model" },
        usage: { inputMessages: 3, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        ts: "2026-05-01T121315-15+08:00",
      }),
      JSON.stringify({
        type: "outcome",
        outcome: { id: "out_test", passed: true, message: "Done." },
        ts: "2026-05-01T121316-15+08:00",
      }),
      "",
    ].join("\n"),
    "utf8",
  );

  const traces = await listTraces(runsDir);
  expect(traces).toHaveLength(1);
  expect(traces[0]?.sessionId).toBe("ses_1234abcd");
  expect(traces[0]?.timestamp).toBe("2026-05-01T121314-15+08:00");

  const events = await readTraceFile(tracePath);
  expect(events).toHaveLength(3);
  expect(filterTraceEvents(events, { type: "model_requested" })).toHaveLength(1);
  expect(filterTraceEvents(events, { sessionId: "ses_1234abcd" })).toHaveLength(1);

  const summary = await inspectTrace("ses_1234abcd", runsDir);
  expect(summary.eventCount).toBe(3);
  expect(summary.eventTypes.model_requested).toBe(1);
  expect(summary.sessionIds).toEqual(["ses_1234abcd"]);
  expect(summary.subSessions).toEqual([]);
});

test("trace inspector lists session-keyed trace files", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-trace-session-key-"));
  const tracePath = join(runsDir, "2026-05-01T121314-15+08:00-ses_1234abcd.jsonl");
  await writeFile(
    tracePath,
    [
      JSON.stringify({
        type: "session_created",
        session: {
          version: "0.3.2",
          id: "ses_1234abcd",
          systemPrompt: "Test",
          input: "hello",
          skills: [],
        },
        ts: "2026-05-01T121314-15+08:00",
      }),
      "",
    ].join("\n"),
    "utf8",
  );

  const traces = await listTraces(runsDir);
  expect(traces[0]?.sessionId).toBe("ses_1234abcd");
  expect(traces[0]?.timestamp).toBe("2026-05-01T121314-15+08:00");

  const summary = await inspectTrace("ses_1234abcd", runsDir);
  expect(summary.sessionIds).toEqual(["ses_1234abcd"]);
});

test("trace inspector associates sub-sessions with parents", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-trace-child-"));
  const tracePath = join(runsDir, "2026-05-01T121314-15+08:00-ses_aaaabbbb.jsonl");
  await writeFile(
    tracePath,
    [
      JSON.stringify({
        type: "session_created",
        session: {
          version: "0.3.2",
          id: "ses_aaaabbbb",
          systemPrompt: "Parent",
          input: "delegate this",
          skills: [],
        },
        ts: "2026-05-01T121314-15+08:00",
      }),
      JSON.stringify({
        type: "sub_session_start",
        parentSessionId: "ses_aaaabbbb",
        sessionId: "ses_bbbbcccc",
        prompt: "delegate this",
        ts: "2026-05-01T121315-15+08:00",
      }),
      JSON.stringify({
        type: "session_created",
        session: {
          id: "ses_bbbbcccc",
          parentSessionId: "ses_aaaabbbb",
          systemPrompt: "Child",
          input: "delegate this",
          skills: [],
        },
        ts: "2026-05-01T121316-15+08:00",
      }),
      JSON.stringify({
        type: "sub_session_end",
        parentSessionId: "ses_aaaabbbb",
        sessionId: "ses_bbbbcccc",
        outcome: { id: "out_child", passed: true, message: "Done." },
        budgetUsage: { modelCalls: 1, toolCalls: 0 },
        ts: "2026-05-01T121317-15+08:00",
      }),
      "",
    ].join("\n"),
    "utf8",
  );

  const summary = await inspectTrace("ses_aaaabbbb", runsDir);

  expect(summary.sessionIds).toEqual(["ses_aaaabbbb", "ses_bbbbcccc"]);
  expect(summary.subSessions).toEqual([
    {
      parentSessionId: "ses_aaaabbbb",
      sessionId: "ses_bbbbcccc",
    },
  ]);
});

test("trace inspector maps separate turn traces to the same persisted session", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "rowan-trace-session-"));
  const firstTrace = join(runsDir, "2026-05-01T121314-15+08:00-ses_1234abcd.jsonl");
  const secondTrace = join(runsDir, "2026-05-01T121315-15+08:00-ses_1234abcd.jsonl");

  await writeFile(
    firstTrace,
    [
      JSON.stringify({
        type: "session_created",
        session: {
          version: "0.3.2",
          id: "ses_1234abcd",
          systemPrompt: "Test",
          input: "first",
          skills: [],
        },
        ts: "2026-05-01T121314-15+08:00",
      }),
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    secondTrace,
    [
      JSON.stringify({
        type: "session_loaded",
        session: {
          version: "0.3.2",
          id: "ses_1234abcd",
          systemPrompt: "Test",
          input: "second",
          skills: [],
        },
        ts: "2026-05-01T121315-15+08:00",
      }),
      "",
    ].join("\n"),
    "utf8",
  );

  const first = await inspectTrace(firstTrace, runsDir);
  const second = await inspectTrace(secondTrace, runsDir);
  const traces = await listTraces(runsDir);

  expect(traces.map((trace) => trace.sessionId)).toEqual(["ses_1234abcd", "ses_1234abcd"]);
  expect(first.sessionIds).toEqual(["ses_1234abcd"]);
  expect(second.sessionIds).toEqual(["ses_1234abcd"]);
  expect(first.eventTypes.session_created).toBe(1);
  expect(second.eventTypes.session_loaded).toBe(1);
});
