import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Model, Protocol } from "../src/protocol";

export const SUPPORTED_PROTOCOLS: readonly Protocol[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;

export interface ManifestData {
  schemaVersion: number;
  generatedAt: string;
  structureHash?: string;
  files: Record<string, string>;
}

export interface PiModelRaw {
  id?: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  provider?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    tiers?: Array<{
      inputTokensAbove: number;
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
    }>;
  };
  contextWindow?: number;
  maxTokens?: number;
  type?: string;
  [key: string]: unknown;
}

/**
 * Pure transformation of raw pi provider file payloads into Rowan's Model catalog.
 * Drops non-chat entries, unsupported APIs, and sorts deterministically.
 */
export function transformPiCatalog(
  files: Record<string, unknown>,
): Record<string, Record<string, Model>> {
  const catalog: Record<string, Record<string, Model>> = {};

  // Sort files deterministically
  const fileKeys = Object.keys(files).sort();

  for (const filename of fileKeys) {
    const defaultProvider = filename.replace(/\.json$/, "");
    const fileContent = files[filename];
    if (typeof fileContent !== "object" || fileContent === null) continue;

    for (const [api, entries] of Object.entries(fileContent as Record<string, unknown>)) {
      if (!SUPPORTED_PROTOCOLS.includes(api as Protocol)) {
        continue;
      }
      if (typeof entries !== "object" || entries === null) continue;

      for (const entry of Object.values(entries as Record<string, unknown>)) {
        const raw = entry as PiModelRaw;
        if (raw.type !== "chat") continue;
        if (!raw.id) continue;

        const provider = raw.provider ?? defaultProvider;
        const protocol = api as Protocol;

        const tiers = raw.cost?.tiers
          ? raw.cost.tiers.map((t) => ({
            inputTokensAbove: t.inputTokensAbove,
            input: t.input,
            output: t.output,
            cacheRead: t.cacheRead ?? 0,
            cacheWrite: t.cacheWrite ?? 0,
          })).sort((a, b) => a.inputTokensAbove - b.inputTokensAbove)
          : undefined;

        const model: Model = {
          id: raw.id,
          name: raw.name ?? raw.id,
          protocol,
          provider,
          baseUrl: raw.baseUrl ?? "",
          reasoning: Boolean(raw.reasoning),
          input: raw.input ?? ["text"],
          cost: {
            input: raw.cost?.input ?? 0,
            output: raw.cost?.output ?? 0,
            cacheRead: raw.cost?.cacheRead ?? 0,
            cacheWrite: raw.cost?.cacheWrite ?? 0,
            ...(tiers && tiers.length > 0 ? { tiers } : {}),
          },
          contextWindow: raw.contextWindow ?? 128_000,
          maxTokens: raw.maxTokens ?? 4096,
        };

        if (!catalog[provider]) {
          catalog[provider] = {};
        }
        catalog[provider][model.id] = model;
      }
    }
  }

  // Sort providers and models deterministically
  const sortedCatalog: Record<string, Record<string, Model>> = {};
  for (const provider of Object.keys(catalog).sort()) {
    const models = catalog[provider];
    sortedCatalog[provider] = {};
    for (const modelId of Object.keys(models).sort()) {
      sortedCatalog[provider][modelId] = models[modelId];
    }
  }

  return sortedCatalog;
}

/**
 * Render the TypeScript module string for models.generated.ts.
 */
export function renderCatalogModule(
  catalog: Record<string, Record<string, Model>>,
  meta: { version: string; schemaVersion: number; generatedAt: string },
): string {
  const jsonContent = JSON.stringify(catalog, null, 2);
  return `/**
 * Static model catalog imported from @earendil-works/pi-ai@${meta.version}.
 * Manifest schemaVersion: ${meta.schemaVersion}, generatedAt: ${meta.generatedAt}.
 * Run \`bun run import-pi-catalog\` to regenerate.
 */
import type { Model } from "./protocol";

export const MODELS: Record<string, Record<string, Model>> = ${jsonContent};
`;
}

/**
 * Fetch and build the pi-ai catalog from jsDelivr.
 */
export async function fetchPiCatalog(options: { version?: string } = {}): Promise<{
  catalog: Record<string, Record<string, Model>>;
  meta: { version: string; schemaVersion: number; generatedAt: string };
}> {
  let version = options.version;
  if (!version) {
    const metaRes = await fetch("https://data.jsdelivr.com/v1/package/npm/@earendil-works/pi-ai");
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch pi-ai version metadata from jsDelivr: HTTP ${metaRes.status}`);
    }
    const metaJson = (await metaRes.json()) as { tags?: { latest?: string } };
    version = metaJson.tags?.latest;
    if (!version) {
      throw new Error("Could not resolve latest version tag for @earendil-works/pi-ai from jsDelivr");
    }
  }

  const manifestUrl = `https://cdn.jsdelivr.net/npm/@earendil-works/pi-ai@${version}/dist/providers/data/.manifest.json`;
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch manifest at ${manifestUrl}: HTTP ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as ManifestData;

  if (manifest.schemaVersion !== 6) {
    throw new Error(`Unknown schemaVersion: ${manifest.schemaVersion} (expected 6)`);
  }

  const files: Record<string, unknown> = {};
  for (const [filename, expectedSha] of Object.entries(manifest.files)) {
    const fileUrl = `https://cdn.jsdelivr.net/npm/@earendil-works/pi-ai@${version}/dist/providers/data/${filename}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch provider file ${fileUrl}: HTTP ${res.status}`);
    }
    const text = await res.text();
    const sha = createHash("sha256").update(text).digest("hex");
    if (sha !== expectedSha) {
      throw new Error(`SHA256 mismatch for ${filename}: expected ${expectedSha}, got ${sha}`);
    }
    try {
      files[filename] = JSON.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse JSON in ${filename}: ${(err as Error).message}`);
    }
  }

  const catalog = transformPiCatalog(files);
  return {
    catalog,
    meta: {
      version,
      schemaVersion: manifest.schemaVersion,
      generatedAt: manifest.generatedAt,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let versionArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && i + 1 < args.length) {
      versionArg = args[i + 1];
    }
  }

  console.log(`Fetching pi catalog data (version: ${versionArg ?? "latest"})...`);
  const { catalog, meta } = await fetchPiCatalog({ version: versionArg });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const targetPath = resolve(__dirname, "../src/models.generated.ts");

  const code = renderCatalogModule(catalog, meta);
  writeFileSync(targetPath, code, "utf8");

  let totalModels = 0;
  for (const models of Object.values(catalog)) {
    totalModels += Object.keys(models).length;
  }
  const totalProviders = Object.keys(catalog).length;

  console.log(
    `Successfully generated ${targetPath} (@earendil-works/pi-ai@${meta.version}): ` +
    `${totalProviders} providers, ${totalModels} models.`,
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Catalog generation failed:", err);
    process.exit(1);
  });
}
