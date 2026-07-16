#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  createDispatchStream,
  registerBuiltInApiProviders,
  registerModel,
} from "@rowan-agent/models";
import {
  Agent,
  createTimestamp,
  AgentRuntime,
  SqliteRuntimeStateStore,
  type AgentEvent,
  type AgentEventListener,
  type AgentRun,
  type AgentContext,
  type LoadedExtension,
  type LlmModelRef,
  type PhaseRegistry,
} from "@rowan-agent/agent";
import {
  pinoAgentEventLogger,
  type AgentEventLogLevel,
} from "@rowan-agent/logging";
import type { SessionListItem } from "@rowan-agent/agent";
import { LocalJsonlSessionManager } from "@rowan-agent/agent";
import {
  createCoreTools,
  type WorkspacePaths,
  resolveInWorkspace,
  resolveWorkspacePaths,
  loadConfigFile,
  registerConfigModels,
  resolveDefaultModel,
  type AgentConfigFile,
} from "@rowan-agent/agent";
import { formatJsonOutput, formatMessageContent, formatToolArgsPreview } from "./output";

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
  const timestamp = process.platform === "win32"
    ? createTimestamp().replaceAll(":", "-")
    : createTimestamp();
  return join(workspaceRunsDir(workspace), `${timestamp}-${sessionId}.jsonl`);
}

function resolveOptionalWorkspacePath(path: string | undefined, workspace: WorkspacePaths): string | undefined {
  return path ? resolveInWorkspace(path, workspace.rowanDir) : undefined;
}

function formatWorkspacePathForDisplay(path: string, workspace: WorkspacePaths): string {
  for (const root of [workspace.cwd, workspace.rowanDir]) {
    const workspaceRelativePath = relative(root, path);
    if (workspaceRelativePath && !workspaceRelativePath.startsWith("..") && !isAbsolute(workspaceRelativePath)) {
      return workspaceRelativePath.split(sep).join("/");
    }
  }

  return path;
}

function workspaceRunsDir(workspace: WorkspacePaths): string {
  return join(workspace.rowanDir, "runs");
}

function workspaceSessionsDir(workspace: WorkspacePaths): string {
  return join(workspace.rowanDir, "sessions");
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

Commands:
${formatCommandHelp()}
  When no command is provided, positional text is treated as the prompt.

Run logs:
  Rowan resources are stored in <cwd>/.rowan.
  Session run logs are written automatically to <cwd>/.rowan/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-<session-id>.jsonl.
  --log-level controls run log detail: debug, info, warn, error, or silent. Default: info.
  Info logs write event summaries only; debug logs include redacted event payloads.
  Matching run log records are streamed live to stderr; stdout is reserved for command results.
  Turns in one process append to the same run log; explicit session loads start a new run log.
  Relative --log paths are resolved from <cwd>/.rowan.
  CLI output prints Session id once, Message id before each turn result, and Log path last once per entry.

Sessions:
  Sessions are saved automatically to <cwd>/.rowan/sessions/<session-id>.jsonl.
  Use --session <id> to continue a saved conversation.
  Interactive controls: :session, :exit, :quit.

Skills:
  --skill <path> loads a SKILL.md file, a skill directory, or a directory containing skill folders.

Config:
  Model providers are configured in <cwd>/.rowan/config.yaml.
  The file defines providers, models, api keys, and the default model.
  timeoutMs is the streaming idle timeout after the first response byte.
  See config-improving-plan.md for the full schema.
  Without a config file, --model and --api-key are required.

Environment:
  ROWAN_LOG_LEVEL        Optional run log detail: debug, info, warn, error, or silent
  ROWAN_WORKSPACE        Optional cwd override
`);
}

function parsePositiveInteger(value: string, source: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${source} must be a positive integer.`);
  }
  return parsed;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
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

function configuredLogLevel(args: CliArgs, config?: AgentConfigFile): AgentEventLogLevel {
  return args.logLevel ?? (config?.logLevel as AgentEventLogLevel | undefined) ?? parseOptionalLogLevel(process.env.ROWAN_LOG_LEVEL, "ROWAN_LOG_LEVEL") ?? "info";
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
type CliSessionListItem = Pick<SessionListItem, "id" | "title" | "createdAt" | "updatedAt" | "messageCount">;
type AgentResources = {
  skills: AgentContext["skills"];
  phases: PhaseRegistry;
  extensions: LoadedExtension[];
};
type ConfiguredAgent = {
  agent: Agent;
  runtime: AgentRuntime;
  configFile?: AgentConfigFile;
  loadResources(): Promise<AgentResources>;
};

function createConfigSnapshot(
  args: CliArgs,
  workspace: WorkspacePaths,
  configFile: AgentConfigFile | undefined,
): Record<string, unknown> {
  const env = process.env as Record<string, string | undefined>;
  const logPath = resolveOptionalWorkspacePath(args.log, workspace);
  const logLevel = configuredLogLevel(args, configFile);
  const tools = createCoreTools({ root: workspace.cwd });

  const configFileSummary = configFile
    ? {
      loaded: true,
      path: formatWorkspacePathForDisplay(join(workspace.rowanDir, "config.yaml"), workspace),
      providers: configFile.providers.map((p) => ({
        id: p.id,
        ...(p.name ? { name: p.name } : {}),
        baseUrl: p.baseUrl,
        protocol: p.protocol,
        modelCount: p.models.length,
      })),
      defaultModel: configFile.model ?? resolveDefaultModel(configFile),
      ...(configFile.logLevel ? { logLevel: configFile.logLevel } : {}),
    }
    : {
      loaded: false,
      path: null,
    };

  const modelFlag = nonEmpty(args.model);
  const apiKeyFlag = nonEmpty(args.apiKey);
  const baseUrlFlag = nonEmpty(args.baseUrl);

  return {
    command: "config",
    workspace: {
      cwd: workspace.cwd,
      rowanDir: workspace.rowanDir,
    },
    configFile: configFileSummary,
    model: {
      flag: modelFlag ?? null,
      apiKeyConfigured: Boolean(apiKeyFlag),
      apiKey: maskSecret(apiKeyFlag),
      baseUrl: baseUrlFlag ? normalizeBaseUrl(baseUrlFlag) : null,
      timeoutMs: args.timeoutMs ?? null,
    },
    session: {
      id: args.sessionId ?? null,
      source: args.sessionId ? "flag" : "new",
    },
    logging: {
      automatic: !logPath,
      path: logPath ? formatWorkspacePathForDisplay(logPath, workspace) : null,
      level: logLevel,
      levelSource:
        args.logLevel !== undefined
          ? "flag"
          : configFile?.logLevel
            ? "config"
            : nonEmpty(env.ROWAN_LOG_LEVEL)
              ? "env"
              : "default",
    },
    skills: args.skills.map((skill) => ({ idOrPath: skill })),
    tools: tools.map((tool) => tool.name),
  };
}

async function runConfigCommand(args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  const configFile = await loadConfigFile(workspace);
  console.log(formatJsonOutput(createConfigSnapshot(args, workspace, configFile)));
}

async function runListCommand(_args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  const sessions = [...(await LocalJsonlSessionManager.list(workspaceSessionsDir(workspace)))]
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
  const loadResources = () => loadAgentResources(args, workspace);
  const resources = await loadResources();
  const { skills } = resources;
  const tools = createCoreTools({ root: workspace.cwd });
  const sessionManager = args.sessionId
    ? await LocalJsonlSessionManager.open(workspaceSessionsDir(workspace), args.sessionId)
    : undefined;
  if (args.sessionId && !sessionManager) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }

  // Load config file and register providers/models
  const configFile = await loadConfigFile(workspace);

  let defaultModelRef: LlmModelRef;

  if (configFile) {
    registerConfigModels(configFile);
    const resolved = resolveDefaultModel(configFile);
    if (!resolved) {
      throw new Error("No models found in .rowan/config.yaml.");
    }
    defaultModelRef = resolved;
  } else {
    // No config file — require --model and --api-key
    if (!args.model) {
      throw new Error("Model is required. Pass --model or create .rowan/config.yaml.");
    }
    if (!args.apiKey) {
      throw new Error("API key is required. Pass --api-key or create .rowan/config.yaml.");
    }
    const virtualModelId = args.model;
    const slashIndex = virtualModelId.indexOf("/");
    const provider = slashIndex === -1 ? "openai" : virtualModelId.slice(0, slashIndex);
    const modelId = slashIndex === -1 ? virtualModelId : virtualModelId.slice(slashIndex + 1);
    registerBuiltInApiProviders();
    registerModel({
      id: modelId,
      name: modelId,
      protocol: "openai-completions",
      provider,
      baseUrl: args.baseUrl ?? "https://api.openai.com/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
      apiKey: args.apiKey,
      timeoutMs: args.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
    });
    defaultModelRef = { provider, id: modelId };
  }

  // CLI flags override the selected default model's fields
  if (args.model && configFile) {
    const slashIndex = args.model.indexOf("/");
    const provider = slashIndex === -1 ? defaultModelRef.provider : args.model.slice(0, slashIndex);
    const modelId = slashIndex === -1 ? args.model : args.model.slice(slashIndex + 1);
    defaultModelRef = { provider, id: modelId };
  }
  if (configFile) {
    const { getModel } = await import("@rowan-agent/models");
    const existing = getModel(defaultModelRef.provider, defaultModelRef.id);
    if (!existing) {
      throw new Error(`Model "${defaultModelRef.provider}/${defaultModelRef.id}" not found in registry.`);
    }
    registerModel({
      ...existing,
      ...(args.apiKey ? { apiKey: args.apiKey } : {}),
      ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
      ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
    });
  }

  const loadedSkills = skills.length > 0 || args.skills.length > 0 ? { skills } : {};
  const context = sessionManager
    ? await sessionManager.buildAgentContext({
      tools,
      ...loadedSkills,
    })
    : {
      systemPrompt: [
        "You are Rowan, a helpful assistant that can assist users with a wide variety of tasks.",
        "",
        "You operate as an agent — you can read and write files, execute commands, and use various tools to accomplish tasks on behalf of the user.",
      ].join("\n"),
      messages: [],
      tools,
      skills,
    };

  await mkdir(workspaceRunsDir(workspace), { recursive: true });
  const stateStore = new SqliteRuntimeStateStore(join(workspace.rowanDir, "runtime.sqlite"));
  const sessionProvider = {
    create: (input: Parameters<typeof LocalJsonlSessionManager.create>[1]) =>
      LocalJsonlSessionManager.create(workspaceSessionsDir(workspace), input),
    open: (sessionId: string) =>
      LocalJsonlSessionManager.open(workspaceSessionsDir(workspace), sessionId),
  };
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await AgentRuntime.start({
      stateStore,
      sessionManager: sessionProvider,
    });
    const options = {
      context: { ...context, phases: resources.phases },
      model: defaultModelRef,
      stream: createDispatchStream(),
      extensions: resources.extensions,
    };
    const agent = args.sessionId
      ? await Agent.resume({ ...options, sessionId: args.sessionId })
      : await Agent.create(options);
    return { agent, runtime, configFile, loadResources };
  } catch (error) {
    await runtime?.stop();
    stateStore.close();
    throw error;
  }
}

async function loadAgentResources(args: CliArgs, workspace: WorkspacePaths): Promise<AgentResources> {
  const defaultSkillsDir = join(workspace.rowanDir, "skills");
  const discoveredSkills = existsSync(defaultSkillsDir) ? await Agent.loadSkills(defaultSkillsDir) : [];
  const configuredSkills = (await Promise.all(
    args.skills.map((skill) => Agent.loadSkills(resolveInWorkspace(skill, workspace.cwd))),
  )).flat();
  const phasesDir = join(workspace.rowanDir, "phases");
  const phases = existsSync(phasesDir)
    ? await Agent.loadPhases(phasesDir)
    : { phases: new Map(), entryPhaseId: null };
  const extensionsDir = join(workspace.rowanDir, "extensions");
  const { extensions } = existsSync(extensionsDir)
    ? await Agent.loadExtensions(extensionsDir)
    : { extensions: [] };

  return {
    skills: [...discoveredSkills, ...configuredSkills],
    phases,
    extensions,
  };
}

async function promptWithLog(input: {
  agent: Agent;
  prompt: string;
  workspace: WorkspacePaths;
  logPath?: string;
  logMode?: "replace" | "append";
  logLevel?: AgentEventLogLevel;
  onLogPath?: (path: string | undefined) => void;
  onMessageId?: (messageId: string) => void;
  onInputWait?: () => void;
}): Promise<{ run: AgentRun; outcome: import("@rowan-agent/agent").Outcome }> {
  let unsubscribe: (() => void) | undefined;
  let eventLogger: ReturnType<typeof pinoAgentEventLogger> | undefined;
  try {
    const sessionId = input.agent.getSessionId() ?? "session";
    const resolvedLogPath = input.logPath ?? createDefaultLogPath(input.workspace, sessionId);
    const runEventLogger = pinoAgentEventLogger(resolvedLogPath, { mode: input.logMode, level: input.logLevel });
    eventLogger = runEventLogger;
    let currentStreamableMessage = false;
    let currentAssistantWroteContent = false;
    const listener: AgentEventListener = ((event: AgentEvent) => {
      runEventLogger(event);

      if (event.type === "user_prompt_requested") {
        input.onInputWait?.();
      }

      if (event.type === "message_start" && event.message.role === "assistant") {
        currentStreamableMessage = true;
        currentAssistantWroteContent = false;
        if (currentStreamableMessage && event.message.content) {
          const content = formatMessageContent(event.message.content);
          if (content) {
            process.stdout.write(content);
            currentAssistantWroteContent = true;
          }
        }
      }

      if (event.type === "message_update" && event.delta && currentStreamableMessage) {
        process.stdout.write(event.delta);
        currentAssistantWroteContent = true;
      }

      if (event.type === "message_end" && currentStreamableMessage) {
        if (currentAssistantWroteContent) {
          process.stdout.write("\n");
        }
        currentStreamableMessage = false;
        currentAssistantWroteContent = false;
      }

      if (event.type === "tool_execution_start") {
        const argsPreview = formatToolArgsPreview(event.toolName, event.args);
        process.stderr.write(`  ⚙ ${event.toolName}(${argsPreview})\n`);
      }
      if (event.type === "tool_execution_end") {
        const icon = event.isError ? "✗" : "✓";
        process.stderr.write(`  ${icon} ${event.toolName}\n`);
      }
    }) as AgentEventListener;
    listener.flush = async () => {
      await runEventLogger.flush();
    };

    unsubscribe = input.agent.subscribe(listener);
    const run = await input.agent.send(input.prompt);
    input.onMessageId?.(run.messageId);
    const outcome = await run.result();
    return { run, outcome };
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
  const { agent, runtime } = configured;

  const explicitLogPath = resolveOptionalWorkspacePath(args.log, workspace);
  const logLevel = configuredLogLevel(args, configured.configFile);
  let activeLogPath: string | undefined = explicitLogPath;
  let hasWrittenLog = false;
  let hasPrintedSession = false;
  let hasPrintedLog = false;

  const printSessionOnce = () => {
    const sessionId = agent.getSessionId();
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

  if (agent.getSessionId()) {
    printSessionOnce();
  }

  let activeRun: Promise<void> | undefined;
  let waitingForInput = false;
  let resolveActiveRunReady: (() => void) | undefined;
  let activeRunReady: Promise<void> | undefined;

  const resetActiveRunReady = () => {
    activeRunReady = new Promise<void>((resolve) => {
      resolveActiveRunReady = resolve;
    });
  };

  const markActiveRunReady = () => {
    resolveActiveRunReady?.();
    resolveActiveRunReady = undefined;
  };

  const waitForActiveRunReady = async () => {
    if (!activeRun || !activeRunReady) {
      return;
    }
    await activeRunReady;
  };

  const runPrompt = async (prompt: string, options: { recoverable?: boolean; onInputWait?: () => void } = {}) => {
    let writtenLogPath: string | undefined;
    let messageId: string | undefined;
    let printedRunHeader = false;
    const printRunHeader = () => {
      if (printedRunHeader) return;
      printedRunHeader = true;
      printSessionOnce();
      if (messageId) {
        console.error(`Message id: ${messageId}`);
      }
      printLogOnce(writtenLogPath);
    };

    try {
      const resources = await configured.loadResources();
      agent.setSkills(resources.skills);
      agent.setPhases(resources.phases);
      const run = await promptWithLog({
        agent,
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
        onInputWait: options.onInputWait,
      });
      printRunHeader();
      if (run.run.status === "failed") {
        throw new Error(run.outcome.message);
      }
    } catch (error) {
      printRunHeader();
      if (options.recoverable) {
        console.error(error instanceof Error ? error.message : error);
        return;
      }
      throw error;
    }
  };

  const startPrompt = async (prompt: string, options: { recoverable?: boolean } = {}) => {
    waitingForInput = false;
    resetActiveRunReady();
    activeRun = runPrompt(prompt, {
      ...options,
      onInputWait: () => {
        waitingForInput = true;
        markActiveRunReady();
      },
    }).finally(() => {
      activeRun = undefined;
      waitingForInput = false;
      markActiveRunReady();
    });
    await waitForActiveRunReady();
  };

  const resumePrompt = async (prompt: string) => {
    waitingForInput = false;
    resetActiveRunReady();
    const run = await agent.send(prompt);
    console.error(`Message id: ${run.messageId}`);
    await waitForActiveRunReady();
  };

  if (args.prompt) {
    await startPrompt(args.prompt);
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
        console.log(agent.getSessionId() ?? "(no session yet)");
        if (process.stdin.isTTY) {
          process.stdout.write("> ");
        }
        continue;
      }

      if (activeRun && !waitingForInput) {
        await waitForActiveRunReady();
      }

      if (activeRun && waitingForInput) {
        await resumePrompt(prompt);
      } else {
        await startPrompt(prompt, { recoverable: true });
      }

      if (process.stdin.isTTY) {
        process.stdout.write("> ");
      }
    }
  } finally {
    rl.close();
    if (activeRun) {
      agent.abort();
      await activeRun.catch(() => undefined);
    }
    await runtime.stop();
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
