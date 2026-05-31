import { resolve } from "node:path";
import type { PhaseRegistry } from "../loop/phases/registry";
import { DEFAULT_PHASE_ID } from "../loop/phases/registry";
import { builtinPhases } from "../loop/phases/built-in";
import { discoverAndLoadExtensions, loadExtensionFromFactorySync } from "./loader";
import { ExtensionRunner, createExtensionRuntime } from "./runner";
import type { Extension, ExtensionRuntime } from "./types";

const BUILTIN_PHASE_IDS = new Set(["chat", "plan", "execute", "verify"]);

const builtinExtensionPaths = ["<builtin:phase:chat>", "<builtin:phase:plan>", "<builtin:phase:execute>", "<builtin:phase:verify>"];

/** Check if a path is a built-in extension source (synthetic path). */
export function isBuiltinSource(path: string): boolean {
  return path.startsWith("<builtin:");
}

/** Check if an external extension is attempting to override a built-in phase. */
export function isBuiltinPhaseOverride(phaseId: string, extensionPath: string): boolean {
  return BUILTIN_PHASE_IDS.has(phaseId) && !isBuiltinSource(extensionPath);
}

// Shared runtime for built-in extensions
const builtinRuntime = createExtensionRuntime();

const builtinExtensions = builtinPhases.map((factory, index) =>
  loadExtensionFromFactorySync(factory, builtinRuntime, process.cwd(), builtinExtensionPaths[index] ?? "<builtin:phase:unknown>")
);

const builtinRunner = new ExtensionRunner(builtinExtensions, {
  validatePhaseOverride: isBuiltinPhaseOverride,
});

export type CreateDefaultPhaseRegistryOptions = {
  cwd?: string;
  entryPhaseId?: string;
  runtime?: ExtensionRuntime;
};

export function getBuiltinExtensions(): Extension[] {
  return [...builtinExtensions];
}

export function getBuiltinRuntime(): ExtensionRuntime {
  return builtinRuntime;
}

export function createBuiltinPhaseRegistry(input: { entryPhaseId?: string } = {}): PhaseRegistry {
  return builtinRunner.createPhaseRegistry({ entryPhaseId: input.entryPhaseId ?? DEFAULT_PHASE_ID });
}

export async function createDefaultPhaseRegistry(
  options: CreateDefaultPhaseRegistryOptions = {},
): Promise<PhaseRegistry> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const runtime = options.runtime ?? createExtensionRuntime();
  const result = await discoverAndLoadExtensions(runtime, cwd);

  if (result.errors.length > 0) {
    const details = result.errors.map((error) => `${error.path}: ${error.error}`).join("; ");
    throw new Error(`Failed to load Rowan extensions: ${details}`);
  }

  const runner = new ExtensionRunner([
    ...getBuiltinExtensions(),
    ...result.extensions,
  ], {
    validatePhaseOverride: isBuiltinPhaseOverride,
  });
  return runner.createPhaseRegistry({ entryPhaseId: options.entryPhaseId ?? DEFAULT_PHASE_ID });
}
