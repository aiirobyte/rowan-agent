import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  InMemorySessionManager,
  createSessionHeader,
  summarizeSessionManagerRecords,
  type BuildAgentContextInput,
  type CreateSessionManagerInput,
  type ExecutionTurn,
  type Outcome,
  type SessionAgentContext,
  type SessionEntry,
  type SessionHeader,
  type SessionManager,
  type SessionListItem,
  type SessionRecord,
  type StepFilter,
} from "./session-manager";
import type { AgentMessage } from "./session";
import type { SessionState } from "../../loop/types";
import type { ModelTranscript } from "../../protocol/turn";
import type { ModelRef } from "../../protocol/model";

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]+$/;

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

function safeSessionPath(sessionsDir: string, id: string): string | undefined {
  if (!SESSION_ID_PATTERN.test(id)) {
    return undefined;
  }

  const root = resolve(sessionsDir);
  const path = resolve(root, `${id}.jsonl`);
  return isPathInside(root, path) ? path : undefined;
}

function parseRecord(line: string): SessionRecord {
  const value = JSON.parse(line) as SessionRecord;
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Invalid session JSONL record.");
  }
  return value;
}

async function readRecords(path: string): Promise<SessionRecord[] | undefined> {
  const text = await readFile(path, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!text) {
    return undefined;
  }
  const records = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseRecord);
  const header = records[0];
  if (!header || header.type !== "header") {
    throw new Error("Session JSONL must start with a header record.");
  }
  const lastEntry = records
    .slice(1)
    .reverse()
    .find((record): record is SessionEntry => record.type !== "header");
  return [
    {
      ...header,
      updatedAt: lastEntry?.timestamp ?? header.updatedAt,
      currentLeafId: lastEntry?.id ?? header.currentLeafId ?? null,
    },
    ...records.slice(1),
  ];
}

async function appendRecord(path: string, record: SessionRecord): Promise<void> {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

export class LocalJsonlSessionManager implements SessionManager {
  private constructor(
    private readonly sessionsDir: string,
    private readonly filePath: string,
    private readonly inner: InMemorySessionManager,
  ) {}

  static async create(
    sessionsDir: string,
    input: CreateSessionManagerInput,
  ): Promise<LocalJsonlSessionManager> {
    const header = createSessionHeader(input);
    const path = safeSessionPath(sessionsDir, header.id);
    if (!path) {
      throw new Error(`Invalid session id: ${header.id}`);
    }
    const exists = await stat(path)
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      });
    if (exists) {
      throw new Error(`Session already exists: ${header.id}`);
    }
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(path, `${JSON.stringify(header)}\n`, "utf8");
    return new LocalJsonlSessionManager(
      sessionsDir,
      path,
      InMemorySessionManager.fromRecords([header]),
    );
  }

  static async open(sessionsDir: string, id: string): Promise<LocalJsonlSessionManager | undefined> {
    const path = safeSessionPath(sessionsDir, id);
    if (!path) {
      return undefined;
    }
    const records = await readRecords(path);
    if (!records) {
      return undefined;
    }
    const header = records[0] as SessionHeader;
    if (header.id !== id) {
      throw new Error(`Session id mismatch: expected ${id}, found ${header.id}`);
    }
    return new LocalJsonlSessionManager(
      sessionsDir,
      path,
      InMemorySessionManager.fromRecords(records),
    );
  }

  static async list(sessionsDir: string): Promise<SessionListItem[]> {
    const entries = await readdir(sessionsDir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map(async (entry) => {
          const path = join(sessionsDir, entry.name);
          const records = await readRecords(path);
          return records ? summarizeSessionManagerRecords(records) : undefined;
        }),
    );
    return sessions
      .filter((session): session is SessionListItem => Boolean(session))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  static async delete(sessionsDir: string, id: string): Promise<boolean> {
    const path = safeSessionPath(sessionsDir, id);
    if (!path) {
      return false;
    }
    return unlink(path)
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      });
  }

  getSessionId(): string {
    return this.inner.getSessionId();
  }

  getSessionFile(): string | undefined {
    return this.filePath;
  }

  async getHeader(): Promise<SessionHeader> {
    return this.inner.getHeader();
  }

  async appendMessage(message: AgentMessage): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendMessage(message));
  }

  async appendOutcome(outcome: Outcome): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendOutcome(outcome));
  }

  async appendExecutionTurn(turn: ExecutionTurn): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendExecutionTurn(turn));
  }

  async appendCompaction(input: { summary: string; firstKeptEntryId: string }): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendCompaction(input));
  }

  async appendBranchSummary(input: { fromId: string; summary: string }): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendBranchSummary(input));
  }

  async appendSessionInfo(input: { title: string }): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendSessionInfo(input));
  }

  async appendCustom(input: { customType: string; data: unknown }): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendCustom(input));
  }

  async appendSessionState(state: SessionState): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendSessionState(state));
  }

  async appendModelTranscript(transcript: ModelTranscript, meta?: { phase?: string; model?: ModelRef }): Promise<string> {
    return this.appendThroughInner(() => this.inner.appendModelTranscript(transcript, meta));
  }

  async getSessionState(): Promise<SessionState | undefined> {
    return this.inner.getSessionState();
  }

  async branch(entryId: string | null): Promise<void> {
    await this.inner.branch(entryId);
    if (entryId) {
      await this.appendThroughInner(() => this.inner.appendBranchSummary({
        fromId: entryId,
        summary: `Selected branch at ${entryId}`,
      }));
    }
  }

  async buildAgentContext<TTool = unknown>(
    input?: BuildAgentContextInput<TTool>,
  ): Promise<SessionAgentContext<TTool>> {
    return this.inner.buildAgentContext(input);
  }

  async listEntries(): Promise<SessionEntry[]> {
    return this.inner.listEntries();
  }

  async loadExecutionTurns(filter?: StepFilter): Promise<ExecutionTurn[]> {
    return this.inner.loadExecutionTurns(filter);
  }

  private async appendThroughInner(append: () => Promise<string>): Promise<string> {
    const before = await this.inner.listEntries();
    const entryId = await append();
    const after = await this.inner.listEntries();
    const entry = after.find((candidate) => candidate.id === entryId);
    if (!entry || before.some((candidate) => candidate.id === entry.id)) {
      throw new Error(`Session entry was not appended: ${entryId}`);
    }
    await mkdir(this.sessionsDir, { recursive: true });
    await appendRecord(this.filePath, entry);
    return entryId;
  }
}
