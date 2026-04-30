import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentEvent, AgentEventListener } from "./types";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)=([^\s"]+)/g,
];

export function redactSecrets(value: unknown): unknown {
  const json = JSON.stringify(value);
  const redacted = SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "$1=[REDACTED]"),
    json,
  );
  return JSON.parse(redacted);
}

export function jsonlTraceWriter(path: string): AgentEventListener {
  let ready: Promise<string | undefined> | undefined;

  return async (event: AgentEvent) => {
    ready ??= mkdir(dirname(path), { recursive: true }).then(async (made) => {
      await writeFile(path, "", "utf8");
      return made;
    });
    await ready;
    const redacted = redactSecrets(event);
    await appendFile(path, `${JSON.stringify(redacted)}\n`, "utf8");
  };
}
