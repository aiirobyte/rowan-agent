import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Phase, PhaseFrontmatter, PhaseRegistry } from "./types";
import type { ExtensionAPI, PhaseOutput } from "./extension-api";
import {
  parseFrontmatter,
  loadMarkdown,
  resolveResourcePath,
  inferResourceName,
} from "../loader";
import type { WorkspacePaths } from "../env/path";

const PHASE_MARKER = "PHASE.md";
const PHASE_DIR = "phases";

/**
 * Load a single phase from a path or name.
 *
 * Resolution:
 * 1. If absolute path, load directly
 * 2. If name, resolve to .rowan/phases/<name>/PHASE.md
 * 3. Parse frontmatter and body
 * 4. Discover and load index.ts|js if exists
 */
export async function loadPhase(
  input: string,
  workspace?: WorkspacePaths,
): Promise<Phase> {
  const resolved = resolveResourcePath(input, PHASE_DIR, PHASE_MARKER, workspace);
  const { frontmatter, body } = await loadMarkdown<PhaseFrontmatter>(resolved);

  if (!frontmatter.id) {
    throw new Error(`Phase at "${resolved}" is missing required "id" field in frontmatter.`);
  }

  const baseDir = dirname(resolved);
  const phase: Phase = {
    id: frontmatter.id,
    name: frontmatter.name ?? inferResourceName(resolved, PHASE_MARKER),
    description: frontmatter.description ?? "",
    tools: frontmatter.tools,
    skills: frontmatter.skills,
    toolChoice: frontmatter["tool-choice"],
    entry: frontmatter.entry === true,
    target: frontmatter.target,
    filePath: resolved,
    baseDir,
    content: body,
    buildPrompt: () => buildPhasePrompt(phase),
  };

  // Try to load execution code
  const codePath = await discoverPhaseCode(baseDir);
  if (codePath) {
    phase.run = await loadPhaseCode(codePath);
  }

  return phase;
}

/**
 * Load all phases from .rowan/phases directory.
 *
 * Scans for subdirectories containing PHASE.md files.
 * Returns PhaseRegistry with entry phase set to:
 * 1. Phase with entry: true in frontmatter
 * 2. First phase found (if none marked as entry)
 * 3. null (if no phases found)
 */
export async function loadPhases(
  workspace?: WorkspacePaths,
): Promise<PhaseRegistry> {
  const ws = workspace ?? (await import("../env/path")).resolveWorkspacePaths();
  const phasesDir = join(ws.rowanDir, PHASE_DIR);

  const phases = new Map<string, Phase>();
  let entryPhaseId: string | null = null;

  if (!existsSync(phasesDir)) {
    return { phases, entryPhaseId };
  }

  const entries = await readdir(phasesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const phaseFile = join(phasesDir, entry.name, PHASE_MARKER);
    if (!existsSync(phaseFile)) continue;

    try {
      const phase = await loadPhase(entry.name, ws);
      phases.set(phase.id, phase);

      if (phase.entry && !entryPhaseId) {
        entryPhaseId = phase.id;
      }
    } catch (error) {
      console.warn(`Failed to load phase "${entry.name}":`, error);
    }
  }

  // Default to first phase if none marked as entry
  if (!entryPhaseId && phases.size > 0) {
    entryPhaseId = phases.keys().next().value ?? null;
  }

  return { phases, entryPhaseId };
}

/**
 * Discover index.ts or index.js in phase directory.
 * Returns path to first match, or null.
 */
async function discoverPhaseCode(baseDir: string): Promise<string | null> {
  const candidates = ["index.ts", "index.js"];

  for (const candidate of candidates) {
    const fullPath = join(baseDir, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Load phase execution code using jiti.
 * Module must export a run() function.
 */
async function loadPhaseCode(
  codePath: string,
): Promise<(api: ExtensionAPI) => Promise<PhaseOutput>> {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
  });

  const mod = await jiti.import(codePath, { default: true }) as { run?: unknown };

  if (typeof mod.run !== "function") {
    throw new Error(`Phase code at "${codePath}" must export a "run" function.`);
  }

  return mod.run as (api: ExtensionAPI) => Promise<PhaseOutput>;
}

/**
 * Build prompt string from phase definition.
 * Combines description, tool/skill restrictions, and content.
 */
function buildPhasePrompt(phase: Phase): string {
  const parts: string[] = [];

  if (phase.description) {
    parts.push(phase.description);
  }

  if (phase.tools && phase.tools.length > 0) {
    parts.push(`Available tools: ${phase.tools.join(", ")}`);
  }

  if (phase.skills && phase.skills.length > 0) {
    parts.push(`Available skills: ${phase.skills.join(", ")}`);
  }

  if (phase.content) {
    parts.push(phase.content);
  }

  return parts.join("\n\n");
}
