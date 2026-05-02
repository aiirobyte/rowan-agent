import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentEvent, AgentEventListener } from "@rowan-agent/agent";

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

export type JsonlTracePath = string | ((event: AgentEvent) => string | undefined);

export type JsonlTraceWriterOptions = {
  mode?: "replace" | "append";
};

export type JsonlTraceWriter = AgentEventListener & {
  path(): string | undefined;
};

export function jsonlTraceWriter(
  path: JsonlTracePath,
  options: JsonlTraceWriterOptions = {},
): JsonlTraceWriter {
  const mode = options.mode ?? "replace";
  let resolvedPath = typeof path === "string" ? path : undefined;
  let ready: Promise<string | undefined> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let failure: unknown;

  const resolvePath = (event: AgentEvent): string => {
    resolvedPath ??= typeof path === "string" ? path : path(event);
    if (!resolvedPath) {
      throw new Error("Trace path could not be resolved from the agent event.");
    }
    return resolvedPath;
  };

  const write = async (event: AgentEvent) => {
    const eventPath = resolvePath(event);
    ready ??= mkdir(dirname(eventPath), { recursive: true }).then(async (made) => {
      if (mode === "replace") {
        await writeFile(eventPath, "", "utf8");
      }
      return made;
    });
    await ready;
    await appendFile(eventPath, `${JSON.stringify(event)}\n`, "utf8");
  };

  const listener: JsonlTraceWriter = ((event: AgentEvent) => {
    const snapshot = redactSecrets(event) as AgentEvent;
    pending = pending
      .then(() => write(snapshot))
      .catch((error) => {
        failure ??= error;
      });
  }) as JsonlTraceWriter;

  listener.path = () => resolvedPath;

  listener.flush = async () => {
    await pending;
    if (failure) {
      throw failure;
    }
  };

  return listener;
}
