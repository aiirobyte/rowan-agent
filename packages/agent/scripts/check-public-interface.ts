import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertBrowserSafeEntry } from "./browser-safe-entry";
import {
  authorTypeExports,
  authorValueExports,
  runtimeTypeExports,
  runtimeValueExports,
} from "./public-interface";

async function declarationsFor(file: string): Promise<string[]> {
  const declaration = await readFile(new URL(file, import.meta.url), "utf8");
  const blocks = [...declaration.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*[^;]+)?;/g)];
  if (blocks.length === 0) throw new Error(`${file} has no export block`);
  return blocks.flatMap((block) => block[1]!
    .split(",")
    .map((entry) => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)!)
    .filter(Boolean));
}

function assertExact(label: string, actual: string[], expected: readonly string[]) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`${label} drifted. Expected ${expectedSorted.join(", ")}; got ${actualSorted.join(", ")}`);
  }
}

const authorExports = await declarationsFor("../dist/index.d.ts");
const runtimeExports = await declarationsFor("../dist/runtime.d.ts");

assertExact("authoring declaration exports", authorExports, [...authorValueExports, ...authorTypeExports]);
assertExact("runtime declaration exports", runtimeExports, [...runtimeValueExports, ...runtimeTypeExports]);
assertExact("duplicate entry-point exports", authorExports.filter((name) => runtimeExports.includes(name)), []);
await assertBrowserSafeEntry(fileURLToPath(new URL("../dist/index.js", import.meta.url)));

console.log(
  `Public interfaces verified: authoring ${authorValueExports.length} values / ${authorTypeExports.length} types (browser-safe), runtime ${runtimeValueExports.length} values / ${runtimeTypeExports.length} types. Zero overlap.`,
);
