import type { LoopPhase, LoopPhaseOutputMap } from "../src/types";
import type { LlmRequest, LlmStreamEvent } from "@rowan-agent/models";

const chatPhase: LoopPhase = "chat";
const chatOutput: LoopPhaseOutputMap["chat"] = {
  route: "direct",
  message: "Hello.",
  text: "Hello.",
};

void chatPhase;
void chatOutput;

const llmRequest: LlmRequest = {
  model: { provider: "test", name: "model" },
  messages: [{ role: "user", content: "hello" }],
};
const llmEvent: LlmStreamEvent = { type: "done" };

void llmRequest;
void llmEvent;
