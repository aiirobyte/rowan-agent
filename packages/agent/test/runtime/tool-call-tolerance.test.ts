import { expect, test } from "bun:test";
import Type from "typebox";
import Schema from "typebox/schema";
import type { StreamFn } from "@rowan-agent/models";
import { AgentRuntime, InMemoryStore } from "../../src/runtime/index";
import { createAgentWith } from "../fixtures/configuration";
import { stopResponse } from "./route-test-utils";

// Weaker models call Tools that do not exist, JSON-encode arguments twice, or
// send the wrong shape; each must come back as a result the model can act on.
test("an unknown Tool, double-encoded arguments, and invalid arguments each return a result and the turn goes on", async () => {
  const received: unknown[] = [];
  const parameters = Type.Object({ q: Type.String() });
  const validator = Schema.Compile(parameters);
  const lookup = {
    name: "lookup",
    description: "Look a word up.",
    parameters,
    // Like the Core Tools, the Tool validates its own arguments and throws a ParseError.
    execute: async (args: unknown) => {
      received.push(validator.Parse(args));
      return { ok: true as const, content: "found" };
    },
  };
  const seen: string[] = [];
  let turn = 0;
  const stream: StreamFn = async function* (request) {
    turn += 1;
    seen.push(JSON.stringify(request.messages));
    // Provider arguments arrive parsed once; a string here is a second encoding.
    const call = (name: string, args: unknown) => ({
      type: "done" as const,
      response: { content: "", toolCalls: [{ id: `c${turn}`, name, arguments: args }], stopReason: "tool_use" as const },
    });
    if (turn === 1) yield call("tdd", {});
    else if (turn === 2) yield call("lookup", JSON.stringify({ q: "rowan" }));
    else if (turn === 3) yield call("lookup", {});
    else yield { type: "done", response: stopResponse("done") };
  };
  const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
  try {
    const agentId = await createAgentWith(runtime, {
      identity: "tool-call-tolerance-v1",
      definition: { name: "tolerant", description: "Tolerant agent", prompt: "Look things up." },
      tools: [lookup],
      stream,
      options: { idempotencyKey: "tool-call-tolerance-agent" },
    });
    const run = await runtime.start(agentId, "go", { idempotencyKey: "tool-call-tolerance-run" });
    await expect(run.wait()).resolves.toMatchObject({ type: "completed" });
    expect(seen[1]).toContain("Tool tdd is not available. Available tools:");
    expect(received).toEqual([{ q: "rowan" }]);
    expect(seen[3]).toContain("Invalid arguments: / must have required properties q");
  } finally {
    await runtime.close();
  }
});
