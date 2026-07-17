import { LocalJsonlSessionManager } from "./jsonl";
import {
  InMemorySessionManager,
  type CreateSessionManagerInput,
  type SessionManager,
  type SessionManagerProvider,
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
}

export class JsonlSessionStore implements SessionManagerProvider {
  constructor(private readonly sessionsDir: string) {}

  create(input: CreateSessionManagerInput): Promise<SessionManager> {
    return LocalJsonlSessionManager.create(this.sessionsDir, input);
  }

  open(sessionId: string): Promise<SessionManager | undefined> {
    return LocalJsonlSessionManager.open(this.sessionsDir, sessionId);
  }

  list() {
    return LocalJsonlSessionManager.list(this.sessionsDir);
  }
}
