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
  createCoreTools,
  formatLocalTimestamp,
  type AgentEvent,
  type AgentEventListener,
  type Outcome,
} from "@rowan-agent/agent";
import { pinoAgentEventLogger, type AgentEventLogPath } from "@rowan-agent/logging";
import { type AgentMessage, type Session, type SessionListItem } from "@rowan-agent/session";
import { LocalJsonAgentStore } from "@rowan-agent/store";
import {
  type RowanWorkspacePaths,
  resolveInRowanWorkspace,
  resolveRowanWorkspacePaths,
} from "@rowan-agent/workspace";
import { formatJsonOutput, formatOutcomeOutput } from "./output";
import { loadSkills, resolveSkillPath } from "./skills";

type CliCommand = "config" | "list";

type CliArgs = {
  command?: CliCommand;
  log?: string;
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

function createDefaultLogPath(workspace: RowanWorkspacePaths, sessionId: string): string {
  return join(workspace.runsDir, `${formatLocalTimestamp()}-${sessionId}.jsonl`);
}

function logSessionIdFromEvent(event: AgentEvent): string | undefined {
  if (event.type === "session_created" || event.type === "session_loaded") {
    return event.session.parentSessionId ?? event.session.id;
  }
  if (
    event.type === "thread_created" ||
    event.type === "thread_end"
  ) {
    return event.parentSessionId;
  }
  if ("sessionId" in event && typeof event.sessionId === "string") {
    return event.sessionId;
  }
  return undefined;
}

function createDefaultLogPathResolver(workspace: RowanWorkspacePaths): AgentEventLogPath {
  return (event) => {
    const sessionId = logSessionIdFromEvent(event);
    return sessionId ? createDefaultLogPath(workspace, sessionId) : undefined;
  };
}

function resolveOptionalWorkspacePath(path: string | undefined, workspace: RowanWorkspacePaths): string | undefined {
  return path ? resolveInRowanWorkspace(path, workspace) : undefined;
}

function formatWorkspacePathForDisplay(path: string, workspace: RowanWorkspacePaths): string {
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
  bun run rowan --max-thread-depth 6 "delegate deeply"

Commands:
${formatCommandHelp()}
  When no command is provided, positional text is treated as the prompt.

Run logs:
  Source runs use the Rowan project root as the workspace.
  Packaged binary runs use ~/.rowan as the workspace.
  Session run logs are written automatically to <workspace>/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-<session-id>.jsonl.
  Turns in one process append to the same run log; explicit session loads start a new run log.
  Relative --log paths are resolved from <workspace>.
  CLI output prints Session id once, Message id before each turn result, and Log path last once per entry.

Sessions:
  Sessions are saved automatically to <workspace>/sessions/<session-id>.json.
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
type AgentSession = Session<AgentEvent>;
type CliSessionListItem = Pick<SessionListItem, "id" | "title" | "createdAt" | "updatedAt" | "messageCount">;

function configuredValue(flagValue: string | undefined, envValue: string | undefined, defaultValue?: string): string | undefined {
  return nonEmpty(flagValue) ?? nonEmpty(envValue) ?? defaultValue;
}

function createConfigSnapshot(args: CliArgs, workspace: RowanWorkspacePaths): Record<string, unknown> {
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
    },
    skills: args.skills.map((skill) => ({
      idOrPath: skill,
      path: formatWorkspacePathForDisplay(resolveSkillPath(skill, workspace), workspace),
    })),
    tools: tools.map((tool) => tool.name),
  };
}

async function runConfigCommand(args: CliArgs): Promise<void> {
  const workspace = resolveRowanWorkspacePaths();
  console.log(formatJsonOutput(createConfigSnapshot(args, workspace)));
}

async function runListCommand(_args: CliArgs): Promise<void> {
  const workspace = resolveRowanWorkspacePaths();
  const agentStore = new LocalJsonAgentStore<AgentSession>(workspace.sessionsDir);
  const sessions = [...(await agentStore.list())]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map<CliSessionListItem>((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messageCount,
    }));
  console.log(formatJsonOutput(sessions));
}

async function createConfiguredAgent(
  args: CliArgs,
  workspace: RowanWorkspacePaths,
): Promise<Agent> {
  const skills = await loadSkills(args.skills, workspace);
  const tools = createCoreTools({ root: workspace.root });
  const agentStore = new LocalJsonAgentStore<AgentSession>(workspace.sessionsDir);
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
  const agent = new Agent({
    systemPrompt: "You are Rowan, a minimal agent kernel.",
    model: { provider: "openai-compatible", name: config.model },
    stream: createOpenAICompatibleStream(config),
    tools,
    skills,
    agentStore,
    budget: {
      maxThreadDepth:
        args.maxThreadDepth ??
        parseOptionalMaxThreadDepth(process.env.ROWAN_MAX_THREAD_DEPTH) ??
        DEFAULT_MAX_THREAD_DEPTH,
    },
  });

  if (args.sessionId) {
    await agent.loadSession(args.sessionId);
  }

  return agent;
}

async function promptWithLog(input: {
  agent: Agent;
  prompt: string;
  logPath: AgentEventLogPath;
  logMode?: "replace" | "append";
  onLogPath?: (path: string | undefined) => void;
  onMessageId?: (messageId: string) => void;
}): Promise<Outcome> {
  const eventLogger = pinoAgentEventLogger(input.logPath, { mode: input.logMode });
  let messageId: string | undefined;
  const listener: AgentEventListener = ((event: AgentEvent) => {
    eventLogger(event);

    if (event.type === "chat_start" && !messageId) {
      messageId = currentTurnMessageId(event.content);
      if (messageId) {
        input.onMessageId?.(messageId);
      }
    }
  }) as AgentEventListener;
  listener.flush = eventLogger.flush;

  const unsubscribe = input.agent.subscribe(listener);
  try {
    return await input.agent.prompt(input.prompt);
  } finally {
    try {
      await input.agent.flushEvents();
    } finally {
      input.onLogPath?.(eventLogger.path());
      unsubscribe();
    }
  }
}

async function runInteractiveCommand(args: CliArgs): Promise<void> {
  const workspace = resolveRowanWorkspacePaths();
  const agent = await createConfiguredAgent(args, workspace);

  const explicitLogPath = resolveOptionalWorkspacePath(args.log, workspace);
  let activeLogPath: string | undefined = explicitLogPath;
  let hasWrittenLog = false;
  let hasPrintedSession = false;
  let hasPrintedLog = false;

  const printSessionOnce = () => {
    const sessionId = agent.state.session?.id;
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

  if (agent.state.session) {
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
      const outcome = await promptWithLog({
        agent,
        prompt,
        logPath: activeLogPath ?? createDefaultLogPathResolver(workspace),
        logMode: hasWrittenLog ? "append" : "replace",
        onLogPath: (path) => {
          activeLogPath = path ?? activeLogPath;
          hasWrittenLog = true;
          writtenLogPath = activeLogPath;
        },
        onMessageId: (id) => {
          messageId = id;
        },
      });
      printRunHeader();
      console.log(formatOutcomeOutput(outcome));
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
        console.log(agent.state.session?.id ?? "(no session yet)");
        if (process.stdin.isTTY) {
          process.stdout.write("> ");
        }
        continue;
      }

      try {
        await runPrompt(prompt);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        throw error;
      }

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
