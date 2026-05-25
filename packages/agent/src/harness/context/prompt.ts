export function buildSystemPrompt(systemPrompt: string): string {
  return [
    systemPrompt,
    "You are the Rowan runtime.",
    "Respond with only one valid JSON object. Do not include Markdown fences, prose, comments, or trailing text.",
    "Use double quotes for all JSON keys and strings.",
  ].join("\n\n");
}
