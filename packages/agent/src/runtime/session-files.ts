import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import type { ContentBlock } from "@rowan-agent/models";
import type {
  AgentId,
  AgentRuntime,
  AssistantContent,
  DurableConsumer,
  DurableRunEvent,
  MessageCommitted,
  MessageRevised,
  UserContent,
} from "./contracts";

export type SessionFilesOptions = Readonly<{ dir: string }>;

interface AgentSessionState {
  filePath: string;
  knownEntryIds: Set<string>;
  lastEntryId: string | null;
  entryIdToParentId: Map<string, string | null>;
  toolCallIdToName: Map<string, string>;
  lastModel?: { provider: string; modelId: string };
}

export interface PiSessionHeader {
  type: "session";
  version: 3;
  id: string;
  timestamp: string;
  cwd: string;
}

export interface PiSessionModelChangeEntry {
  type: "model_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  provider: string;
  modelId: string;
}

export interface PiSessionMessageEntry {
  type: "message";
  id: string;
  parentId: string | null;
  timestamp: string;
  message: {
    role: "user" | "assistant" | "toolResult";
    [key: string]: unknown;
  };
}

export type PiSessionEntry = PiSessionMessageEntry | PiSessionModelChangeEntry;

function toEpochMs(isoString?: string): number {
  if (!isoString) return Date.now();
  const ms = new Date(isoString).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function isContentBlock(value: unknown): value is { type: "text"; text: string } | { type: "image"; data: string; mimeType: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "text" && typeof candidate.text === "string") return true;
  if (candidate.type === "image" && typeof candidate.data === "string" && typeof candidate.mimeType === "string") return true;
  return false;
}

function convertToolResultContent(content: unknown): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  if (content === undefined || content === null) {
    return [{ type: "text", text: "" }];
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (isContentBlock(content)) {
    return content.type === "image"
      ? [{ type: "image", data: content.data, mimeType: content.mimeType }]
      : [{ type: "text", text: content.text }];
  }
  if (Array.isArray(content)) {
    if (content.length > 0 && content.every(isContentBlock)) {
      return content.map((item) =>
        item.type === "image"
          ? { type: "image", data: item.data, mimeType: item.mimeType }
          : { type: "text", text: item.text },
      );
    }
    return [{ type: "text", text: JSON.stringify(content) }];
  }
  return [{ type: "text", text: JSON.stringify(content) }];
}

function convertUserContent(content: UserContent): string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "image" ? { type: "image", data: part.data, mimeType: part.mimeType } : { type: "text", text: part.text },
  );
}

function convertAssistantContent(
  content: AssistantContent,
  onToolCall?: (id: string, name: string, internalId?: string) => void,
): {
  parts: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; thinkingSignature?: string }
    | { type: "toolCall"; id: string; name: string; arguments: unknown }
  >;
  hasToolCall: boolean;
} {
  if (typeof content === "string") {
    return {
      parts: [{ type: "text", text: content }],
      hasToolCall: false,
    };
  }
  let hasToolCall = false;
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; thinkingSignature?: string }
    | { type: "toolCall"; id: string; name: string; arguments: unknown }
  > = [];

  for (const part of content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "thinking") {
      parts.push({
        type: "thinking",
        thinking: part.thinking,
        ...(part.signature ? { thinkingSignature: part.signature } : {}),
      });
    } else if (part.type === "tool_use") {
      hasToolCall = true;
      const callId = part.providerToolCallId ?? part.toolCallId;
      onToolCall?.(callId, part.name, part.toolCallId);
      parts.push({
        type: "toolCall",
        id: callId,
        name: part.name,
        arguments: part.input,
      });
    }
  }

  return { parts, hasToolCall };
}

async function getAgentCreatedAt(runtime: AgentRuntime, agentId: AgentId): Promise<string> {
  let after: import("./contracts").AgentListCursor | undefined;
  while (true) {
    const page = await runtime.listAgents(after ? { after, limit: 100 } : { limit: 100 });
    const agent = page.items.find((item) => item.id === agentId);
    if (agent) return agent.createdAt;
    if (!page.next) break;
    after = page.next;
  }
  return new Date().toISOString();
}

async function getFirstRunCwd(runtime: AgentRuntime, agentId: AgentId): Promise<string> {
  let after: import("./contracts").RunListCursor | undefined;
  while (true) {
    const page = await runtime.listRuns(after ? { agentId, after, limit: 100 } : { agentId, limit: 100 });
    for (const runSummary of page.items) {
      try {
        const snapshot = await runtime.run(runSummary.id).snapshot();
        if (snapshot.cwd && snapshot.cwd.trim().length > 0) {
          return snapshot.cwd;
        }
      } catch {
        // Run snapshot unavailable
      }
    }
    if (!page.next) break;
    after = page.next;
  }
  return "";
}

function writeSessionEntry(state: AgentSessionState, entry: PiSessionEntry): void {
  appendFileSync(state.filePath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(state.filePath, 0o600);
  } catch {
    // Ignore chmod failure in non-POSIX environments
  }
  state.knownEntryIds.add(entry.id);
  state.entryIdToParentId.set(entry.id, entry.parentId);
  state.lastEntryId = entry.id;
}

export async function startSessionFilesConsumer(
  runtime: AgentRuntime,
  options: SessionFilesOptions,
): Promise<DurableConsumer> {
  const agentStates = new Map<AgentId, AgentSessionState>();

  async function getOrInitState(agentId: AgentId): Promise<AgentSessionState> {
    let state = agentStates.get(agentId);
    if (state) return state;

    const createdAt = await getAgentCreatedAt(runtime, agentId);
    const cwd = await getFirstRunCwd(runtime, agentId);

    const folderName = cwd.length > 0
      ? `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
      : "--unknown--";
    const fileTimestamp = createdAt.replace(/[:.]/g, "-");
    const fileName = `${fileTimestamp}_${agentId}.jsonl`;
    const filePath = join(options.dir, folderName, fileName);

    const knownEntryIds = new Set<string>();
    let lastEntryId: string | null = null;
    let lastModel: { provider: string; modelId: string } | undefined;
    const entryIdToParentId = new Map<string, string | null>();
    const toolCallIdToName = new Map<string, string>();

    const writeHeader = () => {
      const header: PiSessionHeader = { type: "session", version: 3, id: agentId, timestamp: createdAt, cwd };
      appendFileSync(filePath, `${JSON.stringify(header)}\n`, { encoding: "utf8", mode: 0o600 });
    };

    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf8");
      if (content.trim().length === 0) {
        writeHeader();
      } else {
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (parsed.type === "session") continue;
          if (typeof parsed.id === "string") {
            knownEntryIds.add(parsed.id);
            entryIdToParentId.set(parsed.id, parsed.parentId ?? null);
            lastEntryId = parsed.id;
          }
          if (parsed.type === "model_change" && typeof parsed.provider === "string" && typeof parsed.modelId === "string") {
            lastModel = { provider: parsed.provider, modelId: parsed.modelId };
          }
          if (parsed.type === "message" && parsed.message?.role === "assistant" && Array.isArray(parsed.message.content)) {
            for (const part of parsed.message.content) {
              if (part && part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
                toolCallIdToName.set(part.id, part.name);
              }
            }
          }
        }
      }
    } else {
      writeHeader();
    }

    state = {
      filePath,
      knownEntryIds,
      lastEntryId,
      entryIdToParentId,
      toolCallIdToName,
      ...(lastModel ? { lastModel } : {}),
    };
    agentStates.set(agentId, state);
    return state;
  }

  async function onEvent(event: DurableRunEvent): Promise<void> {
    try {
      if (event.kind !== "message_committed" && event.kind !== "message_revised") {
        return;
      }
      if (event.kind === "message_committed" && event.message.role === "interaction") {
        return;
      }

      const state = await getOrInitState(event.agentId);

      if (event.kind === "message_committed") {
        if (event.message.role === "user") {
          if (state.knownEntryIds.has(event.message.id)) return;
          const content = convertUserContent(event.message.content);
          const entry: PiSessionMessageEntry = {
            type: "message",
            id: event.message.id,
            parentId: state.lastEntryId,
            timestamp: event.message.createdAt,
            message: {
              role: "user",
              content,
              timestamp: toEpochMs(event.message.createdAt),
            },
          };
          writeSessionEntry(state, entry);
        } else if (event.message.role === "assistant") {
          if (state.knownEntryIds.has(event.message.id)) return;

          const model = event.message.model;
          const rawUsage = event.message.usage;

          if (model) {
            const isDifferentModel = !state.lastModel
              || state.lastModel.provider !== model.provider
              || state.lastModel.modelId !== model.id;

            if (isDifferentModel) {
              const modelChangeId = `${event.message.id}:model`;
              if (!state.knownEntryIds.has(modelChangeId)) {
                const modelChangeEntry: PiSessionModelChangeEntry = {
                  type: "model_change",
                  id: modelChangeId,
                  parentId: state.lastEntryId,
                  timestamp: event.message.createdAt,
                  provider: model.provider,
                  modelId: model.id,
                };
                writeSessionEntry(state, modelChangeEntry);
              }
              state.lastModel = { provider: model.provider, modelId: model.id };
            }
          }

          const { parts, hasToolCall } = convertAssistantContent(
            event.message.content,
            (id, name, internalId) => {
              state.toolCallIdToName.set(id, name);
              if (internalId) state.toolCallIdToName.set(internalId, name);
            },
          );

          const assistantMessagePayload: Record<string, unknown> = {
            role: "assistant",
            content: parts,
            stopReason: hasToolCall ? "toolUse" : "stop",
            timestamp: toEpochMs(event.message.createdAt),
          };

          if (model || rawUsage) {
            if (model) {
              assistantMessagePayload.provider = model.provider;
              assistantMessagePayload.model = model.id;
            }

            const input = rawUsage?.inputTokens ?? 0;
            const output = rawUsage?.outputTokens ?? 0;
            const cacheRead = rawUsage?.cacheReadTokens ?? 0;
            const cacheWrite = rawUsage?.cacheWriteTokens ?? 0;
            const totalTokens = rawUsage?.totalTokens ?? (input + output + cacheRead + cacheWrite);

            const cost = rawUsage?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

            assistantMessagePayload.usage = {
              input,
              output,
              cacheRead,
              cacheWrite,
              ...(rawUsage?.cacheWrite1hTokens !== undefined ? { cacheWrite1h: rawUsage.cacheWrite1hTokens } : {}),
              ...(rawUsage?.reasoningTokens !== undefined ? { reasoning: rawUsage.reasoningTokens } : {}),
              totalTokens,
              cost,
            };
          }

          const entry: PiSessionMessageEntry = {
            type: "message",
            id: event.message.id,
            parentId: state.lastEntryId,
            timestamp: event.message.createdAt,
            message: assistantMessagePayload as PiSessionMessageEntry["message"],
          };
          writeSessionEntry(state, entry);
        } else if (event.message.role === "tool") {
          for (let index = 0; index < event.message.content.length; index++) {
            const part = event.message.content[index];
            const entryId = `${event.message.id}:${index}`;
            if (state.knownEntryIds.has(entryId)) continue;

            const toolCallId = part.providerToolCallId ?? part.toolCallId;
            const toolName = state.toolCallIdToName.get(toolCallId)
              ?? state.toolCallIdToName.get(part.toolCallId)
              ?? "unknown";

            const isError = Boolean(
              part.result.isError ??
              (part.result.ok !== undefined ? !part.result.ok : Boolean((part.result as any).error)),
            );

            const content = convertToolResultContent(part.result.content);

            const entry: PiSessionMessageEntry = {
              type: "message",
              id: entryId,
              parentId: state.lastEntryId,
              timestamp: event.message.createdAt,
              message: {
                role: "toolResult",
                toolCallId,
                toolName,
                content,
                isError,
                timestamp: toEpochMs(event.message.createdAt),
              },
            };
            writeSessionEntry(state, entry);
          }
        }
      } else if (event.kind === "message_revised") {
        const message = event.message;
        const revision = message.messageRevision ?? 1;
        const entryId = `${message.id}@${revision}`;
        if (state.knownEntryIds.has(entryId)) return;

        const parentId = state.entryIdToParentId.get(message.id) ?? null;
        const timestampIso = message.createdAt ?? event.createdAt;
        const content = convertUserContent(message.content);

        const entry: PiSessionMessageEntry = {
          type: "message",
          id: entryId,
          parentId,
          timestamp: timestampIso,
          message: {
            role: "user",
            content,
            timestamp: toEpochMs(timestampIso),
          },
        };
        writeSessionEntry(state, entry);
      }
    } catch (error) {
      console.error("Failed to write session file entry:", error);
    }
  }

  // The runtime aborts its consumers on close; this signal is never aborted on its own.
  return runtime.consume({ consumerId: "rowan:session-files", signal: new AbortController().signal, onEvent });
}
