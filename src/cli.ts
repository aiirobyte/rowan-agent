#!/usr/bin/env bun

import { Agent, createDemoTools, fakeStream, jsonlTraceWriter, loadSkills } from "./index";

type CliArgs = {
  fake: boolean;
  trace?: string;
  skills: string[];
  prompt: string;
};

function printHelp(): void {
  console.log(`Rowan v0

Usage:
  bun run rowan --fake [--trace path] [--skill path] "prompt"

Examples:
  bun run rowan --fake "hello"
  bun run rowan --fake "use echo tool"
  bun run rowan --fake --trace .rowan/runs/latest.jsonl "use echo tool"
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const parsed: CliArgs = { fake: false, skills: [], prompt: "" };
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

    promptParts.push(next);
  }

  parsed.prompt = promptParts.join(" ").trim();
  if (!parsed.fake) {
    throw new Error("v0 only supports --fake.");
  }
  if (!parsed.prompt) {
    throw new Error("A prompt is required.");
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skills = await loadSkills(args.skills);
  const agent = new Agent({
    systemPrompt: "You are Rowan v0, a minimal agent kernel.",
    model: { provider: "fake", name: "fake-v0" },
    stream: fakeStream,
    tools: createDemoTools(),
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
