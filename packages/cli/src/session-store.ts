import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import Type from "typebox";
import Schema from "typebox/schema";
import {
  SESSION_SCHEMA_VERSION,
  createId,
  nowIso,
  sessionFromPersisted,
  summarizePersistedSession,
  toPersistedSession,
  type PersistedSession,
  PersistedSessionSchema,
  type Session,
  type SessionListItem,
} from "@rowan-agent/session";
import {
  ExecutionTurnSchema,
  filterSteps,
  type AgentStore,
  type ExecutionTurn,
  type StepFilter,
} from "@rowan-agent/agent";

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]+$/;

const PersistedAgentStateSchema = Type.Object({
  ...PersistedSessionSchema.properties,
  steps: Type.Array(ExecutionTurnSchema),
});

type PersistedAgentState = PersistedSession & {
  steps: ExecutionTurn[];
};

const PersistedAgentStateValidator = Schema.Compile(PersistedAgentStateSchema);
const ExecutionTurnValidator = Schema.Compile(ExecutionTurnSchema);

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

function parsePersistedAgentState(value: unknown): PersistedAgentState {
  const version = typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).version
    : undefined;
  if (version !== SESSION_SCHEMA_VERSION) {
    throw new Error(`Unsupported session schema version: ${String(version ?? "unknown")}`);
  }
  const parsed = PersistedAgentStateValidator.Parse(value) as PersistedAgentState;
  return parsed;
}

function toPersistedAgentState(
  session: Session<unknown>,
  steps: readonly ExecutionTurn[],
): PersistedAgentState {
  return parsePersistedAgentState({
    ...toPersistedSession(session),
    steps: steps.map((step) => ExecutionTurnValidator.Parse(step)),
  });
}

export class LocalJsonAgentStore<TSession extends Session<unknown> = Session<unknown>>
  implements AgentStore<TSession>
{
  constructor(private readonly sessionsDir: string) {}

  private sessionPath(id: string): string {
    if (!SESSION_ID_PATTERN.test(id)) {
      throw new Error(`Invalid session id: ${id}`);
    }

    const root = resolve(this.sessionsDir);
    const path = resolve(root, `${id}.json`);
    if (!isPathInside(root, path)) {
      throw new Error(`Session path escapes sessions directory: ${id}`);
    }

    return path;
  }

  private async readState(id: string): Promise<PersistedAgentState | undefined> {
    const path = this.sessionPath(id);
    const text = await readFile(path, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    return text ? parsePersistedAgentState(JSON.parse(text)) : undefined;
  }

  async create(session: TSession): Promise<TSession> {
    const path = this.sessionPath(session.id);
    const exists = await stat(path)
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      });
    if (exists) {
      throw new Error(`Session already exists: ${session.id}`);
    }

    const state = toPersistedAgentState(session, []);
    await this.writeState(path, state);
    return sessionFromPersisted(state) as TSession;
  }

  async load(id: string): Promise<TSession | undefined> {
    const state = await this.readState(id);
    return state ? (sessionFromPersisted(state) as TSession) : undefined;
  }

  async save(session: TSession): Promise<void> {
    const existing = await this.readState(session.id);
    await this.writeState(
      this.sessionPath(session.id),
      toPersistedAgentState(session, existing?.steps ?? []),
    );
  }

  async list(): Promise<SessionListItem[]> {
    const entries = await readdir(this.sessionsDir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const text = await readFile(join(this.sessionsDir, entry.name), "utf8");
          return summarizePersistedSession(parsePersistedAgentState(JSON.parse(text)));
        }),
    );

    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    const path = this.sessionPath(id);
    return unlink(path)
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      });
  }

  async appendStep(sessionId: string, step: ExecutionTurn): Promise<void> {
    const state = await this.readState(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await this.writeState(this.sessionPath(sessionId), {
      ...state,
      steps: [
        ...state.steps,
        ExecutionTurnValidator.Parse({
          ...step,
          sessionId,
        }),
      ],
      updatedAt: nowIso(),
    });
  }

  async loadSteps(sessionId: string, filter?: StepFilter): Promise<ExecutionTurn[]> {
    const state = await this.readState(sessionId);
    return state ? filterSteps(state.steps, filter) : [];
  }

  private async writeState(path: string, state: PersistedAgentState): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    const tmpPath = `${path}.${createId("tmp")}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(parsePersistedAgentState(state), null, 2)}\n`, "utf8");
    await rename(tmpPath, path);
  }
}
