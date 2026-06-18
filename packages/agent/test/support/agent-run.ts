import { createMessage, type AgentMessage } from "@rowan-agent/agent";
import type { Agent, RunOptions } from "../../src/agent";
import type { AgentContext, Tool } from "../../src/types";

export function createTestContext(input: {
  systemPrompt?: string;
  tools?: Tool[];
  messages?: AgentMessage[];
} = {}): AgentContext {
  return {
    systemPrompt: input.systemPrompt ?? "Test system",
    messages: input.messages ?? [],
    tools: input.tools ?? [],
    skills: [],
  };
}

export function appendUserMessage(context: AgentContext, input: string): AgentContext {
  return {
    ...context,
    messages: [
      ...context.messages,
      createMessage("user", input),
    ],
  };
}

export function contextFromAgentTurn(agent: Agent, input: string): AgentContext {
  return appendUserMessage(
    {
      ...agent.state.context,
      messages: agent.state.context.messages,
    },
    input,
  );
}

export function runAgentTurn(
  agent: Agent,
  input: string,
  config: Partial<Omit<RunOptions, "context">> = {},
) {
  return agent.run({ ...config, context: contextFromAgentTurn(agent, input) });
}
