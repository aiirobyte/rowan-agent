import type { LoopPhase, LoopPhaseOutputMap } from "../src/types";

const chatPhase: LoopPhase = "chat";
const chatOutput: LoopPhaseOutputMap["chat"] = {
  route: "direct",
  message: "Hello.",
  text: "Hello.",
};

void chatPhase;
void chatOutput;
