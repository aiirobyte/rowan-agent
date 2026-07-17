import {
  AgentRuntime,
  InMemoryRuntimeStateStore,
  InMemorySessionProvider,
} from "@rowan-agent/agent";
import { createModelStream } from "@rowan-agent/models";

const runtime = await AgentRuntime.start({
  stateStore: new InMemoryRuntimeStateStore(),
  sessionProvider: new InMemorySessionProvider(),
});

try {
  const agent = await runtime.createAgent({
    context: {
      systemPrompt: "You are a concise assistant.",
      messages: [],
      tools: [],
      skills: [],
    },
    model: { provider: "openai", id: "gpt-4.1-mini" },
    stream: createModelStream(),
  });

  const run = await agent.send("Draft a release summary.");
  const unsubscribe = run.subscribe((state) => {
    if (state === "suspended") {
      void agent.send("Focus on Runtime ownership and recovery semantics.");
    }
  });

  console.log(`Agent ${agent.id}; Run ${run.id}`);
  console.log((await run.result()).message);
  unsubscribe();
} finally {
  await runtime.stop();
}
