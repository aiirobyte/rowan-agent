import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { Agent } from "../src/agent";
import { createDemoTools } from "../src/tools";
import { jsonlTraceWriter } from "../src/trace-jsonl";
import { scriptedStream } from "./support/scripted-stream";

test("jsonlTraceWriter writes agent events", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-trace-"));
  const tracePath = join(root, "run.jsonl");
  const agent = new Agent({
    systemPrompt: "Test system",
    model: { provider: "test", name: "scripted" },
    stream: scriptedStream,
    tools: createDemoTools(),
  });

  agent.subscribe(jsonlTraceWriter(tracePath));
  await agent.prompt("use echo tool");

  const trace = await readFile(tracePath, "utf8");
  expect(trace).toContain("\"type\":\"session_start\"");
  expect(trace).toContain("\"type\":\"tool_call_end\"");
  expect(trace).toContain("\"type\":\"outcome\"");
});
