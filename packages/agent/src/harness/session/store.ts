import { LocalJsonlSessionManager } from "./jsonl";
import {
  InMemorySessionManager,
  type CreateSessionManagerInput,
  type SessionManager,
  type SessionManagerProvider,
  type SessionListItem,
} from "./session-manager";

export class InMemorySessionStore implements SessionManagerProvider {
  private readonly sessions = new Map<string, SessionManager>();

  async create(input: CreateSessionManagerInput): Promise<SessionManager> {
    const session = InMemorySessionManager.create(input);
    this.sessions.set(session.getSessionId(), session);
    return session;
  }

  async open(sessionId: string): Promise<SessionManager | undefined> {
    return this.sessions.get(sessionId);
  }

  async list() {
    return Promise.all([...this.sessions.values()].map(async (session) => {
      const header = await session.getHeader();
      const entries = "listEntries" in session && typeof session.listEntries === "function"
        ? await session.listEntries() : [];
      return { id: header.id, title: header.title, createdAt: header.createdAt, updatedAt: header.updatedAt,
        messageCount: entries.filter((entry: { type: string }) => entry.type === "message").length };
    }));
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

export class JsonlSessionStore implements SessionManagerProvider {
  constructor(private readonly sessionsDir: string) {}

  create(input: CreateSessionManagerInput): Promise<SessionManager> {
    return LocalJsonlSessionManager.create(this.sessionsDir, input);
  }

  open(sessionId: string): Promise<SessionManager | undefined> {
    return LocalJsonlSessionManager.open(this.sessionsDir, sessionId);
  }

  list(): Promise<SessionListItem[]> {
    return LocalJsonlSessionManager.list(this.sessionsDir);
  }

  delete(sessionId: string): Promise<boolean> {
    return LocalJsonlSessionManager.delete(this.sessionsDir, sessionId);
  }
}
