#!/usr/bin/env bun

import { isAbsolute, join, relative, sep } from "node:path";
import {
  createOpenAICompatibleStream,
  resolveOpenAICompatibleConfig,
} from "@rowan-agent/adapters";
import {
  Agent,
  createId,
  createCoreTools,
  formatLocalTimestamp,
} from "@rowan-agent/agent";
import { inspectTraceRun, jsonlTraceWriter, listTraceRuns } from "@rowan-agent/trace";
import {
  type RowanWorkspacePaths,
  resolveInRowanWorkspace,
  resolveRowanWorkspacePaths,
} from "@rowan-agent/workspace";
import { formatJsonOutput, formatOutcomeOutput } from "./output";
import { loadSkills } from "./skills";

type RunArgs = {
  kind: "run";
  trace?: string;
  skills: string[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  prompt: string;
};

type TraceListArgs = {
  kind: "trace-list";
  runsDir?: string;
};

type TraceShowArgs = {
  kind: "trace-show";
  runsDir?: string;
  target: string;
};

type CliArgs = RunArgs | TraceListArgs | TraceShowArgs;

const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

function createDefaultTracePath(workspace: RowanWorkspacePaths): string {
  return join(workspace.runsDir, `${formatLocalTimestamp()}-${createId("run")}.jsonl`);
}

function resolveOptionalWorkspacePath(path: string | undefined, workspace: RowanWorkspacePaths): string | undefined {
  return path ? resolveInRowanWorkspace(path, workspace) : undefined;
}

function resolveTraceTarget(target: string, workspace: RowanWorkspacePaths): string {
  if (target.endsWith(".jsonl") || target.includes("/") || target.includes("\\")) {
    return resolveInRowanWorkspace(target, workspace);
  }

  return target;
}

function formatWorkspacePathForDisplay(path: string, workspace: RowanWorkspacePaths): string {
  const workspaceRelativePath = relative(workspace.root, path);
  if (workspaceRelativePath && !workspaceRelativePath.startsWith("..") && !isAbsolute(workspaceRelativePath)) {
    return workspaceRelativePath.split(sep).join("/");
  }

  return path;
}

function printHelp(): void {
  console.log(`Rowan

Usage:
  bun run rowan [--base-url url] [--api-key key] [--model name] [--timeout-ms ms] [--trace path] [--skill id-or-path] "prompt"
  bun run rowan trace list [--runs-dir path]
  bun run rowan trace show <run-id-or-file> [--runs-dir path]

Examples:
  bun run rowan "hello"
  bun run rowan --model gpt-4.1-mini "hello"
  bun run rowan --skill example "summarize the example skill"
  bun run rowan --trace runs/real.jsonl "list workspace files"
  bun run rowan trace list
  bun run rowan trace show run_12345678

Trace:
  Source runs use the Rowan project root as the workspace.
  Packaged binary runs use ~/.rowan as the workspace.
  Runs are logged automatically to <workspace>/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-run_<id>.jsonl.
  Relative --trace and --runs-dir paths are resolved from <workspace>.

Skills:
  --skill example resolves to <workspace>/skills/example/SKILL.md.

Environment:
  ROWAN_OPENAI_BASE_URL  Defaults to https://api.openai.com/v1
  ROWAN_OPENAI_API_KEY   Required unless --api-key is passed
  ROWAN_MODEL            Required unless --model is passed
  ROWAN_OPENAI_TIMEOUT_MS Optional request timeout in milliseconds, defaults to 60000
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

function parseOptionalTimeoutMs(value: string | undefined): number | undefined {
  const normalized = value?.trim();
  return normalized ? parsePositiveInteger(normalized, "ROWAN_OPENAI_TIMEOUT_MS") : undefined;
}

function parseTraceArgs(args: string[]): TraceListArgs | TraceShowArgs {
  const command = args.shift();
  let runsDir: string | undefined;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  const readRunsDir = () => {
    const path = args.shift();
    if (!path) {
      throw new Error("--runs-dir requires a path.");
    }
    runsDir = path;
  };

  if (command === "list") {
    while (args.length > 0) {
      const next = args.shift();
      if (next === "--runs-dir") {
        readRunsDir();
        continue;
      }
      throw new Error(`Unknown option for trace list: ${next}`);
    }
    return { kind: "trace-list", runsDir };
  }

  if (command === "show") {
    const target = args.shift();
    if (!target) {
      throw new Error("trace show requires a run id or trace file path.");
    }

    while (args.length > 0) {
      const next = args.shift();
      if (next === "--runs-dir") {
        readRunsDir();
        continue;
      }
      throw new Error(`Unknown option for trace show: ${next}`);
    }
    return { kind: "trace-show", runsDir, target };
  }

  throw new Error(`Unknown trace command: ${command}`);
}

function parseRunArgs(argv: string[]): RunArgs {
  const args = [...argv];
  const parsed: RunArgs = { kind: "run", skills: [], prompt: "" };
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

    if (next === "--trace") {
      const path = args.shift();
      if (!path) {
        throw new Error("--trace requires a path.");
      }
      parsed.trace = path;
      continue;
    }

    if (next === "--skill") {
      const path = args.shift();
      if (!path) {
        throw new Error("--skill requires a path.");
      }
      parsed.skills.push(path);
      continue;
    }

    if (next === "--base-url") {
      const value = args.shift();
      if (!value) {
        throw new Error("--base-url requires a URL.");
      }
      parsed.baseUrl = value;
      continue;
    }

    if (next === "--api-key") {
      const value = args.shift();
      if (!value) {
        throw new Error("--api-key requires a value.");
      }
      parsed.apiKey = value;
      continue;
    }

    if (next === "--model") {
      const value = args.shift();
      if (!value) {
        throw new Error("--model requires a name.");
      }
      parsed.model = value;
      continue;
    }

    if (next === "--timeout-ms") {
      const value = args.shift();
      if (!value) {
        throw new Error("--timeout-ms requires a value.");
      }
      parsed.timeoutMs = parsePositiveInteger(value, "--timeout-ms");
      continue;
    }

    if (next.startsWith("--")) {
      throw new Error(`Unknown option: ${next}`);
    }

    promptParts.push(next);
  }

  parsed.prompt = promptParts.join(" ").trim();
  if (!parsed.prompt) {
    throw new Error("A prompt is required.");
  }

  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  if (args[0] === "trace") {
    args.shift();
    return parseTraceArgs(args);
  }

  return parseRunArgs(args);
}

async function runAgentCommand(args: RunArgs): Promise<void> {
  const workspace = resolveRowanWorkspacePaths();
  const skills = await loadSkills(args.skills, workspace);
  const tools = createCoreTools({ root: workspace.root });
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
  });

  const tracePath = resolveOptionalWorkspacePath(args.trace, workspace) ?? createDefaultTracePath(workspace);
  const traceWriter = jsonlTraceWriter(tracePath);
  agent.subscribe(traceWriter);

  try {
    const outcome = await agent.prompt(args.prompt);
    console.log(formatOutcomeOutput(outcome));
  } finally {
    await agent.flushTrace();
    console.error(`Trace written to ${formatWorkspacePathForDisplay(tracePath, workspace)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspace = resolveRowanWorkspacePaths();

  if (args.kind === "trace-list") {
    const runsDir = resolveOptionalWorkspacePath(args.runsDir, workspace) ?? workspace.runsDir;
    console.log(formatJsonOutput(await listTraceRuns(runsDir)));
    return;
  }

  if (args.kind === "trace-show") {
    const runsDir = resolveOptionalWorkspacePath(args.runsDir, workspace) ?? workspace.runsDir;
    console.log(formatJsonOutput(await inspectTraceRun(resolveTraceTarget(args.target, workspace), runsDir)));
    return;
  }

  await runAgentCommand(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
