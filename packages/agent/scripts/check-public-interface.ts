import { readFile } from "node:fs/promises";
import { publicTypeExports, publicValueExports } from "./public-interface";

const declarationFile = new URL("../dist/index.d.ts", import.meta.url);
const declaration = await readFile(declarationFile, "utf8");
const blocks = [...declaration.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*[^;]+)?;/g)];
if (blocks.length === 0) throw new Error("Built declaration has no export block");

const declarations = blocks.flatMap((block) => block[1]!
  .split(",")
  .map((entry) => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)!)
  .filter(Boolean));

function assertExact(label: string, actual: string[], expected: readonly string[]) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`${label} drifted. Expected ${expectedSorted.join(", ")}; got ${actualSorted.join(", ")}`);
  }
}

assertExact(
  "public declaration exports",
  declarations,
  [...publicValueExports, ...publicTypeExports],
);
console.log(
  `Public interface verified: ${publicValueExports.length} runtime values, ${publicTypeExports.length} types`,
);
