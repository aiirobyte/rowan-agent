import { existsSync, type Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { createJiti } from "jiti";
import type {
  Extension,
  ExtensionFactory,
  ExtensionHandler,
  ExtensionPackageManifest,
  ExtensionRuntime,
  LoadExtensionsResult,
  RegisteredPhase,
} from "./types";
import { createExtensionAPI } from "./runner";

const ROWAN_DIR = ".rowan";
const EXTENSIONS_DIR = "extensions";

function isExtensionFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return extension === ".ts" || extension === ".js";
}

function isSyntheticPath(path: string): boolean {
  return path.startsWith("<") && path.endsWith(">");
}

function createExtension(extensionPath: string, resolvedPath: string): Extension {
  return {
    path: extensionPath,
    resolvedPath,
    phases: new Map<string, RegisteredPhase>(),
    eventHandlers: new Map<string, ExtensionHandler[]>(),
  };
}

function jitiAliases(): Record<string, string> {
  return {
    "@rowan-agent/agent": fileURLToPath(new URL("../index.ts", import.meta.url)),
  };
}

async function loadExtensionModule(extensionPath: string): Promise<ExtensionFactory | undefined> {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: jitiAliases(),
  });
  const module = await jiti.import(extensionPath, { default: true });
  return typeof module === "function" ? module as ExtensionFactory : undefined;
}

async function readPackageManifest(path: string): Promise<ExtensionPackageManifest | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as ExtensionPackageManifest;
}

async function resolveExtensionEntries(dir: string): Promise<string[] | undefined> {
  const manifest = await readPackageManifest(join(dir, "package.json"));
  const declared = manifest?.rowan?.extensions;
  if (declared && declared.length > 0) {
    return declared.map((entry) => resolve(dir, entry));
  }

  for (const name of ["index.ts", "index.js"]) {
    const entry = join(dir, name);
    if (existsSync(entry)) {
      return [entry];
    }
  }

  return undefined;
}

async function discoverExtensionsInDir(dir: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(dir, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const paths: string[] = [];

  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = join(dir, entry.name);
    if ((entry.isFile() || entry.isSymbolicLink()) && isExtensionFile(entry.name)) {
      paths.push(entryPath);
      continue;
    }

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const info = entry.isSymbolicLink() ? await stat(entryPath).catch(() => undefined) : undefined;
      if (entry.isDirectory() || info?.isDirectory()) {
        const resolvedEntries = await resolveExtensionEntries(entryPath);
        if (resolvedEntries) {
          paths.push(...resolvedEntries);
        }
      }
    }
  }

  return paths;
}

function createExtensionFromFactory(
  factory: ExtensionFactory,
  runtime: ExtensionRuntime,
  cwd: string,
  extensionPath = "<inline>",
): { extension: Extension; result: void | Promise<void> } {
  const resolvedCwd = resolve(cwd);
  const resolvedPath = isSyntheticPath(extensionPath) ? extensionPath : resolve(resolvedCwd, extensionPath);
  const extension = createExtension(extensionPath, resolvedPath);
  const rowan = createExtensionAPI(extension, runtime);
  const result = factory(rowan);
  return { extension, result };
}

export function loadExtensionFromFactorySync(
  factory: ExtensionFactory,
  runtime: ExtensionRuntime,
  cwd: string,
  extensionPath = "<inline>",
): Extension {
  const { extension, result } = createExtensionFromFactory(factory, runtime, cwd, extensionPath);
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error("loadExtensionFromFactorySync does not support async factories.");
  }
  return extension;
}

export async function loadExtensionFromFactory(
  factory: ExtensionFactory,
  runtime: ExtensionRuntime,
  cwd: string,
  extensionPath = "<inline>",
): Promise<Extension> {
  const { extension, result } = createExtensionFromFactory(factory, runtime, cwd, extensionPath);
  await result;
  return extension;
}

export async function loadExtensions(
  paths: string[],
  runtime: ExtensionRuntime,
  cwd: string,
): Promise<LoadExtensionsResult> {
  const extensions: Extension[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const resolvedCwd = resolve(cwd);

  for (const path of paths) {
    const resolvedPath = resolve(resolvedCwd, path);
    try {
      const factory = await loadExtensionModule(resolvedPath);
      if (!factory) {
        errors.push({ path: resolvedPath, error: `Extension does not export a valid factory function: ${path}` });
        continue;
      }
      extensions.push(await loadExtensionFromFactory(factory, runtime, resolvedCwd, resolvedPath));
    } catch (error) {
      errors.push({
        path: resolvedPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { extensions, errors };
}

export async function discoverAndLoadExtensions(
  runtime: ExtensionRuntime,
  cwd: string,
): Promise<LoadExtensionsResult> {
  const extensionsDir = join(resolve(cwd), ROWAN_DIR, EXTENSIONS_DIR);
  const paths = await discoverExtensionsInDir(extensionsDir);
  return loadExtensions(paths, runtime, cwd);
}
