import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Phase, PhaseFrontmatter, PhaseRegistry } from "./types";
import type { PhaseOutput } from "./types";
import type { PhaseContext } from "./types";
import type { PhaseExecution } from "../../loop/execution";
import type { ExtensionAPI } from "../../extensions/api";
import {
  loadMarkdown,
  resolveResourcePath,
  inferResourceName,
} from "../loader";
import type { WorkspacePaths } from "../env/path";
import { formatResourceOutput } from "../context/resource-formatter";

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

  const baseDir = dirname(resolved);
  const phase: Phase = {
    id: inferResourceName(resolved, PHASE_MARKER),
    name: frontmatter.name ?? inferResourceName(resolved, PHASE_MARKER),
    description: frontmatter.description ?? "",
    tools: frontmatter.tools,
    skills: frontmatter.skills,
    target: frontmatter.target,
    input: frontmatter.input,
    filePath: resolved,
    baseDir,
    content: body,
  };

  // Try to load execution code
  const codePath = await discoverPhaseCode(baseDir);
  if (codePath) {
    const code = await loadPhaseCode(codePath);
    if (code.factory) {
      phase.factory = code.factory;
    } else if (code.run) {
      phase.run = code.run;
    }
  }

  return phase;
}

/** Format phase content for LLM consumption using unified XML format. */
export function readPhaseContent(phase: Phase): string {
  return formatResourceOutput({
    type: "phase", name: phase.name, location: phase.filePath,
    content: phase.content, baseDir: phase.baseDir,
  });
}

/**
 * Load all phases from .rowan/phases directory.
 *
 * Scans for subdirectories containing PHASE.md files.
 * Returns PhaseRegistry with entryPhaseId:
 * - null by default (caller must explicitly set to start from a specific phase)
 * - Set to a specific phase id to start from that phase
 *
 * When entryPhaseId is null, AgentLoop starts from "none" phase.
 */
export async function loadPhases(
  workspace?: WorkspacePaths,
  paths?: string[],
): Promise<PhaseRegistry> {
  const phases = new Map<string, Phase>();

  if (paths && paths.length > 0) {
    // Load from explicit paths
    for (const path of paths) {
      const phase = await loadPhase(path, workspace);
      phases.set(phase.id, phase);
    }
    return { phases, entryPhaseId: null };
  }

  // Auto-discover from .rowan/phases directory
  const ws = workspace ?? (await import("../env/path")).resolveWorkspacePaths();
  const phasesDir = join(ws.rowanDir, PHASE_DIR);

  if (!existsSync(phasesDir)) {
    return { phases, entryPhaseId: null };
  }

  const entries = await readdir(phasesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const phaseFile = join(phasesDir, entry.name, PHASE_MARKER);
    if (!existsSync(phaseFile)) continue;

    try {
      const phase = await loadPhase(entry.name, ws);
      phases.set(phase.id, phase);
    } catch (error) {
      console.warn(`Failed to load phase "${entry.name}":`, error);
    }
  }

  return { phases, entryPhaseId: null };
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
 * Supports two patterns:
 * - factory: export default function(api: ExtensionAPI) { ... }
 * - run: export async function run(context, execution) { ... }
 */
async function loadPhaseCode(
  codePath: string,
): Promise<{ factory?: (api: ExtensionAPI) => Promise<void>; run?: (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void> }> {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
  });

  const mod = await jiti.import(codePath, { default: true }) as unknown;

  // Pattern 1: export default function(api) { ... }
  // jiti with { default: true } may return the function directly
  const fn = typeof mod === "function" ? mod : (mod as any)?.default;
  if (typeof fn === "function") {
    return { factory: fn as (api: ExtensionAPI) => Promise<void> };
  }

  // Pattern 2: export async function run(context, execution) { ... }
  if (typeof (mod as any)?.run === "function") {
    return { run: (mod as any).run as (context: PhaseContext, execution: PhaseExecution) => Promise<PhaseOutput | void> };
  }

  throw new Error(`Phase code at "${codePath}" must export a default function or a run() function.`);
}


/**
 * Re-read all file-based phases from disk and rebuild the registry.
 * Extension-registered phases (with empty filePath) are preserved as-is.
 */
export async function reloadPhases(
  registry: PhaseRegistry,
  workspace?: WorkspacePaths,
): Promise<PhaseRegistry> {
  const reloaded = new Map<string, Phase>();

  for (const [id, phase] of registry.phases) {
    // Skip extension-registered phases (no file path)
    if (!phase.filePath) {
      reloaded.set(id, phase);
      continue;
    }

    try {
      const fresh = await loadPhase(phase.filePath, workspace);
      reloaded.set(id, fresh);
    } catch (error) {
      // Keep stale version on error
      console.warn(`Failed to reload phase "${id}":`, error);
      reloaded.set(id, phase);
    }
  }

  return { phases: reloaded, entryPhaseId: registry.entryPhaseId };
}

