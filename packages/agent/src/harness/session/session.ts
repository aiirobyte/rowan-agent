import Type from "typebox";

export const SESSION_SCHEMA_VERSION = "0.3.3";

export const CONTEXT_SCOPES = ["conversation", "execution", "diagnostic"] as const;

export type ContextScope = (typeof CONTEXT_SCOPES)[number];

export const ContextScopeSchema = Type.Union([
  Type.Literal("conversation"),
  Type.Literal("execution"),
  Type.Literal("diagnostic"),
]);

export function isContextScope(value: unknown): value is ContextScope {
  return (
    value === "conversation" ||
    value === "execution" ||
    value === "diagnostic"
  );
}

export type AgentMessageMetadata = Record<string, unknown> & {
  kind?: string;
  phase?: string;
  scope?: ContextScope;
};

export const AgentMessageSchema = Type.Object({
  id: Type.String(),
  role: Type.Union([
    Type.Literal("system"),
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("tool"),
  ]),
  content: Type.String(),
  createdAt: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type AgentMessage = Type.Static<typeof AgentMessageSchema>;

function defaultScopeForMessage(
  role: AgentMessage["role"],
  metadata?: Record<string, unknown>,
): ContextScope | undefined {
  if (
    metadata?.kind === "phase_prompt" ||
    metadata?.kind === "routing_decision" ||
    metadata?.kind === "model_message" ||
    metadata?.kind === "thread_output"
  ) {
    return "execution";
  }

  if (metadata?.kind === "error" || metadata?.kind === "limit_exceeded") {
    return "diagnostic";
  }

  if (role === "user" || role === "assistant") {
    return "conversation";
  }

  if (role === "tool") {
    return "execution";
  }

  return undefined;
}

export function messageScope(message: AgentMessage): ContextScope | undefined {
  const metadata = message.metadata as AgentMessageMetadata | undefined;
  return isContextScope(metadata?.scope) ? metadata.scope : undefined;
}

export function isConversationMessage(message: AgentMessage): boolean {
  return messageScope(message) === "conversation";
}

export const SkillSchema = Type.Object({
  id: Type.String(),
  path: Type.String(),
  content: Type.String(),
  toolNames: Type.Optional(Type.Array(Type.String())),
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

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function padDatePart(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatLocalTimestamp(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbsolute = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(offsetAbsolute / 60);
  const offsetRemainingMinutes = offsetAbsolute % 60;

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    "T",
    `${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}`,
    "-",
    padDatePart(Math.floor(date.getMilliseconds() / 10)),
    offsetSign,
    padDatePart(offsetHours),
    ":",
    padDatePart(offsetRemainingMinutes),
  ].join("");
}

export function nowIso(): string {
  return formatLocalTimestamp();
}

export function createMessage(
  role: AgentMessage["role"],
  content: string,
  metadata?: Record<string, unknown>,
): AgentMessage {
  const scope = isContextScope(metadata?.scope) ? metadata.scope : defaultScopeForMessage(role, metadata);
  const normalizedMetadata = scope === undefined
    ? metadata
    : { ...metadata, scope };

  return {
    id: createId("msg"),
    role,
    content,
    createdAt: nowIso(),
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
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
  const createdAt = nowIso();
  const messages = [
    createMessage("user", input.input, { scope: "conversation" }),
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
  session.messages.push(createMessage("user", input, { scope: "conversation" }));
  session.updatedAt = nowIso();
  return session;
}

export function latestUserInput(session: Session<unknown>): string {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message.role === "user" && isConversationMessage(message)) {
      return message.content;
    }
  }

  return session.input;
}
