import { createMessage, type AgentMessage } from "@rowan-agent/session";
import type { Agent, AgentRunOverride } from "../../src/agent";
import type { AgentContext, Tool } from "../../src/types";

export function createTestContext(input: {
  systemPrompt?: string;
  tools?: Tool[];
  messages?: AgentMessage[];
} = {}): AgentContext {
  return {
    systemPrompt: input.systemPrompt ?? "Test system",
    messages: input.messages ?? [],
    ...(input.tools ? { tools: input.tools } : {}),
  };
}

export function appendUserMessage(context: AgentContext, input: string): AgentContext {
  return {
    ...context,
    messages: [
      ...context.messages,
      createMessage("user", input, { scope: "conversation" }),
    ],
  };
}

export function contextFromAgentTurn(agent: Agent, input: string): AgentContext {
  return appendUserMessage(
    {
      ...agent.state.context,
      messages: agent.state.session?.messages ?? agent.state.context.messages,
    },
    input,
  );
}

export function runAgentTurn(
  agent: Agent,
  input: string,
  config: Partial<Omit<AgentRunOverride, "context">> = {},
) {
  return agent.run({ ...config, context: contextFromAgentTurn(agent, input) });
}
