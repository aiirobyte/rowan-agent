import { readFile } from "node:fs/promises";
import {
  modelsTypeExports,
  modelsValueExports,
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

const exports = await declarationsFor("../dist/index.d.ts");

assertExact("models declaration exports", exports, [...modelsValueExports, ...modelsTypeExports]);

console.log(
  `Public interfaces verified: @rowan-agent/models ${modelsValueExports.length} values / ${modelsTypeExports.length} types.`,
);
