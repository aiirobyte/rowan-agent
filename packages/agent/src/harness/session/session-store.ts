import Type from "typebox";
import Schema from "typebox/schema";
import {
  AgentMessageSchema,
  SESSION_SCHEMA_VERSION,
  SkillSchema,
  type AgentMessage,
  type Session,
} from "./session";
import { snapshotMessage } from "../../loop/state";

export const PersistedSessionSchema = Type.Object({
  version: Type.String(),
  id: Type.String(),
  parentSessionId: Type.Optional(Type.String()),
  systemPrompt: Type.String(),
  input: Type.String(),
  messages: Type.Array(AgentMessageSchema),
  skills: Type.Array(SkillSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  title: Type.Optional(Type.String()),
});

export type PersistedSession = Type.Static<typeof PersistedSessionSchema>;

export type SessionListItem = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  latestMessage?: string;
};

export type SessionStore<TSession extends Session<unknown> = Session<unknown>> = {
  create(session: TSession): Promise<TSession>;
  load(id: string): Promise<TSession | undefined>;
  save(session: TSession): Promise<void>;
  list(): Promise<SessionListItem[]>;
  delete(id: string): Promise<boolean>;
};

const PersistedSessionValidator = Schema.Compile(PersistedSessionSchema);

export function toPersistedSession(session: Session<unknown>): PersistedSession {
  return PersistedSessionValidator.Parse({
    version: SESSION_SCHEMA_VERSION,
    id: session.id,
    ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
    systemPrompt: session.systemPrompt,
    input: session.input,
    messages: session.messages.map(snapshotMessage),
    skills: session.skills,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.title ? { title: session.title } : {}),
  });
}

export function parsePersistedSession(value: unknown): PersistedSession {
  const parsed = PersistedSessionValidator.Parse(value);
  if (parsed.version !== SESSION_SCHEMA_VERSION) {
    throw new Error(`Unsupported session schema version: ${parsed.version}`);
  }
  return parsed;
}

export function sessionFromPersisted<TLogEvent = never>(value: unknown): Session<TLogEvent> {
  const parsed = parsePersistedSession(value);
  return {
    version: parsed.version,
    id: parsed.id,
    ...(parsed.parentSessionId ? { parentSessionId: parsed.parentSessionId } : {}),
    systemPrompt: parsed.systemPrompt,
    input: parsed.input,
    messages: parsed.messages.map(snapshotMessage),
    log: [],
    skills: parsed.skills,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    ...(parsed.title ? { title: parsed.title } : {}),
  };
}

export function summarizePersistedSession(value: unknown): SessionListItem {
  const parsed = parsePersistedSession(value);
  const latestMessage = [...parsed.messages]
    .reverse()
    .find((message) => message.role === "user" || message.role === "assistant");

  return {
    id: parsed.id,
    title: parsed.title ?? null,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    messageCount: parsed.messages.length,
    ...(latestMessage ? { latestMessage: latestMessage.content } : {}),
  };
}

export class InMemorySessionStore<TSession extends Session<unknown> = Session<unknown>>
  implements SessionStore<TSession>
{
  private readonly sessions = new Map<string, PersistedSession>();

  async create(session: TSession): Promise<TSession> {
    if (this.sessions.has(session.id)) {
      throw new Error(`Session already exists: ${session.id}`);
    }
    const persisted = toPersistedSession(session);
    this.sessions.set(session.id, persisted);
    return sessionFromPersisted(persisted) as TSession;
  }

  async load(id: string): Promise<TSession | undefined> {
    const persisted = this.sessions.get(id);
    return persisted ? (sessionFromPersisted(persisted) as TSession) : undefined;
  }

  async save(session: TSession): Promise<void> {
    this.sessions.set(session.id, toPersistedSession(session));
  }

  async list(): Promise<SessionListItem[]> {
    return [...this.sessions.values()]
      .map(summarizePersistedSession)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }
}
