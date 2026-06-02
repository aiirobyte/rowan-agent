import type {
  ContextScope,
  AgentContextMessage,
  AgentContextSkill,
  Outcome,
} from "@rowan-agent/models";

// Re-export shared runtime types from @rowan-agent/models (canonical source)
export type { ContextScope, AgentContextMessage, AgentContextSkill, Outcome } from "@rowan-agent/models";

export type {
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  StreamFn,
} from "@rowan-agent/models";

export type AgentContextState = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  messages: AgentContextMessage[];
  skills: AgentContextSkill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

// ---------------------------------------------------------------------------
// Scope utilities — canonical implementations
// ---------------------------------------------------------------------------

export function isContextScope(value: unknown): value is ContextScope {
  return (
    value === "conversation" ||
    value === "execution" ||
    value === "diagnostic"
  );
}

export function defaultScopeForMessage(
  role: AgentContextMessage["role"],
  metadata?: Record<string, unknown>,
): ContextScope | undefined {
  if (
    metadata?.kind === "phase_prompt" ||
    metadata?.kind === "routing_decision" ||
    metadata?.kind === "model_message" ||
    metadata?.kind === "thread_output"
  ) {
    return "execution";
  }

  if (metadata?.kind === "error" || metadata?.kind === "limit_exceeded") {
    return "diagnostic";
  }

  if (role === "user" || role === "assistant") {
    return "conversation";
  }

  if (role === "tool") {
    return "execution";
  }

  return undefined;
}

export function messageScope(message: { metadata?: { scope?: unknown } }): ContextScope | undefined {
  const scope = message.metadata?.scope;
  return isContextScope(scope) ? scope : undefined;
}

export function isConversationMessage(message: { metadata?: { scope?: unknown } }): boolean {
  return messageScope(message) === "conversation";
}

/** Unified phase output — model decides routing via route. */
export type PhaseOutput = {
  message: string;
  /** Route to next phase, or "continue" to re-execute current phase, or "stop" to end */
  route: string;
  /** Phase-specific data for the next phase */
  yield?: unknown;
};
