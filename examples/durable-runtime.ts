import {
  AgentRuntime,
  InMemoryStore,
} from "@rowan-agent/agent";
import { createModelStream } from "@rowan-agent/models";

const runtime = await AgentRuntime.init({
  store: new InMemoryStore(),
});

try {
  const agentId = await runtime.createAgent({
    identity: "example:concise-assistant",
    model: { provider: "openai", id: "gpt-4.1-mini" },
    stream: createModelStream(),
    context: {
      systemPrompt: "You are a concise assistant.",
      tools: [],
      skills: [],
    },
  });

  const run = await runtime.start(agentId, "Draft a release summary.", {
    idempotencyKey: "run-example-summary",
  });

  console.log(`Agent ${agentId}; Run ${run.id}`);
  const boundary = await run.wait();
  if (boundary.type === "completed") {
    console.log(boundary.outcome.message);
  } else if (boundary.type === "input_required") {
    await run.respond({
      requestId: boundary.requestId,
      input: "Focus on Runtime ownership and recovery semantics.",
    });
    const resumed = await run.wait();
    if (resumed.type === "completed") console.log(resumed.outcome.message);
  }
} finally {
  await runtime.close();
}
