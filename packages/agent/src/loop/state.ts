import type {
  AgentMessage,
  RuntimeDepth,
} from "../types";

export function snapshotMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    ...(message.metadata ? { metadata: { ...message.metadata } } : {}),
  };
}

export function snapshotMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(snapshotMessage);
}

export function runtimeDepth(input: {
  threadDepth: number;
  maxThreadDepth: number;
}): RuntimeDepth {
  return {
    threadDepth: input.threadDepth,
    maxThreadDepth: input.maxThreadDepth,
  };
}
