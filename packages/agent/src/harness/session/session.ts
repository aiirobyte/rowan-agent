import Type from "typebox";
import type { AgentMessage } from "../../protocol";
export type { AgentMessage } from "../../protocol";
import { createId, createTimestamp } from "../../utils";
export { createId };

export const SESSION_SCHEMA_VERSION = "0.4.4";

export type AgentMessageMetadata = Record<string, unknown> & {
  phase?: string;
};

export const AgentMessageSchema = Type.Object({
  id: Type.String(),
  role: Type.Union([
    Type.Literal("system"),
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("tool"),
  ]),
  content: Type.Union([Type.String(), Type.Array(Type.Unknown())]),
  createdAt: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const SkillSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  filePath: Type.String(),
  baseDir: Type.String(),
  content: Type.String(),
  disableModelInvocation: Type.Boolean(),
});

export type Skill = Type.Static<typeof SkillSchema>;

export type Session<TLogEvent = never> = {
  version: string;
  id: string;
  parentSessionId?: string;
  systemPrompt: string;
  input: string;
  messages: AgentMessage[];
  log: TLogEvent[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export function createMessage(
  role: AgentMessage["role"],
  content: AgentMessage["content"],
  metadata?: Record<string, unknown>,
): AgentMessage {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: createTimestamp(),
    ...(metadata ? { metadata } : {}),
  };
}

export function createSession<TLogEvent = never>(input: {
  id?: string;
  systemPrompt: string;
  input: string;
  skills?: Skill[];
  parentSessionId?: string;
  title?: string;
}): Session<TLogEvent> {
  const createdAt = createTimestamp();
  const messages = [
    createMessage("user", input.input),
  ];

  return {
    version: SESSION_SCHEMA_VERSION,
    id: input.id ?? createId("ses"),
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
    systemPrompt: input.systemPrompt,
    input: input.input,
    messages,
    log: [],
    skills: input.skills ?? [],
    createdAt,
    updatedAt: createdAt,
    ...(input.title ? { title: input.title } : {}),
  };
}

export function appendUserTurn<TLogEvent>(session: Session<TLogEvent>, input: string): Session<TLogEvent> {
  session.messages.push(createMessage("user", input));
  session.updatedAt = createTimestamp();
  return session;
}

export function latestUserInput(session: Session<unknown>): string {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message.role === "user" && message.metadata?.kind !== "phase_prompt") {
      return typeof message.content === "string" ? message.content : "";
    }
  }

  return session.input;
}
