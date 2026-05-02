import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  createId,
  sessionFromPersisted,
  summarizePersistedSession,
  toPersistedSession,
  type Session,
  type SessionListItem,
  type SessionStore,
} from "@rowan-agent/session";

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]+$/;

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

export class LocalJsonSessionStore<TSession extends Session<unknown> = Session<unknown>>
  implements SessionStore<TSession>
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
    await this.writeSession(path, session);
    return sessionFromPersisted(toPersistedSession(session)) as TSession;
  }

  async load(id: string): Promise<TSession | undefined> {
    const path = this.sessionPath(id);
    const text = await readFile(path, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    return text ? (sessionFromPersisted(JSON.parse(text)) as TSession) : undefined;
  }

  async save(session: TSession): Promise<void> {
    await this.writeSession(this.sessionPath(session.id), session);
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
          return summarizePersistedSession(JSON.parse(text));
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

  private async writeSession(path: string, session: TSession): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    const tmpPath = `${path}.${createId("tmp")}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(toPersistedSession(session), null, 2)}\n`, "utf8");
    await rename(tmpPath, path);
  }
}
