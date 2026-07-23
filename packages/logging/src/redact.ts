const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-[A-Za-z0-9_-]{12,}/g, replacement: "[REDACTED]" },
  {
    pattern: /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)=([^\s"]+)/g,
    replacement: "$1=[REDACTED]",
  },
];

const SECRET_KEYS = /(?:api[_-]?key|authorization|password|secret|token)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecrets(entry),
    ]));
  }
  if (typeof value !== "string") return value;
  return SECRET_PATTERNS.reduce(
    (current, entry) => current.replace(entry.pattern, entry.replacement),
    value,
  );
}
