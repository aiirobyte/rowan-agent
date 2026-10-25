import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";

const BUILT_INS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const BROWSER_SAFE_PACKAGES = new Set(["@rowan-agent/models"]);
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Verify that a built authoring entry and every relative chunk are browser-safe. */
export async function assertBrowserSafeEntry(entryPath: string): Promise<void> {
  const seen = new Set<string>();
  await visit(resolve(entryPath), seen);
}

async function visit(filePath: string, seen: Set<string>): Promise<void> {
  if (seen.has(filePath)) return;
  seen.add(filePath);
  await stat(filePath);
  const source = await readFile(filePath, "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (specifier.startsWith(".")) {
      await visit(resolve(dirname(filePath), specifier), seen);
      continue;
    }
    if (BUILT_INS.has(specifier)) {
      throw new Error(`${filePath} imports Node built-in "${specifier}"`);
    }
    if (!BROWSER_SAFE_PACKAGES.has(specifier)) {
      throw new Error(`${filePath} imports non-browser-safe package "${specifier}"`);
    }
  }
}

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}
