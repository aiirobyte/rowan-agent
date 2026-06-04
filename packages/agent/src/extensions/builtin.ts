import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PhaseRegistry } from "../loop/phases/registry";
import { DEFAULT_PHASE_ID } from "../loop/phases/registry";
import { builtinPhases } from "../loop/phases/built-in";
import { discoverAndLoadExtensions, loadExtensionFromFactory } from "./loader";
import { ExtensionRunner, createExtensionRunner } from "./runner";
import type { LoadedExtension } from "./types";

const BUILTIN_PHASE_IDS = new Set(["chat", "plan", "execute", "verify"]);

const __dirname = dirname(fileURLToPath(import.meta.url));

const builtinPhaseDirs = [
  resolve(__dirname, "../loop/phases/built-in/chat"),
  resolve(__dirname, "../loop/phases/built-in/plan"),
  resolve(__dirname, "../loop/phases/built-in/execute"),
  resolve(__dirname, "../loop/phases/built-in/verify"),
];

const builtinPhaseNames = ["chat", "plan", "execute", "verify"];

/** Check if a path is a built-in extension source (synthetic path). */
export function isBuiltinSource(path: string): boolean {
  return path.startsWith("<builtin:");
}

/** Check if an external extension is attempting to override a built-in phase. */
export function isBuiltinPhaseOverride(phaseId: string, extensionPath: string): boolean {
  return BUILTIN_PHASE_IDS.has(phaseId) && !isBuiltinSource(extensionPath);
}

// ---------------------------------------------------------------------------
// Lazy built-in initialization
// ---------------------------------------------------------------------------

let _builtinRunner: ExtensionRunner | undefined;
let _builtinExtensions: LoadedExtension[] = [];

async function ensureBuiltin(): Promise<{ runner: ExtensionRunner; extensions: LoadedExtension[] }> {
  if (!_builtinRunner) {
    // Load extensions using loadExtensionFromFactory which reads manifest
    const extensions: LoadedExtension[] = builtinPhases.map((factory, index) =>
      loadExtensionFromFactory(factory, builtinPhaseDirs[index]!, `<builtin:phase:${builtinPhaseNames[index]}>`)
    );

    _builtinRunner = createExtensionRunner({
      validatePhaseOverride: isBuiltinPhaseOverride,
    });

    await _builtinRunner.loadExtensions(extensions);
    _builtinRunner.bind();
    _builtinExtensions = extensions;
  }
  return { runner: _builtinRunner, extensions: _builtinExtensions };
}

export type CreateDefaultPhaseRegistryOptions = {
  cwd?: string;
  entryPhaseId?: string;
};

export async function getBuiltinExtensions(): Promise<LoadedExtension[]> {
  const { extensions } = await ensureBuiltin();
  return [...extensions];
}

export function getBuiltinRunner(): ExtensionRunner {
  if (!_builtinRunner) {
    throw new Error("Builtin runner not initialized. Call getBuiltinExtensions() first.");
  }
  return _builtinRunner;
}

export async function createBuiltinPhaseRegistry(
  input: { entryPhaseId?: string } = {},
): Promise<PhaseRegistry> {
  const { runner } = await ensureBuiltin();
  return runner.createPhaseRegistry({ entryPhaseId: input.entryPhaseId ?? DEFAULT_PHASE_ID });
}

export async function createDefaultPhaseRegistry(
  options: CreateDefaultPhaseRegistryOptions = {},
): Promise<PhaseRegistry> {
  const cwd = resolve(options.cwd ?? process.cwd());

  const runner = createExtensionRunner({
    validatePhaseOverride: isBuiltinPhaseOverride,
  });

  // Load built-in phases with manifest
  const builtinExts: LoadedExtension[] = builtinPhases.map((factory, index) =>
    loadExtensionFromFactory(factory, builtinPhaseDirs[index]!, `<builtin:phase:${builtinPhaseNames[index]}>`)
  );
  await runner.loadExtensions(builtinExts);

  // Load external extensions
  const result = await discoverAndLoadExtensions(cwd);
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => `${error.path}: ${error.error}`).join("; ");
    throw new Error(`Failed to load Rowan extensions: ${details}`);
  }
  await runner.loadExtensions(result.extensions);

  runner.bind();

  return runner.createPhaseRegistry({ entryPhaseId: options.entryPhaseId ?? DEFAULT_PHASE_ID });
}
