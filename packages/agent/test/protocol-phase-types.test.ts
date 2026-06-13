import type { PhaseOutput } from "../src/loop/phases/registry";
import type { LlmRequest, LlmStreamEvent } from "@rowan-agent/models";

const chatOutput: PhaseOutput = {
  route: "stop",
  message: "Hello.",
};

void chatOutput;

const llmRequest: LlmRequest = {
  model: { provider: "test", name: "model" },
  messages: [{ role: "user", content: "hello" }],
};
const llmEvent: LlmStreamEvent = { type: "done" };

void llmRequest;
void llmEvent;
