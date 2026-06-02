export interface SystemPromptOptions {
  /** Base system prompt. */
  systemPrompt: string;
  /** Additional guideline bullets appended to the default runtime instructions. */
  promptGuidelines?: string[];
  /** Text to append after the default runtime instructions. */
  appendSystemPrompt?: string;
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { systemPrompt, promptGuidelines, appendSystemPrompt } = options;

  const guidelines = (promptGuidelines ?? [])
    .map((g) => g.trim())
    .filter((g) => g.length > 0);

  const parts = [
    systemPrompt,
    "You are the Rowan runtime.",
  ];

  if (guidelines.length > 0) {
    parts.push(guidelines.map((g) => `- ${g}`).join("\n"));
  }

  if (appendSystemPrompt) {
    parts.push(appendSystemPrompt);
  }

  return parts.join("\n\n");
}