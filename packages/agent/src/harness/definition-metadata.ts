import type { JsonValue } from "../runtime-events";
import { isJsonValue } from "../runtime/json";

export type DefinitionMetadataKind = "agent-definition" | "phase";

export type DefinitionMetadataProblem =
  | Readonly<{ code: "metadata_not_mapping"; message: string }>
  | Readonly<{ code: "duplicate_key"; key: string; message: string }>
  | Readonly<{ code: "known_key_in_metadata"; key: string; message: string }>
  | Readonly<{ code: "non_json_value"; key: string; message: string }>;

export type DefinitionMetadataResult = Readonly<{
  /** Fields owned by the selected Rowan definition vocabulary. */
  fields: Readonly<Record<string, unknown>>;
  /** Unrecognized JSON-safe values, flattened from `metadata:` when present. */
  metadata?: Readonly<Record<string, JsonValue>>;
  /** Authoring problems; `non_json_value` is a lossy-warning problem. */
  problems: readonly DefinitionMetadataProblem[];
}>;

const AGENT_DEFINITION_KEYS = new Set([
  "name",
  "description",
  "tools",
  "skills",
  "phases",
  "contexts",
  "model",
]);

const PHASE_KEYS = new Set([
  "name",
  "description",
  "target",
  "input",
  "prompt-guidelines",
  "tools",
  "model",
  "isolated",
  "disable-auto-invocation",
  "disable-implicit-invocation",
]);

/**
 * Apply Rowan's definition metadata rule to parsed frontmatter.
 *
 * Rowan-owned keys remain in `fields`. Every other JSON-safe value becomes
 * flat `metadata`, including values from an explicit `metadata:` mapping.
 */
export function normalizeDefinitionMetadata(
  kind: DefinitionMetadataKind,
  frontmatter: Readonly<Record<string, unknown>>,
): DefinitionMetadataResult {
  const knownKeys = kind === "phase" ? PHASE_KEYS : AGENT_DEFINITION_KEYS;
  const fields: Record<string, unknown> = {};
  const metadata: Record<string, JsonValue> = {};
  const problems: DefinitionMetadataProblem[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === "metadata") continue;
    if (knownKeys.has(key)) {
      fields[key] = value;
      continue;
    }
    addMetadataValue(metadata, key, value, `metadata key "${key}"`, problems);
  }

  const explicitMetadata = frontmatter.metadata;
  if (explicitMetadata === undefined) {
    return result(fields, metadata, problems);
  }
  if (!isRecord(explicitMetadata)) {
    problems.push({
      code: "metadata_not_mapping",
      message: "metadata must be a mapping",
    });
    return result(fields, metadata, problems);
  }

  for (const [key, value] of Object.entries(explicitMetadata)) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      problems.push({
        code: "duplicate_key",
        key,
        message: `key "${key}" is given both at the top level and in metadata`,
      });
      continue;
    }
    if (knownKeys.has(key)) {
      problems.push({
        code: "known_key_in_metadata",
        key,
        message: `metadata key "${key}" is a known field and cannot appear inside metadata`,
      });
      continue;
    }
    addMetadataValue(metadata, key, value, `metadata.${key}`, problems);
  }

  return result(fields, metadata, problems);
}

function addMetadataValue(
  metadata: Record<string, JsonValue>,
  key: string,
  value: unknown,
  path: string,
  problems: DefinitionMetadataProblem[],
): void {
  if (isJsonValue(value)) {
    metadata[key] = value;
    return;
  }
  problems.push({
    code: "non_json_value",
    key,
    message: `${path} must be a JSON-safe value`,
  });
}

function result(
  fields: Record<string, unknown>,
  metadata: Record<string, JsonValue>,
  problems: DefinitionMetadataProblem[],
): DefinitionMetadataResult {
  return Object.freeze({
    fields: Object.freeze(fields),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata: Object.freeze(metadata) }),
    problems: Object.freeze(problems),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
