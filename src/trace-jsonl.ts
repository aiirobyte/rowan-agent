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
  let pending: Promise<void> = Promise.resolve();
  let failure: unknown;

  const write = async (event: unknown) => {
    ready ??= mkdir(dirname(path), { recursive: true }).then(async (made) => {
      await writeFile(path, "", "utf8");
      return made;
    });
    await ready;
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  };

  const listener: AgentEventListener = ((event: AgentEvent) => {
    const snapshot = redactSecrets(event);
    pending = pending
      .then(() => write(snapshot))
      .catch((error) => {
        failure ??= error;
      });
  }) as AgentEventListener;

  listener.flush = async () => {
    await pending;
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
