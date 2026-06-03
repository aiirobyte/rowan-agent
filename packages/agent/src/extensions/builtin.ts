import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PhaseRegistry } from "../loop/phases/registry";
import { DEFAULT_PHASE_ID } from "../loop/phases/registry";
import { builtinPhases } from "../loop/phases/built-in";
import { discoverAndLoadExtensions, loadExtensionFromFactorySync } from "./loader";
import { ExtensionRunner, createExtensionRuntime } from "./runner";
import type { Extension, ExtensionRuntime } from "./types";

const BUILTIN_PHASE_IDS = new Set(["chat", "plan", "execute", "verify"]);

const __dirname = dirname(fileURLToPath(import.meta.url));

const builtinPhaseDirs = [
  resolve(__dirname, "../loop/phases/built-in/chat"),
  resolve(__dirname, "../loop/phases/built-in/plan"),
  resolve(__dirname, "../loop/phases/built-in/execute"),
  resolve(__dirname, "../loop/phases/built-in/verify"),
];

const builtinExtensionPaths = builtinPhaseDirs.map((_, i) => `<builtin:phase:${["chat", "plan", "execute", "verify"][i]}>`);

/** Check if a path is a built-in extension source (synthetic path). */
export function isBuiltinSource(path: string): boolean {
  return path.startsWith("<builtin:");
}

/** Check if an external extension is attempting to override a built-in phase. */
export function isBuiltinPhaseOverride(phaseId: string, extensionPath: string): boolean {
  return BUILTIN_PHASE_IDS.has(phaseId) && !isBuiltinSource(extensionPath);
}

// ---------------------------------------------------------------------------
// Lazy built-in initialization — deferred until first access
// ---------------------------------------------------------------------------

let _builtinState: { runtime: ExtensionRuntime; extensions: Extension[]; runner: ExtensionRunner } | undefined;

function ensureBuiltin(): NonNullable<typeof _builtinState> {
  if (!_builtinState) {
    const runtime = createExtensionRuntime();
    const extensions = builtinPhases.map((factory, index) =>
      loadExtensionFromFactorySync(factory, runtime, builtinPhaseDirs[index]!, builtinExtensionPaths[index] ?? "<builtin:phase:unknown>")
    );
    const runner = new ExtensionRunner(extensions, {
      validatePhaseOverride: isBuiltinPhaseOverride,
    });
    runtime.bind();
    _builtinState = { runtime, extensions, runner };
  }
  return _builtinState;
}

export type CreateDefaultPhaseRegistryOptions = {
  cwd?: string;
  entryPhaseId?: string;
  runtime?: ExtensionRuntime;
};

export function getBuiltinExtensions(): Extension[] {
  return [...ensureBuiltin().extensions];
}

export function getBuiltinRuntime(): ExtensionRuntime {
  return ensureBuiltin().runtime;
}

export function createBuiltinPhaseRegistry(input: { entryPhaseId?: string } = {}): PhaseRegistry {
  return ensureBuiltin().runner.createPhaseRegistry({ entryPhaseId: input.entryPhaseId ?? DEFAULT_PHASE_ID });
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

  runtime.bind();

  const runner = new ExtensionRunner([
    ...getBuiltinExtensions(),
    ...result.extensions,
  ], {
    validatePhaseOverride: isBuiltinPhaseOverride,
  });
  return runner.createPhaseRegistry({ entryPhaseId: options.entryPhaseId ?? DEFAULT_PHASE_ID });
}
