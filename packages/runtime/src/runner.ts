import { runAgentLoop } from "./loop";
import type { AgentLoopInput, Outcome } from "./types";

export class AgentRunner {
  run(input: AgentLoopInput): Promise<Outcome> {
    return runAgentLoop(input);
  }
}
