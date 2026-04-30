#!/usr/bin/env bun

import {
  Agent,
  createDemoTools,
  createOpenAICompatibleStream,
  fakeStream,
  jsonlTraceWriter,
  loadSkills,
  resolveOpenAICompatibleConfig,
} from "./index";

type CliArgs = {
  fake: boolean;
  openaiCompatible: boolean;
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
  bun run rowan --fake [--trace path] [--skill path] "prompt"
  bun run rowan --openai-compatible [--base-url url] [--api-key key] [--model name] [--trace path] "prompt"

Examples:
  bun run rowan --fake "hello"
  bun run rowan --fake "use echo tool"
  bun run rowan --fake --trace .rowan/runs/latest.jsonl "use echo tool"
  bun run rowan --openai-compatible "hello"
  bun run rowan --openai-compatible --model gpt-4.1-mini "hello"

Environment:
  ROWAN_OPENAI_BASE_URL  Defaults to https://api.openai.com/v1
  ROWAN_OPENAI_API_KEY   Required for --openai-compatible
  ROWAN_MODEL            Required for --openai-compatible
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const parsed: CliArgs = { fake: false, openaiCompatible: false, skills: [], prompt: "" };
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

    if (next === "--fake") {
      parsed.fake = true;
      continue;
    }

    if (next === "--openai-compatible") {
      parsed.openaiCompatible = true;
      continue;
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

    promptParts.push(next);
  }

  parsed.prompt = promptParts.join(" ").trim();
  if (parsed.fake && parsed.openaiCompatible) {
    throw new Error("Choose either --fake or --openai-compatible, not both.");
  }
  if (!parsed.fake && !parsed.openaiCompatible) {
    throw new Error("Choose a runtime: --fake or --openai-compatible.");
  }
  if (!parsed.prompt) {
    throw new Error("A prompt is required.");
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skills = await loadSkills(args.skills);
  const tools = createDemoTools();
  const config = args.openaiCompatible
    ? resolveOpenAICompatibleConfig({
        baseUrl: args.baseUrl,
        apiKey: args.apiKey,
        model: args.model,
        tools,
      })
    : undefined;
  const agent = new Agent({
    systemPrompt: "You are Rowan, a minimal agent kernel.",
    model: config
      ? { provider: "openai-compatible", name: config.model }
      : { provider: "fake", name: "fake-v0" },
    stream: config ? createOpenAICompatibleStream(config) : fakeStream,
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
