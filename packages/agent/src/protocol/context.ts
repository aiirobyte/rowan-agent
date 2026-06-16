import type {
  AgentContextMessage,
  AgentContextSkill,
  LlmToolChoice,
  Outcome,
} from "@rowan-agent/models";

// Re-export shared runtime types from @rowan-agent/models (canonical source)
export type { AgentContextMessage, AgentContextSkill, Outcome } from "@rowan-agent/models";

export type {
  LlmRequest,
  LlmStreamEvent,
  LlmStreamOptions,
  StreamFn,
} from "@rowan-agent/models";

/** Unified phase output — model decides routing via route. */
export type PhaseOutput = {
  message: string;
  /** Route to next phase, or "continue" to re-execute current phase, or "stop" to end */
  route: string;
  /** Tool calls from the model invocation (used by framework for route extraction) */
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  /** Route reason extracted from route tool call (for hooks to inspect) */
  routeReason?: string;
  /** Structured data from this phase, passed to the next phase */
  payload?: unknown;
};

/** Unified phase input — contains everything the model needs. */
export type PhaseInput = {
  phase: string;
  systemPrompt: string;
  messages: AgentContextMessage[];
  /** All tools (for systemPrompt display, cache-friendly) */
  tools: Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: string[] }>;
  /** All skills (for systemPrompt display) */
  skills: AgentContextSkill[];
  /** Phase-specific filtered tools (for LlmRequest.tools) */
  phaseTools?: Array<{ name: string; description: string; parameters: unknown }>;
  /** Phase-specific filtered skills */
  phaseSkills?: AgentContextSkill[];
  /** Additional guideline bullets appended to the system prompt. */
  promptGuidelines?: string[];
  /** Text to append after the system prompt. */
  appendSystemPrompt?: string;
  /** Tool choice configuration from phase definition */
  toolChoice?: LlmToolChoice;
  /** Structured data from previous phase or framework */
  payload?: unknown;
};
