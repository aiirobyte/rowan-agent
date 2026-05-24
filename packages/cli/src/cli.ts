#!/usr/bin/env bun

import { createInterface } from "node:readline";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  createOpenAICompatibleStream,
  resolveOpenAICompatibleConfig,
} from "@rowan-agent/adapters";
import {
  Agent,
  DEFAULT_MAX_THREAD_DEPTH,
  createMessage,
  formatLocalTimestamp,
  isConversationMessage,
  type AgentEvent,
  type AgentEventListener,
  type AgentMessage,
  type Outcome,
} from "@rowan-agent/agent";
import {
  consoleAgentEventLogger,
  pinoAgentEventLogger,
  type AgentEventLogLevel,
} from "@rowan-agent/logging";
import {
  type SessionManagerSessionListItem,
} from "@rowan-agent/agent";
import { LocalJsonlSessionManager } from "@rowan-agent/agent";
import {
  createCoreTools,
  loadSkills,
  resolveSkillPath,
  type WorkspacePaths,
  resolveInWorkspace,
  resolveWorkspacePaths,
} from "@rowan-agent/agent";
import { formatJsonOutput, formatOutcomeOutput } from "./output";

type CliCommand = "config" | "list";

type CliArgs = {
  command?: CliCommand;
  log?: string;
  logLevel?: AgentEventLogLevel;
  sessionId?: string;
  skills: string[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxThreadDepth?: number;
  prompt?: string;
};

type CliCommandDefinition = {
  name: CliCommand;
  summary: string;
  acceptsPrompt: boolean;
  run(args: CliArgs): Promise<void>;
};

const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;
const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;

const CLI_COMMANDS = {
  config: {
    name: "config",
    summary: "Show the current resolved configuration without printing secrets.",
    acceptsPrompt: false,
    run: runConfigCommand,
  },
  list: {
    name: "list",
    summary: "List saved sessions in the current workspace.",
    acceptsPrompt: false,
    run: runListCommand,
  },
} satisfies Record<CliCommand, CliCommandDefinition>;

function cliCommandDefinitions(): CliCommandDefinition[] {
  return Object.values(CLI_COMMANDS);
}

function cliCommandFor(input: string): CliCommandDefinition | undefined {
  return CLI_COMMANDS[input as CliCommand];
}

function formatCommandHelp(): string {
  return cliCommandDefinitions()
    .map((command) => `  ${command.name.padEnd(7)} ${command.summary}`)
    .join("\n");
}

async function runRegisteredCommand(args: CliArgs): Promise<boolean> {
  if (!args.command) {
    return false;
  }

  await CLI_COMMANDS[args.command].run(args);
  return true;
}

function createDefaultLogPath(workspace: WorkspacePaths, sessionId: string): string {
  return join(workspace.runsDir, `${formatLocalTimestamp()}-${sessionId}.jsonl`);
}

function resolveOptionalWorkspacePath(path: string | undefined, workspace: WorkspacePaths): string | undefined {
  return path ? resolveInWorkspace(path, workspace) : undefined;
}

function formatWorkspacePathForDisplay(path: string, workspace: WorkspacePaths): string {
  const workspaceRelativePath = relative(workspace.root, path);
  if (workspaceRelativePath && !workspaceRelativePath.startsWith("..") && !isAbsolute(workspaceRelativePath)) {
    return workspaceRelativePath.split(sep).join("/");
  }

  return path;
}

function currentTurnMessageId(messages: AgentMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return message.id;
    }
  }

  return undefined;
}

function printHelp(): void {
  console.log(`Rowan

Usage:
  bun run rowan [options] [command] [prompt]

Examples:
  bun run rowan "hello"
  bun run rowan config
  bun run rowan list
  bun run rowan --session ses_12345678 "continue"
  bun run rowan --model gpt-4.1-mini "hello"
  bun run rowan --skill example "summarize the example skill"
  bun run rowan --log runs/real.jsonl "list workspace files"
  bun run rowan --log-level debug "inspect full event payloads"
  bun run rowan --max-thread-depth 6 "delegate deeply"

Commands:
${formatCommandHelp()}
  When no command is provided, positional text is treated as the prompt.

Run logs:
  Source runs use the Rowan project root as the workspace.
  Packaged binary runs use ~/.rowan as the workspace.
  Session run logs are written automatically to <workspace>/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-<session-id>.jsonl.
  --log-level controls run log detail: debug, info, warn, error, or silent. Default: info.
  Info logs write event summaries only; debug logs include redacted event payloads.
  Matching run log records are streamed live to stderr; stdout is reserved for command results.
  Turns in one process append to the same run log; explicit session loads start a new run log.
  Relative --log paths are resolved from <workspace>.
  CLI output prints Session id once, Message id before each turn result, and Log path last once per entry.

Sessions:
  Sessions are saved automatically to <workspace>/sessions/<session-id>.jsonl.
  Use --session <id> to continue a saved conversation.
  Interactive controls: :session, :exit, :quit.

Skills:
  --skill example resolves to <workspace>/skills/example/SKILL.md.

Environment:
  ROWAN_OPENAI_BASE_URL  Defaults to https://api.openai.com/v1
  ROWAN_OPENAI_API_KEY   Required unless --api-key is passed
  ROWAN_MODEL            Required unless --model is passed
  ROWAN_OPENAI_TIMEOUT_MS Optional request timeout in milliseconds, defaults to 60000
  ROWAN_MAX_THREAD_DEPTH Optional maximum nested thread depth, defaults to 4
  ROWAN_LOG_LEVEL        Optional run log detail: debug, info, warn, error, or silent
  ROWAN_RUNTIME          Optional override: source or binary
  ROWAN_WORKSPACE        Optional workspace root override
`);
}

function parsePositiveInteger(value: string, source: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${source} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, source: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${source} must be a non-negative integer.`);
  }
  return parsed;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function configSource(flagValue: string | undefined, envValue: string | undefined, defaultValue?: string): "flag" | "env" | "default" | "missing" {
  if (nonEmpty(flagValue)) {
    return "flag";
  }
  if (nonEmpty(envValue)) {
    return "env";
  }
  return defaultValue === undefined ? "missing" : "default";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function maskSecret(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const prefixLength = 5;
  const suffixLength = 3;
  if (value.length <= prefixLength + suffixLength) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, prefixLength)}${"*".repeat(value.length - prefixLength - suffixLength)}${value.slice(-suffixLength)}`;
}

function readOptionValue(args: string[], option: string): string {
  const value = args.shift();
  if (!value) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseOptionalTimeoutMs(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  return normalized ? parsePositiveInteger(normalized, "ROWAN_OPENAI_TIMEOUT_MS") : undefined;
}

function parseOptionalMaxThreadDepth(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  return normalized ? parseNonNegativeInteger(normalized, "ROWAN_MAX_THREAD_DEPTH") : undefined;
}

function parseLogLevel(value: string, source: string): AgentEventLogLevel {
  const normalized = value.trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as AgentEventLogLevel;
  }
  throw new Error(`${source} must be one of: debug, info, warn, error, silent.`);
}

function parseOptionalLogLevel(value: string | undefined, source: string): AgentEventLogLevel | undefined {
  const normalized = value?.trim();
  return normalized ? parseLogLevel(normalized, source) : undefined;
}

function configuredLogLevel(args: CliArgs): AgentEventLogLevel {
  return args.logLevel ?? parseOptionalLogLevel(process.env.ROWAN_LOG_LEVEL, "ROWAN_LOG_LEVEL") ?? "info";
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const parsed: CliArgs = { skills: [] };
  const promptParts: string[] = [];

  while (args.length > 0) {
    const next = args.shift();
    if (!next) {
      continue;
    }

    if (next === "--help" || next === "-h") {
      printHelp();
      process.exit(0);
    }

    if (next === "--log") {
      parsed.log = readOptionValue(args, "--log");
      continue;
    }

    if (next === "--log-level") {
      parsed.logLevel = parseLogLevel(readOptionValue(args, "--log-level"), "--log-level");
      continue;
    }

    if (next === "--session") {
      parsed.sessionId = readOptionValue(args, "--session");
      continue;
    }

    if (next === "--skill") {
      parsed.skills.push(readOptionValue(args, "--skill"));
      continue;
    }

    if (next === "--base-url") {
      parsed.baseUrl = readOptionValue(args, "--base-url");
      continue;
    }

    if (next === "--api-key") {
      parsed.apiKey = readOptionValue(args, "--api-key");
      continue;
    }

    if (next === "--model") {
      parsed.model = readOptionValue(args, "--model");
      continue;
    }

    if (next === "--timeout-ms") {
      const value = readOptionValue(args, "--timeout-ms");
      parsed.timeoutMs = parsePositiveInteger(value, "--timeout-ms");
      continue;
    }

    if (next === "--max-thread-depth") {
      const value = readOptionValue(args, "--max-thread-depth");
      parsed.maxThreadDepth = parseNonNegativeInteger(value, "--max-thread-depth");
      continue;
    }

    if (next.startsWith("--")) {
      throw new Error(`Unknown option: ${next}`);
    }

    const command = cliCommandFor(next);
    if (command && promptParts.length === 0 && !parsed.command) {
      parsed.command = command.name;
      continue;
    }

    const activeCommand = parsed.command ? CLI_COMMANDS[parsed.command] : undefined;
    if (activeCommand && !activeCommand.acceptsPrompt) {
      throw new Error(`${activeCommand.name} does not accept a prompt.`);
    }

    promptParts.push(next);
  }

  const prompt = promptParts.join(" ").trim();
  if (prompt) {
    parsed.prompt = prompt;
  }

  return parsed;
}
type CliSessionListItem = Pick<SessionManagerSessionListItem, "id" | "title" | "createdAt" | "updatedAt" | "messageCount">;
type ConfiguredAgent = {
  agent: Agent;
  sessionManager?: LocalJsonlSessionManager;
};

function configuredValue(flagValue: string | undefined, envValue: string | undefined, defaultValue?: string): string | undefined {
  return nonEmpty(flagValue) ?? nonEmpty(envValue) ?? defaultValue;
}

function createConfigSnapshot(args: CliArgs, workspace: WorkspacePaths): Record<string, unknown> {
  const env = process.env as Record<string, string | undefined>;
  const baseUrl = configuredValue(args.baseUrl, env.ROWAN_OPENAI_BASE_URL, "https://api.openai.com/v1");
  const apiKey = configuredValue(args.apiKey, env.ROWAN_OPENAI_API_KEY);
  const model = configuredValue(args.model, env.ROWAN_MODEL);
  const timeoutMs =
    args.timeoutMs ??
    parseOptionalTimeoutMs(env.ROWAN_OPENAI_TIMEOUT_MS) ??
    DEFAULT_OPENAI_TIMEOUT_MS;
  const maxThreadDepth =
    args.maxThreadDepth ??
    parseOptionalMaxThreadDepth(env.ROWAN_MAX_THREAD_DEPTH) ??
    DEFAULT_MAX_THREAD_DEPTH;
  const logPath = resolveOptionalWorkspacePath(args.log, workspace);
  const logLevel = configuredLogLevel(args);
  const tools = createCoreTools({ root: workspace.root });

  return {
    command: "config",
    workspace: {
      mode: workspace.mode,
      root: workspace.root,
      runsDir: workspace.runsDir,
      sessionsDir: workspace.sessionsDir,
      skillsDir: workspace.skillsDir,
    },
    openaiCompatible: {
      baseUrl: baseUrl ? normalizeBaseUrl(baseUrl) : undefined,
      baseUrlSource: configSource(args.baseUrl, env.ROWAN_OPENAI_BASE_URL, "https://api.openai.com/v1"),
      apiKeyConfigured: Boolean(apiKey),
      apiKey: maskSecret(apiKey),
      apiKeySource: configSource(args.apiKey, env.ROWAN_OPENAI_API_KEY),
      model,
      modelConfigured: Boolean(model),
      modelSource: configSource(args.model, env.ROWAN_MODEL),
      timeoutMs,
      timeoutMsSource:
        args.timeoutMs !== undefined
          ? "flag"
          : nonEmpty(env.ROWAN_OPENAI_TIMEOUT_MS)
            ? "env"
            : "default",
    },
    session: {
      id: args.sessionId ?? null,
      source: args.sessionId ? "flag" : "new",
    },
    agent: {
      maxThreadDepth,
      maxThreadDepthSource:
        args.maxThreadDepth !== undefined
          ? "flag"
          : nonEmpty(env.ROWAN_MAX_THREAD_DEPTH)
            ? "env"
            : "default",
    },
    logging: {
      automatic: !logPath,
      path: logPath ? formatWorkspacePathForDisplay(logPath, workspace) : null,
      level: logLevel,
      levelSource:
        args.logLevel !== undefined
          ? "flag"
          : nonEmpty(env.ROWAN_LOG_LEVEL)
            ? "env"
            : "default",
    },
    skills: args.skills.map((skill) => ({
      idOrPath: skill,
      path: formatWorkspacePathForDisplay(resolveSkillPath(skill, workspace), workspace),
    })),
    tools: tools.map((tool) => tool.name),
  };
}

async function runConfigCommand(args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  console.log(formatJsonOutput(createConfigSnapshot(args, workspace)));
}

async function runListCommand(_args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  const sessions = [...(await LocalJsonlSessionManager.list(workspace.sessionsDir))]
    .map<CliSessionListItem>((session) => ({
      id: session.id,
      ...(session.title ? { title: session.title } : {}),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messageCount,
    }));
  console.log(formatJsonOutput(sessions));
}

async function createConfiguredAgent(
  args: CliArgs,
  workspace: WorkspacePaths,
): Promise<ConfiguredAgent> {
  const skills = await loadSkills(args.skills, workspace);
  const tools = createCoreTools({ root: workspace.root });
  const sessionManager = args.sessionId
    ? await LocalJsonlSessionManager.open(workspace.sessionsDir, args.sessionId)
    : undefined;
  if (args.sessionId && !sessionManager) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }
  const config = resolveOpenAICompatibleConfig({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    model: args.model,
    timeoutMs:
      args.timeoutMs ??
      parseOptionalTimeoutMs(process.env.ROWAN_OPENAI_TIMEOUT_MS) ??
      DEFAULT_OPENAI_TIMEOUT_MS,
    tools,
  });
  const context = sessionManager
    ? await sessionManager.buildAgentContext({
      tools,
      ...(args.skills.length > 0 ? { skills } : {}),
    })
    : {
      systemPrompt: "You are Rowan, a minimal agent kernel.",
      messages: [],
      tools,
      skills,
    };
  const agent = new Agent({
    context,
    model: { provider: "openai-compatible", name: config.model },
    stream: createOpenAICompatibleStream(config),
    ...(sessionManager ? { sessionId: sessionManager.getSessionId() } : {}),
    limits: {
      maxThreadDepth:
        args.maxThreadDepth ??
        parseOptionalMaxThreadDepth(process.env.ROWAN_MAX_THREAD_DEPTH) ??
        DEFAULT_MAX_THREAD_DEPTH,
    },
  });

  return { agent, sessionManager };
}

async function promptWithLog(input: {
  agent: Agent;
  sessionManager?: LocalJsonlSessionManager;
  prompt: string;
  workspace: WorkspacePaths;
  logPath?: string;
  logMode?: "replace" | "append";
  logLevel?: AgentEventLogLevel;
  onLogPath?: (path: string | undefined) => void;
  onMessageId?: (messageId: string) => void;
}): Promise<{ outcome: Outcome; sessionManager: LocalJsonlSessionManager }> {
  let sessionManager = input.sessionManager;
  let unsubscribe: (() => void) | undefined;
  let eventLogger: ReturnType<typeof pinoAgentEventLogger> | undefined;
  try {
    if (!sessionManager) {
      sessionManager = await LocalJsonlSessionManager.create(input.workspace.sessionsDir, {
        systemPrompt: input.agent.state.context.systemPrompt,
        input: input.prompt,
        skills: input.agent.state.context.skills ?? [],
      });
    }

    const resolvedLogPath = input.logPath ?? createDefaultLogPath(input.workspace, sessionManager.getSessionId());
    const runEventLogger = pinoAgentEventLogger(resolvedLogPath, { mode: input.logMode, level: input.logLevel });
    eventLogger = runEventLogger;
    const consoleLogger = consoleAgentEventLogger({ level: input.logLevel });
    let messageId: string | undefined;
    const listener: AgentEventListener = ((event: AgentEvent) => {
      runEventLogger(event);
      consoleLogger(event);

      if (event.type === "chat_start" && !messageId) {
        messageId = currentTurnMessageId(event.content);
        if (messageId) {
          input.onMessageId?.(messageId);
        }
      }
    }) as AgentEventListener;
    listener.flush = async () => {
      await runEventLogger.flush();
      await consoleLogger.flush();
    };

    unsubscribe = input.agent.subscribe(listener);

    const userMessage = createMessage("user", input.prompt, { scope: "conversation" });
    await sessionManager.appendMessage(userMessage);
    const context = await sessionManager.buildAgentContext({
      tools: input.agent.state.tools,
      skills: input.agent.state.context.skills ?? [],
    });
    const result = await input.agent.run({
      context,
      sessionId: sessionManager.getSessionId(),
    });
    const newMessages = result.messages.slice(context.messages.length);
    for (const message of newMessages) {
      if (message.role !== "user" && isConversationMessage(message)) {
        await sessionManager.appendMessage(message);
      }
    }
    await sessionManager.appendOutcome(result.outcome);
    return { outcome: result.outcome, sessionManager };
  } catch (error) {
    throw error;
  } finally {
    try {
      await input.agent.flushEvents();
    } finally {
      input.onLogPath?.(eventLogger?.path());
      unsubscribe?.();
    }
  }
}

async function runInteractiveCommand(args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  const configured = await createConfiguredAgent(args, workspace);
  const { agent } = configured;
  let sessionManager = configured.sessionManager;

  const explicitLogPath = resolveOptionalWorkspacePath(args.log, workspace);
  const logLevel = configuredLogLevel(args);
  let activeLogPath: string | undefined = explicitLogPath;
  let hasWrittenLog = false;
  let hasPrintedSession = false;
  let hasPrintedLog = false;

  const printSessionOnce = () => {
    const sessionId = sessionManager?.getSessionId() ?? agent.state.sessionId;
    if (!hasPrintedSession && sessionId) {
      console.error(`Session id: ${sessionId}`);
      hasPrintedSession = true;
    }
  };

  const printLogOnce = (logPath: string | undefined) => {
    if (!hasPrintedLog && logPath) {
      console.error(`Log written to ${formatWorkspacePathForDisplay(logPath, workspace)}`);
      hasPrintedLog = true;
    }
  };

  if (agent.state.sessionId) {
    printSessionOnce();
  }

  const runPrompt = async (prompt: string) => {
    let writtenLogPath: string | undefined;
    let messageId: string | undefined;
    const printRunHeader = () => {
      printSessionOnce();
      if (messageId) {
        console.error(`Message id: ${messageId}`);
      }
      printLogOnce(writtenLogPath);
    };

    try {
      const run = await promptWithLog({
        agent,
        sessionManager,
        prompt,
        workspace,
        logPath: activeLogPath,
        logMode: hasWrittenLog ? "append" : "replace",
        logLevel,
        onLogPath: (path) => {
          if (path) {
            activeLogPath = path;
            hasWrittenLog = true;
            writtenLogPath = path;
          }
        },
        onMessageId: (id) => {
          messageId = id;
        },
      });
      sessionManager = run.sessionManager;
      printRunHeader();
      console.log(formatOutcomeOutput(run.outcome));
    } catch (error) {
      printRunHeader();
      throw error;
    }
  };

  if (args.prompt) {
    await runPrompt(args.prompt);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  try {
    if (process.stdin.isTTY) {
      process.stdout.write("> ");
    }

    for await (const line of rl) {
      const prompt = line.trim();
      if (!prompt) {
        if (process.stdin.isTTY) {
          process.stdout.write("> ");
        }
        continue;
      }
      if (prompt === ":exit" || prompt === ":quit") {
        return;
      }
      if (prompt === ":session") {
        console.log(sessionManager?.getSessionId() ?? agent.state.sessionId ?? "(no session yet)");
        if (process.stdin.isTTY) {
          process.stdout.write("> ");
        }
        continue;
      }

      await runPrompt(prompt);

      if (process.stdin.isTTY) {
        process.stdout.write("> ");
      }
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (await runRegisteredCommand(args)) {
    return;
  }

  await runInteractiveCommand(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
