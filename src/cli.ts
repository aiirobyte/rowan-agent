#!/usr/bin/env bun

import {
  Agent,
  createDemoTools,
  createOpenAICompatibleStream,
  jsonlTraceWriter,
  loadSkills,
  resolveOpenAICompatibleConfig,
} from "./index";

type CliArgs = {
  trace?: string;
  skills: string[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  prompt: string;
};

function printHelp(): void {
  console.log(`Rowan

Usage:
  bun run rowan [--base-url url] [--api-key key] [--model name] [--trace path] [--skill path] "prompt"

Examples:
  bun run rowan "hello"
  bun run rowan --model gpt-4.1-mini "hello"
  bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"

Environment:
  ROWAN_OPENAI_BASE_URL  Defaults to https://api.openai.com/v1
  ROWAN_OPENAI_API_KEY   Required unless --api-key is passed
  ROWAN_MODEL            Required unless --model is passed
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const parsed: CliArgs = { skills: [], prompt: "" };
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skills = await loadSkills(args.skills);
  const tools = createDemoTools();
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

  if (args.trace) {
    agent.subscribe(jsonlTraceWriter(args.trace));
  }

  const outcome = await agent.prompt(args.prompt);
  console.log(JSON.stringify(outcome, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
