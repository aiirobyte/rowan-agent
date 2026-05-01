#!/usr/bin/env bun

import { join } from "node:path";
import { createWorkspaceTools } from "@rowan-agent/aci";
import {
  createOpenAICompatibleStream,
  resolveOpenAICompatibleConfig,
} from "@rowan-agent/adapters";
import {
  Agent,
  createId,
  createDemoTools,
  formatLocalTimestamp,
} from "@rowan-agent/agent";
import { inspectTraceRun, jsonlTraceWriter, listTraceRuns } from "@rowan-agent/trace";
import { loadSkills } from "./skills";

type RunArgs = {
  kind: "run";
  trace?: string;
  skills: string[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  prompt: string;
};

type TraceListArgs = {
  kind: "trace-list";
  runsDir: string;
};

type TraceShowArgs = {
  kind: "trace-show";
  runsDir: string;
  target: string;
};

type CliArgs = RunArgs | TraceListArgs | TraceShowArgs;

function createDefaultTracePath(): string {
  return join(".rowan", "runs", `${formatLocalTimestamp()}-${createId("run")}.jsonl`);
}

function printHelp(): void {
  console.log(`Rowan

Usage:
  bun run rowan [--base-url url] [--api-key key] [--model name] [--trace path] [--skill path] "prompt"
  bun run rowan trace list [--runs-dir path]
  bun run rowan trace show <run-id-or-file> [--runs-dir path]

Examples:
  bun run rowan "hello"
  bun run rowan --model gpt-4.1-mini "hello"
  bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"
  bun run rowan trace list
  bun run rowan trace show run_12345678

Trace:
  Runs are logged automatically to .rowan/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-run_<id>.jsonl.
  Pass --trace to choose a specific trace file path.

Environment:
  ROWAN_OPENAI_BASE_URL  Defaults to https://api.openai.com/v1
  ROWAN_OPENAI_API_KEY   Required unless --api-key is passed
  ROWAN_MODEL            Required unless --model is passed
`);
}

function parseTraceArgs(args: string[]): TraceListArgs | TraceShowArgs {
  const command = args.shift();
  let runsDir = ".rowan/runs";

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
  const skills = await loadSkills(args.skills);
  const tools = [...createDemoTools(), ...createWorkspaceTools({ root: process.cwd() })];
  const config = resolveOpenAICompatibleConfig({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    model: args.model,
    tools,
  });
  const agent = new Agent({
    systemPrompt: "You are Rowan, a minimal agent kernel.",
    model: { provider: "openai-compatible", name: config.model },
    stream: createOpenAICompatibleStream(config),
    tools,
    skills,
  });

  const tracePath = args.trace ?? createDefaultTracePath();
  const traceWriter = jsonlTraceWriter(tracePath);
  agent.subscribe(traceWriter);

  try {
    const outcome = await agent.prompt(args.prompt);
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await agent.flushTrace();
    console.error(`Trace written to ${tracePath}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.kind === "trace-list") {
    console.log(JSON.stringify(await listTraceRuns(args.runsDir), null, 2));
    return;
  }

  if (args.kind === "trace-show") {
    console.log(JSON.stringify(await inspectTraceRun(args.target, args.runsDir), null, 2));
    return;
  }

  await runAgentCommand(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
