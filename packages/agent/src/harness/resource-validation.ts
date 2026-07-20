export const MAX_RESOURCE_ID_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;

export type ResourceKind = "skill" | "phase";

/** Error raised after a resource has emitted a metadata warning and cannot be loaded. */
export class ResourceMetadataError extends Error {
  constructor(
    public readonly code: "parse_failed" | "invalid_metadata",
    message: string,
  ) {
    super(message);
    this.name = "ResourceMetadataError";
  }
}

/** Validate a resource ID using the skill/phase naming rules. */
export function validateResourceId(id: string, label = "id"): string[] {
  const errors: string[] = [];

  if (id.length > MAX_RESOURCE_ID_LENGTH) {
    errors.push(`${label} exceeds ${MAX_RESOURCE_ID_LENGTH} characters (${id.length})`);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    errors.push(`${label} contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
  }
  if (id.startsWith("-") || id.endsWith("-")) {
    errors.push(`${label} must not start or end with a hyphen`);
  }
  if (id.includes("--")) {
    errors.push(`${label} must not contain consecutive hyphens`);
  }

  return errors;
}

/** Validate a resource name against its directory-derived fallback name. */
export function validateResourceName(name: string, id: string): string[] {
  const errors: string[] = [];
  if (name !== id) {
    errors.push(`name "${name}" does not match parent directory "${id}"`);
    errors.push(...validateResourceId(name, "name"));
  }
  return errors;
}

export type DescriptionValidation = {
  description?: string;
  warnings: string[];
  missing: boolean;
};

/** Validate a resource description using Pi's metadata rules. */
export function validateDescription(value: unknown): DescriptionValidation {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      warnings: ["description is required"],
      missing: true,
    };
  }

  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return {
      description: value,
      warnings: [`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${value.length})`],
      missing: false,
    };
  }

  return { description: value, warnings: [], missing: false };
}

export function validateSkillReferences(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ["skills must be an array"];

  const errors: string[] = [];
  for (const [index, skillId] of value.entries()) {
    if (typeof skillId !== "string") {
      errors.push(`skills[${index}] must be a string`);
      continue;
    }
    errors.push(...validateResourceId(skillId, `skills[${index}]`));
  }
  return errors;
}

export function validatePhaseTarget(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value !== "string") return ["target must be a string"];
  if (value === "stop") return [];
  return validateResourceId(value, "target");
}

export function warnResourceDiagnostics(
  kind: ResourceKind,
  filePath: string,
  diagnostics: string[],
): void {
  for (const diagnostic of diagnostics) {
    console.warn(`Invalid ${kind} metadata at "${filePath}": ${diagnostic}`);
  }
}
