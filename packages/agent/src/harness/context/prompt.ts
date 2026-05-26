export interface BuildSystemPromptOptions {
  /** Base system prompt. */
  systemPrompt: string;
  /** Additional guideline bullets appended to the default runtime instructions. */
  promptGuidelines?: string[];
  /** Text to append after the default runtime instructions. */
  appendSystemPrompt?: string;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const { systemPrompt, promptGuidelines, appendSystemPrompt } = options;

  const guidelines = (promptGuidelines ?? [])
    .map((g) => g.trim())
    .filter((g) => g.length > 0);

  const parts = [
    systemPrompt,
    "You are the Rowan runtime.",
    "Respond with only one valid JSON object. Do not include Markdown fences, prose, comments, or trailing text.",
    "Use double quotes for all JSON keys and strings.",
  ];

  if (guidelines.length > 0) {
    parts.push(guidelines.map((g) => `- ${g}`).join("\n"));
  }

  if (appendSystemPrompt) {
    parts.push(appendSystemPrompt);
  }

  return parts.join("\n\n");
}