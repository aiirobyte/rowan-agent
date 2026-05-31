import type { ExecutionTurn, Outcome, StepFilter } from "../../protocol";
import {
  createId,
  isConversationMessage,
  nowIso,
  type AgentMessage,
  type Skill,
} from "./session";

export const SESSION_MANAGER_SCHEMA_VERSION = "0.4.4";

export type SessionHeader = {
  type: "header";
  id: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  systemPrompt: string;
  input: string;
  parentSessionId?: string;
  skills: Skill[];
  title?: string;
  currentLeafId?: string | null;
};

type SessionEntryBase = {
  id: string;
  parentId: string | null;
  timestamp: string;
};

export type MessageSessionEntry = SessionEntryBase & {
  type: "message";
  message: AgentMessage;
};

export type OutcomeSessionEntry = SessionEntryBase & {
  type: "outcome";
  outcome: Outcome;
};

export type ExecutionTurnSessionEntry = SessionEntryBase & {
  type: "execution_turn";
  turn: ExecutionTurn;
};

export type CompactionSessionEntry = SessionEntryBase & {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
};

export type BranchSummarySessionEntry = SessionEntryBase & {
  type: "branch_summary";
  fromId: string;
  summary: string;
};

export type SessionInfoSessionEntry = SessionEntryBase & {
  type: "session_info";
  title: string;
};

export type CustomSessionEntry = SessionEntryBase & {
  type: "custom";
  customType: string;
  data: unknown;
};

export type SessionEntry =
  | MessageSessionEntry
  | OutcomeSessionEntry
  | ExecutionTurnSessionEntry
  | CompactionSessionEntry
  | BranchSummarySessionEntry
  | SessionInfoSessionEntry
  | CustomSessionEntry;

export type SessionRecord = SessionHeader | SessionEntry;

type NewSessionEntry =
  | Omit<MessageSessionEntry, keyof SessionEntryBase>
  | Omit<OutcomeSessionEntry, keyof SessionEntryBase>
  | Omit<ExecutionTurnSessionEntry, keyof SessionEntryBase>
  | Omit<CompactionSessionEntry, keyof SessionEntryBase>
  | Omit<BranchSummarySessionEntry, keyof SessionEntryBase>
  | Omit<SessionInfoSessionEntry, keyof SessionEntryBase>
  | Omit<CustomSessionEntry, keyof SessionEntryBase>;

export type SessionAgentContext<TTool = unknown> = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: TTool[];
  skills: Skill[];
};

export type BuildAgentContextInput<TTool = unknown> = {
  leafId?: string | null;
  tools?: TTool[];
  skills?: Skill[];
};

export type CreateSessionManagerInput = {
  id?: string;
  systemPrompt: string;
  input: string;
  parentSessionId?: string;
  skills?: Skill[];
  title?: string;
};

export type SessionListItem = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  latestMessage?: string;
};

export type SessionManager = {
  getSessionId(): string;
  getSessionFile(): string | undefined;
  getHeader(): Promise<SessionHeader>;
  appendMessage(message: AgentMessage): Promise<string>;
  appendOutcome(outcome: Outcome): Promise<string>;
  appendExecutionTurn(turn: ExecutionTurn): Promise<string>;
  appendCompaction(input: { summary: string; firstKeptEntryId: string }): Promise<string>;
  appendBranchSummary(input: { fromId: string; summary: string }): Promise<string>;
  appendSessionInfo(input: { title: string }): Promise<string>;
  appendCustom(input: { customType: string; data: unknown }): Promise<string>;
  branch(entryId: string | null): Promise<void>;
  buildAgentContext<TTool = unknown>(input?: BuildAgentContextInput<TTool>): Promise<SessionAgentContext<TTool>>;
  listEntries(): Promise<SessionEntry[]>;
  loadExecutionTurns(filter?: StepFilter): Promise<ExecutionTurn[]>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSessionHeader(input: CreateSessionManagerInput): SessionHeader {
  const createdAt = nowIso();
  return {
    type: "header",
    id: input.id ?? createId("ses"),
    version: SESSION_MANAGER_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    systemPrompt: input.systemPrompt,
    input: input.input,
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    skills: input.skills?.map(clone) ?? [],
    ...(input.title ? { title: input.title } : {}),
    currentLeafId: null,
  };
}

function filterExecutionTurns(steps: readonly ExecutionTurn[], filter: StepFilter = {}): ExecutionTurn[] {
  return steps
    .filter((step) => {
      if (filter.phase && step.phase !== filter.phase) return false;
      if (filter.scope && step.scope !== filter.scope) return false;
      if (filter.afterMs !== undefined && step.requestedAtMs < filter.afterMs) return false;
      return true;
    })
    .map(clone);
}

export class InMemorySessionManager implements SessionManager {
  private constructor(
    private header: SessionHeader,
    private readonly entries: SessionEntry[] = [],
  ) {}

  static create(input: CreateSessionManagerInput): InMemorySessionManager {
    return new InMemorySessionManager(createSessionHeader(input));
  }

  static fromRecords(records: SessionRecord[]): InMemorySessionManager {
    const [header, ...entries] = records;
    if (!header || header.type !== "header") {
      throw new Error("Session records must start with a header.");
    }
    return new InMemorySessionManager(clone(header), clone(entries as SessionEntry[]));
  }

  getSessionId(): string {
    return this.header.id;
  }

  getSessionFile(): string | undefined {
    return undefined;
  }

  async getHeader(): Promise<SessionHeader> {
    return clone(this.header);
  }

  async appendMessage(message: AgentMessage): Promise<string> {
    return this.appendEntry({ type: "message", message: clone(message) });
  }

  async appendOutcome(outcome: Outcome): Promise<string> {
    return this.appendEntry({ type: "outcome", outcome: clone(outcome) });
  }

  async appendExecutionTurn(turn: ExecutionTurn): Promise<string> {
    return this.appendEntry({
      type: "execution_turn",
      turn: clone({
        ...turn,
        sessionId: this.header.id,
      }),
    });
  }

  async appendCompaction(input: { summary: string; firstKeptEntryId: string }): Promise<string> {
    return this.appendEntry({ type: "compaction", ...input });
  }

  async appendBranchSummary(input: { fromId: string; summary: string }): Promise<string> {
    return this.appendEntry({ type: "branch_summary", ...input });
  }

  async appendSessionInfo(input: { title: string }): Promise<string> {
    this.header = {
      ...this.header,
      title: input.title,
      updatedAt: nowIso(),
    };
    return this.appendEntry({ type: "session_info", title: input.title });
  }

  async appendCustom(input: { customType: string; data: unknown }): Promise<string> {
    return this.appendEntry({ type: "custom", customType: input.customType, data: clone(input.data) });
  }

  async branch(entryId: string | null): Promise<void> {
    if (entryId !== null && !this.entries.some((entry) => entry.id === entryId)) {
      throw new Error(`Session entry not found: ${entryId}`);
    }
    this.header = {
      ...this.header,
      currentLeafId: entryId,
      updatedAt: nowIso(),
    };
  }

  async buildAgentContext<TTool = unknown>(
    input: BuildAgentContextInput<TTool> = {},
  ): Promise<SessionAgentContext<TTool>> {
    const entries = this.entriesForLeaf(input.leafId ?? this.header.currentLeafId ?? null);
    return {
      systemPrompt: this.header.systemPrompt,
      messages: entries
        .filter((entry): entry is MessageSessionEntry => entry.type === "message")
        .map((entry) => entry.message)
        .filter(isConversationMessage)
        .map(clone),
      tools: input.tools?.slice() ?? [],
      skills: input.skills?.map(clone) ?? this.header.skills.map(clone),
    };
  }

  async listEntries(): Promise<SessionEntry[]> {
    return this.entries.map(clone);
  }

  async loadExecutionTurns(filter?: StepFilter): Promise<ExecutionTurn[]> {
    return filterExecutionTurns(
      this.entries
        .filter((entry): entry is ExecutionTurnSessionEntry => entry.type === "execution_turn")
        .map((entry) => entry.turn),
      filter,
    );
  }

  protected appendImportedEntry(entry: SessionEntry): void {
    this.entries.push(clone(entry));
    this.header = {
      ...this.header,
      currentLeafId: entry.id,
      updatedAt: entry.timestamp,
    };
  }

  private appendEntry(input: NewSessionEntry): string {
    const timestamp = nowIso();
    const entry = {
      id: createId("entry"),
      parentId: this.header.currentLeafId ?? null,
      timestamp,
      ...input,
    } as SessionEntry;
    this.entries.push(entry);
    this.header = {
      ...this.header,
      currentLeafId: entry.id,
      updatedAt: timestamp,
    };
    return entry.id;
  }

  private entriesForLeaf(leafId: string | null): SessionEntry[] {
    if (!leafId) {
      return [];
    }

    const byId = new Map(this.entries.map((entry) => [entry.id, entry]));
    const ordered: SessionEntry[] = [];
    let currentId: string | null = leafId;

    while (currentId) {
      const entry = byId.get(currentId);
      if (!entry) {
        throw new Error(`Session entry not found: ${currentId}`);
      }
      ordered.unshift(entry);
      currentId = entry.parentId;
    }

    return ordered;
  }
}

export function summarizeSessionManagerRecords(records: readonly SessionRecord[]): SessionListItem {
  const [header, ...entries] = records;
  if (!header || header.type !== "header") {
    throw new Error("Session records must start with a header.");
  }
  const messages = entries
    .filter((entry): entry is MessageSessionEntry => entry.type === "message")
    .map((entry) => entry.message)
    .filter(isConversationMessage);
  const latestMessage = messages.at(-1)?.content;

  return {
    id: header.id,
    ...(header.title ? { title: header.title } : {}),
    createdAt: header.createdAt,
    updatedAt: header.updatedAt,
    messageCount: messages.length,
    ...(latestMessage ? { latestMessage } : {}),
  };
}

export type { ExecutionTurn, Outcome, StepFilter } from "../../protocol";
