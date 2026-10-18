import type { JsonObject, LlmContentBlock, LlmMessage, LlmTokenUsage, ModelRef } from "@rowan-agent/models";
import type { ContextCandidate } from "../runtime-events";

export type AgentMessage = Omit<LlmMessage, "role" | "content"> & {
  id: string;
  role: "system" | LlmMessage["role"];
  content: string | LlmContentBlock[];
  createdAt: string;
  metadata?: JsonObject & {
    phase?: string;
  };
  contexts?: readonly ContextCandidate[];
  model?: ModelRef;
  usage?: LlmTokenUsage;
};

export type Skill = {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file */
  filePath: string;
  /** Directory containing the SKILL.md file */
  baseDir: string;
  /** Full body content of the SKILL.md (after frontmatter) */
  content: string;
  /** Do not automatically inject this Skill into the model Context. */
  disableAutoInvocation?: boolean;
  /** Do not expose this Skill to direct user invocation. */
  disableImplicitInvocation?: boolean;
  /** @deprecated Use disableAutoInvocation; kept only for old in-memory callers during cutover. */
  disableModelInvocation?: boolean;
};
