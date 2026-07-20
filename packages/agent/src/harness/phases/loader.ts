import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Phase, PhaseFrontmatter, PhaseRegistry } from "./types";
import type { PhaseOutput } from "./types";
import type { PhaseContext } from "./types";
import type { PhaseExecution } from "../../loop/execution";
import type { ExtensionAPI } from "../../extensions/api";
import {
  FrontmatterParseError,
  loadMarkdown,
  inferResourceName,
} from "../loader";
import { parseModelRef } from "@rowan-agent/models";
import { formatResourceOutput } from "../context/resource-formatter";
import {
  ResourceMetadataError,
  validateDescription,
  validatePhaseTarget,
  validateResourceId,
  validateResourceName,
  validateSkillReferences,
  warnResourceDiagnostics,
} from "../resource-validation";

const PHASE_MARKER = "PHASE.md";

function resolvePhasePath(input: string): string {
  const resolved = resolve(input);
  return existsSync(resolved) && statSync(resolved).isDirectory()
    ? join(resolved, PHASE_MARKER)
    : resolved;
}

/**
 * Load a single phase from a PHASE.md file or phase directory.
 *
 * If a directory is provided, the loader reads its PHASE.md.
 */
export async function loadPhase(targetPath: string): Promise<Phase> {
  const resolved = resolvePhasePath(targetPath);
  let loaded: Awaited<ReturnType<typeof loadMarkdown<PhaseFrontmatter>>>;
  try {
    loaded = await loadMarkdown<PhaseFrontmatter>(resolved);
  } catch (error) {
    if (!(error instanceof FrontmatterParseError)) throw error;
    warnResourceDiagnostics("phase", resolved, [`frontmatter could not be parsed: ${error.message}`]);
    throw new ResourceMetadataError("parse_failed", error.message);
  }

  const directoryName = inferResourceName(resolved, PHASE_MARKER);
  const { frontmatter, body } = loaded;
  const metadata = frontmatter as Record<string, unknown>;
  const frontmatterName = typeof metadata.name === "string" ? metadata.name : undefined;
  const name = frontmatterName || directoryName;
  const description = validateDescription(metadata.description);
  const diagnostics = validateResourceId(directoryName);
  if (frontmatterName && frontmatterName !== directoryName) {
    diagnostics.push(...validateResourceName(frontmatterName, directoryName));
  }
  diagnostics.push(...description.warnings);
  diagnostics.push(...validateSkillReferences(metadata.skills));
  diagnostics.push(...validatePhaseTarget(metadata.target));
  warnResourceDiagnostics("phase", resolved, diagnostics);

  if (description.missing) {
    throw new ResourceMetadataError("invalid_metadata", "description is required");
  }

  const baseDir = dirname(resolved);
  const phase: Phase = {
    name,
    description: description.description!,
    tools: metadata.tools as string[] | undefined,
    skills: metadata.skills as string[] | undefined,
    target: metadata.target as string | undefined,
    input: metadata.input as Record<string, string> | undefined,
    isolated: metadata.isolated as boolean | undefined,
    filePath: resolved,
    baseDir,
    content: body,
    model: parseModelRef(metadata.model as string | undefined),
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
 * Load all phases from the target directory.
 *
 * Scans for subdirectories containing PHASE.md files.
 * Returns PhaseRegistry with entryPhaseId:
 * - null by default (caller must explicitly set to start from a specific phase)
 * - Set to a specific phase name to start from that phase
 *
 * When entryPhaseId is null, Agent normalizes the registry to start from its default phase.
 */
export async function loadPhases(targetPath: string): Promise<PhaseRegistry> {
  const phases = new Map<string, Phase>();
  const phasesDir = resolve(targetPath);

  if (existsSync(phasesDir) && statSync(phasesDir).isFile()) {
    try {
      const phase = await loadPhase(phasesDir);
      phases.set(phase.name, phase);
    } catch (error) {
      if (!(error instanceof ResourceMetadataError)) throw error;
    }
    return { phases, entryPhaseId: null };
  }

  if (existsSync(join(phasesDir, PHASE_MARKER))) {
    try {
      const phase = await loadPhase(phasesDir);
      phases.set(phase.name, phase);
    } catch (error) {
      if (!(error instanceof ResourceMetadataError)) throw error;
    }
    return { phases, entryPhaseId: null };
  }

  const entries = await readdir(phasesDir, { withFileTypes: true });

  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;

    const phaseFile = join(phasesDir, entry.name, PHASE_MARKER);
    if (!existsSync(phaseFile)) continue;

    try {
      const phase = await loadPhase(phaseFile);
      phases.set(phase.name, phase);
    } catch (error) {
      if (error instanceof ResourceMetadataError) continue;
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
    fsCache: false,
    moduleCache: false,
    tryNative: false,
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
 * Re-read all file-based phases from disk and update the registry in place.
 * Extension-registered phases (with empty filePath) are preserved as-is.
 */
export async function reloadPhases(
  registry: PhaseRegistry,
): Promise<void> {
  for (const [name, phase] of registry.phases) {
    // Skip extension-registered phases (no file path)
    if (!phase.filePath) {
      continue;
    }

    try {
      const fresh = await loadPhase(phase.filePath);
      registry.phases.delete(name);
      registry.phases.set(fresh.name, fresh);
    } catch (error) {
      // Keep stale version on error
      console.warn(`Failed to reload phase "${name}":`, error);
    }
  }
}
