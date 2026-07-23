#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  createModelStream,
  registerBuiltInApiProviders,
  registerModel,
} from "@rowan-agent/models";
import {
  AgentRuntime,
  SqliteStore,
  createCoreTools,
  loadExtensions,
  loadPhases,
  loadSkills,
  type AgentConfig,
  type AgentId,
  type AgentRun,
  type AgentSummary,
  type ConfigProvider,
  type Skill,
  type RunBoundary,
  type RunSnapshot,
  type ModelRef,
} from "../../agent/src";
import {
  brandConfigToken,
} from "../../agent/src/runtime/config-provider";
import type { ConfigPutResult, ConfigResolution } from "../../agent/src/runtime/contracts";
import {
  pinoDurableRunEventLogger,
  type DurableRunEventLogLevel,
} from "@rowan-agent/logging";
import {
  formatJsonOutput, formatMessageContent, formatToolArgsPreview,
} from "./output";
import {
  loadConfigFile,
  registerConfigModels,
  resolveDefaultModel,
  type AgentConfigFile,
} from "./config";
import { resolveInWorkspace, resolveWorkspacePaths, type WorkspacePaths } from "./workspace";

/*
 * The CLI owns the executable configuration adapter. The Durable Store keeps
 * only an opaque token; this adapter binds the current workspace configuration
 * to an Agent for the lifetime of the process.
 */
class CliConfigProvider implements ConfigProvider {
  private readonly configs = new Map<string, AgentConfig>();
  private readonly manifests = new Map<string, { agentId: AgentId; identity: string }>();

  constructor(private readonly manifestPath: string) {}

  async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.manifestPath, "utf8")) as Record<string, { agentId?: string; identity?: string }>;
      for (const [token, entry] of Object.entries(value)) {
        if (typeof entry.agentId === "string" && typeof entry.identity === "string") {
          this.manifests.set(token, { agentId: entry.agentId as AgentId, identity: entry.identity });
        }
      }
    } catch {
      // A missing manifest is normal on first use; malformed state is ignored and rebuilt.
    }
  }

  bind(agentId: AgentId, config: AgentConfig): void {
    const token = tokenFor(agentId, config.identity);
    this.configs.set(token, config);
    this.remember(token, agentId, config.identity);
  }

  async flush(): Promise<void> {
    await this.persist();
  }

  async put(input: { agentId: AgentId; config: AgentConfig; operationId: string; signal: AbortSignal }): Promise<ConfigPutResult> {
    if (input.signal.aborted) throw abortError();
    this.bind(input.agentId, input.config);
    const token = tokenFor(input.agentId, input.config.identity);
    this.remember(token, input.agentId, input.config.identity);
    await this.persist();
    return { kind: "stored", token };
  }

  async resolve(input: { agentId: AgentId; token: import("../../agent/src").ConfigToken; signal: AbortSignal }): Promise<ConfigResolution> {
    if (input.signal.aborted) throw abortError();
    const entry = this.manifests.get(String(input.token));
    const config = this.configs.get(String(input.token));
    if (!entry || entry.agentId !== input.agentId || !config || config.identity !== entry.identity) {
      return { kind: "unavailable", reason: "The requested immutable workspace configuration is not loaded." };
    }
    return { kind: "available", config };
  }

  private remember(token: string, agentId: AgentId, identity: string): void {
    this.manifests.set(token, { agentId, identity });
  }

  private async persist(): Promise<void> {
    await writeFile(this.manifestPath, `${JSON.stringify(Object.fromEntries(this.manifests), null, 2)}\n`, "utf8");
  }
}

function tokenFor(agentId: AgentId, identity: string): string {
  return brandConfigToken(`cfg_${encodeURIComponent(agentId)}_${encodeURIComponent(identity)}`);
}

function abortError(): Error {
  const error = new Error("Operation aborted.");
  error.name = "AbortError";
  return error;
}

type CliCommand = "config" | "list";

type CliArgs = {
  command?: CliCommand;
  log?: string;
  logLevel?: DurableRunEventLogLevel;
  agentId?: AgentId;
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
    summary: "List durable Agents in the current workspace.",
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

function createDefaultLogPath(workspace: WorkspacePaths, runId: string): string {
  const timestamp = process.platform === "win32"
    ? createTimestamp().replaceAll(":", "-")
    : createTimestamp();
  return join(workspaceRunsDir(workspace), `${timestamp}-${runId}.jsonl`);
}

function createTimestamp(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  const iso = local.toISOString().slice(0, -1);
  const sign = offset <= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${iso}${sign}${hours}:${minutes}`;
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

function printHelp(): void {
  console.log(`Rowan

Usage:
  bun run rowan [options] [command] [prompt]

Examples:
  bun run rowan "hello"
  bun run rowan config
  bun run rowan list
  bun run rowan --agent agt_12345678 "continue"
  bun run rowan --model gpt-4.1-mini "hello"
  bun run rowan --skill example "summarize the example skill"
  bun run rowan --log runs/real.jsonl "list workspace files"
  bun run rowan --log-level debug "inspect full event payloads"

Commands:
${formatCommandHelp()}
  When no command is provided, positional text is treated as the prompt.

Run logs:
  Rowan resources are stored in <cwd>/.rowan.
  Durable Run logs are written automatically to <cwd>/.rowan/runs/<timestamp>-<run-id>.jsonl.
  --log-level controls run log detail: debug, info, warn, error, or silent. Default: info.
  Info logs write event summaries only; debug logs include redacted event payloads.
  Matching run log records are streamed live to stderr; stdout is reserved for command results.
  Relative --log paths are resolved from <cwd>/.rowan.
  CLI output prints the durable Agent id and Run id before each boundary.

Interactive controls: :exit, :quit.

Skills:
  --skill <path> loads a SKILL.md file, a skill directory, or a directory containing skill folders.

Config:
  Model providers are configured in <cwd>/.rowan/config.yaml.
  The file defines providers, models, api keys, and the default model.
  timeoutMs limits each wait for response headers or the next response body chunk.
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

function parseLogLevel(value: string, source: string): DurableRunEventLogLevel {
  const normalized = value.trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as DurableRunEventLogLevel;
  }
  throw new Error(`${source} must be one of: debug, info, warn, error, silent.`);
}

function parseOptionalLogLevel(value: string | undefined, source: string): DurableRunEventLogLevel | undefined {
  const normalized = value?.trim();
  return normalized ? parseLogLevel(normalized, source) : undefined;
}

function configuredLogLevel(args: CliArgs, config?: AgentConfigFile): DurableRunEventLogLevel {
  return args.logLevel ?? (config?.logLevel as DurableRunEventLogLevel | undefined) ?? parseOptionalLogLevel(process.env.ROWAN_LOG_LEVEL, "ROWAN_LOG_LEVEL") ?? "info";
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

    if (next === "--agent") {
      parsed.agentId = readOptionValue(args, "--agent") as AgentId;
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
type CliAgentListItem = {
  id: AgentId;
  metadata?: Record<string, unknown>;
  createdAt: string;
  activatedAt: string;
  updatedAt: string;
  run?: {
    id: string;
    state: RunSnapshot["state"];
    request?: Extract<RunSnapshot, { state: "input_required" }>["request"];
  };
};
type AgentResources = {
  skills: Skill[];
  phases: NonNullable<AgentConfig["context"]["phases"]>;
  extensions: NonNullable<AgentConfig["extensions"]>;
};
type ConfiguredAgent = {
  runtime: AgentRuntime;
  store: SqliteStore;
  agentId: AgentId;
  pendingRun?: AgentRun;
  pendingSnapshot?: Extract<RunSnapshot, { state: "input_required" }>;
  configFile?: AgentConfigFile;
  close(): Promise<void>;
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
    agent: {
      id: args.agentId ?? null,
      source: args.agentId ? "flag" : "new",
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
  const store = new SqliteStore(join(workspace.rowanDir, "runtime.sqlite"));
  const runtime = await AgentRuntime.init({ store });
  try {
    const runs = (await runtime.listRuns()).items;
    const agents = (await runtime.listAgents()).items.map<CliAgentListItem>((agent: AgentSummary) => {
      const run = runs
        .filter((candidate) => candidate.agentId === agent.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      return {
        id: agent.id,
        ...(agent.metadata ? { metadata: agent.metadata } : {}),
        createdAt: agent.createdAt,
        activatedAt: agent.activatedAt,
        updatedAt: agent.updatedAt,
        ...(run ? {
          run: {
            id: run.id,
            state: run.state,
          },
        } : {}),
      };
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    console.log(formatJsonOutput(agents));
  } finally {
    await runtime.close();
    store.close();
  }
}

async function createConfiguredAgent(
  args: CliArgs,
  workspace: WorkspacePaths,
): Promise<ConfiguredAgent> {
  const resources = await loadAgentResources(args, workspace);
  const { skills } = resources;
  const tools = createCoreTools({ root: workspace.cwd });
  // Load config file and register providers/models
  const configFile = await loadConfigFile(workspace);

  let defaultModelRef: ModelRef;

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

  const config: AgentConfig = {
    identity: `cli-v2:${defaultModelRef.provider}/${defaultModelRef.id}`,
    model: defaultModelRef,
    stream: createModelStream(),
    context: {
      systemPrompt: [
        "You are Rowan, a helpful assistant that can assist users with a wide variety of tasks.",
        "",
        "You operate as an agent — you can read and write files, execute commands, and use various tools to accomplish tasks on behalf of the user.",
      ].join("\n"),
      tools,
      skills,
      phases: resources.phases,
    },
    extensions: resources.extensions,
  };

  await mkdir(workspaceRunsDir(workspace), { recursive: true });
  const store = new SqliteStore(join(workspace.rowanDir, "runtime.sqlite"));
  const configs = new CliConfigProvider(join(workspace.rowanDir, "config-manifest.json"));
  await configs.load();
  if (args.agentId) configs.bind(args.agentId, config);
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await AgentRuntime.init({ store, configs });
    const existing = args.agentId
      ? (await runtime.listAgents()).items.find((agent) => agent.id === args.agentId)
      : undefined;
    const agentId = args.agentId ?? await runtime.createAgent(config);
    configs.bind(agentId, config);
    await configs.flush();
    if (existing && existing.currentConfigIdentity !== config.identity) {
      await runtime.updateAgentConfig(agentId, config, { idempotencyKey: `config:${config.identity}` });
    }
    const pendingSummary = (await runtime.listRuns({ agentId, states: ["input_required"] })).items[0];
    const pendingRun = pendingSummary ? runtime.run(pendingSummary.id) : undefined;
    const pendingSnapshot = pendingRun ? await pendingRun.snapshot() : undefined;
    return {
      runtime,
      store,
      agentId,
      configFile,
      ...(pendingRun ? { pendingRun } : {}),
      ...(pendingSnapshot?.state === "input_required" ? { pendingSnapshot } : {}),
      close: async () => {
        try {
          await runtime!.close();
        } finally {
          store.close();
        }
      },
    };
  } catch (error) {
    await runtime?.close().catch(() => undefined);
    store.close();
    throw error;
  }
}

async function loadAgentResources(args: CliArgs, workspace: WorkspacePaths): Promise<AgentResources> {
  const defaultSkillsDir = join(workspace.rowanDir, "skills");
  const discoveredSkills = existsSync(defaultSkillsDir) ? await loadSkills(defaultSkillsDir) : [];
  const configuredSkills = (await Promise.all(
    args.skills.map((skill) => loadSkills(resolveInWorkspace(skill, workspace.cwd))),
  )).flat();
  const phasesDir = join(workspace.rowanDir, "phases");
  const loadedPhases = existsSync(phasesDir)
    ? await loadPhases(phasesDir)
    : { phases: new Map(), entryPhaseId: null };
  const workspaceDefault = loadedPhases.phases.get("default");
  const phases = workspaceDefault
    ? {
        phases: new Map([
          ...[...loadedPhases.phases.entries()].filter(([name]) => name !== "default"),
          ["workspace-default", { ...workspaceDefault, name: "workspace-default" }],
        ]),
        entryPhaseId: loadedPhases.entryPhaseId === "default" || loadedPhases.entryPhaseId === null
          ? "workspace-default"
          : loadedPhases.entryPhaseId,
      }
    : loadedPhases;
  const extensionsDir = join(workspace.rowanDir, "extensions");
  const { extensions } = existsSync(extensionsDir)
    ? await loadExtensions(extensionsDir)
    : { extensions: [] };

  return {
    skills: [...discoveredSkills, ...configuredSkills],
    phases,
    extensions,
  };
}

async function promptWithLog(input: {
  run: AgentRun;
  workspace: WorkspacePaths;
  logPath?: string;
  logMode?: "replace" | "append";
  logLevel?: DurableRunEventLogLevel;
  onLogPath?: (path: string | undefined) => void;
  onInputWait?: () => void;
}): Promise<{ run: AgentRun; boundary: RunBoundary }> {
  let eventLogger: ReturnType<typeof pinoDurableRunEventLogger> | undefined;
  const observationController = new AbortController();
  try {
    const resolvedLogPath = input.logPath ?? createDefaultLogPath(input.workspace, input.run.id);
    const runEventLogger = pinoDurableRunEventLogger(resolvedLogPath, { mode: input.logMode, level: input.logLevel });
    eventLogger = runEventLogger;
    const observe = (async () => {
      for await (const event of input.run.observe({ signal: observationController.signal })) {
      runEventLogger(event);
        if (event.kind === "message_committed" && event.message.role === "assistant") {
          const content = formatMessageContent(event.message.content);
          if (content) process.stdout.write(`${content}\n`);
        }
        if (event.kind === "tool_state_changed" && event.transition.to === "pending") {
          process.stderr.write(`  ⚙ ${event.toolCall.name}(${formatToolArgsPreview(event.toolCall.name, event.toolCall.args)})\n`);
        }
        if (event.kind === "tool_state_changed" && ["completed", "failed", "indeterminate"].includes(event.transition.to)) {
          process.stderr.write(`  ${event.transition.to === "completed" ? "✓" : "✗"} ${event.toolCall.name}\n`);
        }
        if (event.kind === "run_transitioned" && event.to === "input_required") {
          input.onInputWait?.();
        }
        if (event.kind === "run_transitioned" && ["input_required", "completed", "failed", "cancelled"].includes(event.to)) {
          return;
        }
      }
    })();
    const boundary = await input.run.wait();
    await observe;
    return { run: input.run, boundary };
  } finally {
    try {
      observationController.abort();
      await eventLogger?.flush();
    } finally {
      input.onLogPath?.(eventLogger?.path());
    }
  }
}

async function runInteractiveCommand(args: CliArgs): Promise<void> {
  const workspace = resolveWorkspacePaths();
  const configured = await createConfiguredAgent(args, workspace);

  const explicitLogPath = resolveOptionalWorkspacePath(args.log, workspace);
  const logLevel = configuredLogLevel(args, configured.configFile);
  let activeLogPath = explicitLogPath;
  let hasPrintedLog = false;

  const printLogOnce = (logPath: string | undefined) => {
    if (!hasPrintedLog && logPath) {
      console.error(`Log written to ${formatWorkspacePathForDisplay(logPath, workspace)}`);
      hasPrintedLog = true;
    }
  };

  console.error(`Agent id: ${configured.agentId}`);

  if (configured.pendingRun && configured.pendingSnapshot?.state === "input_required") {
    const request = configured.pendingSnapshot.request;
    console.error(`Input-required Run id: ${configured.pendingRun.id}`);
    console.error(`Input requested: ${request.prompt.content}`);
  }

  let activeRun: Promise<void> | undefined;
  let activeAgentRun: AgentRun | undefined = configured.pendingRun;
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

  const runPrompt = async (run: AgentRun, options: { recoverable?: boolean; onInputWait?: () => void } = {}) => {
    let writtenLogPath: string | undefined;
    let printedRunHeader = false;
    const printRunHeader = () => {
      if (printedRunHeader) return;
      printedRunHeader = true;
      printLogOnce(writtenLogPath);
    };

    try {
      const result = await promptWithLog({
        run,
        workspace,
        logPath: activeLogPath,
        logMode: "replace",
        logLevel,
        onLogPath: (path) => {
          if (path) {
            activeLogPath = path;
            writtenLogPath = path;
          }
        },
        onInputWait: options.onInputWait,
      });
      printRunHeader();
      if (result.boundary.type === "failed") {
        throw new Error(result.boundary.failure.message);
      }
      if (result.boundary.type === "input_required") {
        waitingForInput = true;
        configured.pendingSnapshot = await run.snapshot() as Extract<RunSnapshot, { state: "input_required" }>;
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
    activeAgentRun = await configured.runtime.start(configured.agentId, prompt, { idempotencyKey: `run:${crypto.randomUUID()}` });
    activeRun = runPrompt(activeAgentRun, {
      ...options,
      onInputWait: () => { waitingForInput = true; markActiveRunReady(); },
    }).finally(() => {
      activeRun = undefined;
      if (!waitingForInput) activeAgentRun = undefined;
      markActiveRunReady();
    });
    await waitForActiveRunReady();
  };

  const resumePrompt = async (prompt: string) => {
    if (!activeAgentRun || !configured.pendingSnapshot || configured.pendingSnapshot.state !== "input_required") return;
    waitingForInput = false;
    resetActiveRunReady();
    await activeAgentRun.respond({ requestId: configured.pendingSnapshot.request.id, input: prompt });
    activeRun = runPrompt(activeAgentRun, {
      onInputWait: () => { waitingForInput = true; markActiveRunReady(); },
    }).finally(() => {
      activeRun = undefined;
      markActiveRunReady();
    });
    await waitForActiveRunReady();
  };

  if (args.prompt) {
    if (configured.pendingRun && configured.pendingSnapshot?.state === "input_required") {
      await resumePrompt(args.prompt);
    } else {
      await startPrompt(args.prompt);
    }
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
      if (activeRun && !waitingForInput) {
        await waitForActiveRunReady();
      }

      if (activeRun && waitingForInput) {
        await resumePrompt(prompt);
      } else if (activeAgentRun && configured.pendingSnapshot?.state === "input_required") {
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
      await activeAgentRun?.cancel("CLI closed before Run reached a boundary.").catch(() => undefined);
      await activeRun.catch(() => undefined);
    }
    await configured.close();
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
