/**
 * Extension loader — discovers and loads extensions from the filesystem.
 *
 * Uses the new LoadedExtension type that works with ExtensionRunner.
 */

import { existsSync, readFileSync, type Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { createJiti } from "jiti";
import type { ExtensionFactory } from "./api";
import type { ExtensionManifest, LoadedExtension, ExtensionPackageManifest } from "./types";

function isExtensionFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return extension === ".ts" || extension === ".js";
}

function isSyntheticPath(path: string): boolean {
  return path.startsWith("<") && path.endsWith(">");
}

/**
 * Read extension manifest from package.json (sync).
 */
function readManifestSync(dir: string): ExtensionManifest | undefined {
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  try {
    const content = readFileSync(manifestPath, "utf8");
    const pkg = JSON.parse(content) as ExtensionPackageManifest;
    const rowan = pkg.rowan;
    if (!rowan) return undefined;
    return {
      entry: rowan.extensions?.[0],
      phase: rowan.phase,
    };
  } catch {
    return undefined;
  }
}

function jitiAliases(): Record<string, string> {
  const moduleUrl = import.meta.url;
  if (!moduleUrl) {
    return {};
  }
  const agentSourcePath = fileURLToPath(new URL("../index.ts", moduleUrl));
  if (!existsSync(agentSourcePath)) {
    return {};
  }
  return { "@rowan-agent/agent": agentSourcePath };
}

/** Shared jiti instance — created once, reused across all extension loads. */
let sharedJiti: ReturnType<typeof createJiti> | undefined;

function getJiti(): ReturnType<typeof createJiti> {
  sharedJiti ??= createJiti(import.meta.url || process.cwd(), {
    moduleCache: false,
    alias: jitiAliases(),
  });
  return sharedJiti;
}

async function loadExtensionModule(extensionPath: string): Promise<ExtensionFactory | undefined> {
  const jiti = getJiti();
  const module = await jiti.import(extensionPath, { default: true });
  return typeof module === "function" ? (module as ExtensionFactory) : undefined;
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
      const info = entry.isSymbolicLink()
        ? await stat(entryPath).catch(() => undefined)
        : undefined;
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

/**
 * Load a single extension from a factory function.
 */
export function loadExtensionFromFactory(
  factory: ExtensionFactory,
  cwd: string,
  extensionPath = "<inline>",
): LoadedExtension {
  const resolvedCwd = resolve(cwd);
  const resolvedPath = isSyntheticPath(extensionPath)
    ? extensionPath
    : resolve(resolvedCwd, extensionPath);

  // Extract name from path
  const name = isSyntheticPath(extensionPath)
    ? extensionPath
    : dirname(resolvedPath).split("/").pop() ?? "unknown";

  // Read manifest from package.json in extension directory
  const manifestDir = isSyntheticPath(extensionPath) ? resolvedCwd : dirname(resolvedPath);
  const manifest = readManifestSync(manifestDir);

  return {
    path: resolvedPath,
    name,
    factory,
    manifest,
  };
}

/**
 * Load extensions from file paths.
 */
export async function loadExtensions(
  paths: string[],
  cwd: string,
): Promise<{ extensions: LoadedExtension[]; errors: Array<{ path: string; error: string }> }> {
  const extensions: LoadedExtension[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const resolvedCwd = resolve(cwd);

  for (const path of paths) {
    const resolvedPath = resolve(resolvedCwd, path);
    try {
      const factory = await loadExtensionModule(resolvedPath);
      if (!factory) {
        errors.push({
          path: resolvedPath,
          error: `Extension does not export a valid factory function: ${path}`,
        });
        continue;
      }
      extensions.push(loadExtensionFromFactory(factory, resolvedCwd, resolvedPath));
    } catch (error) {
      errors.push({
        path: resolvedPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { extensions, errors };
}

/**
 * Load extensions from the exact target path.
 *
 * If the target is a directory with its own extension entry, load that extension.
 * Otherwise, scan its immediate children for extension packages/files.
 */
export async function loadExtensionsFromPath(
  path: string,
): Promise<{ extensions: LoadedExtension[]; errors: Array<{ path: string; error: string }> }> {
  const resolvedPath = resolve(path);
  const info = await stat(resolvedPath);

  if (!info.isDirectory()) {
    return loadExtensions([resolvedPath], dirname(resolvedPath));
  }

  const entries = await resolveExtensionEntries(resolvedPath) ?? await discoverExtensionsInDir(resolvedPath);
  return loadExtensions(entries, resolvedPath);
}
