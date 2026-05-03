const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-[A-Za-z0-9_-]{12,}/g, replacement: "[REDACTED]" },
  {
    pattern: /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)=([^\s"]+)/g,
    replacement: "$1=[REDACTED]",
  },
];

export function redactSecrets(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json === undefined) {
    return value;
  }

  const redacted = SECRET_PATTERNS.reduce(
    (current, entry) => current.replace(entry.pattern, entry.replacement),
    json,
  );
  return JSON.parse(redacted);
}
