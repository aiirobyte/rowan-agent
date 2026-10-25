import { parseModelRef, type ModelRef } from "@rowan-agent/models";
import { parseFrontmatter } from "./loader";
import type { Skill } from "../protocol";
import type { JsonValue } from "../runtime-events";
import { isJsonValue } from "../runtime/json";
import { normalizeDefinitionMetadata } from "./definition-metadata";

export type PhaseRegistrySelection = Readonly<{
  entryPhaseId: string | null;
  phaseIds: readonly string[];
}>;

export type AgentDefinition = Readonly<{
  name: string;
  description: string;
  prompt: string;
  tools?: readonly string[];
  skills?: readonly string[];
  /** Host-supplied Skills private to this Agent Definition/Bundle. */
  bundledSkills?: readonly Skill[];
  phases?: PhaseRegistrySelection;
  contexts?: readonly string[];
  model?: ModelRef;
  /** Host-defined values from unrecognized definition frontmatter. */
  metadata?: Readonly<Record<string, JsonValue>>;
}>;

export function assertAgentDefinition(value: unknown): asserts value is AgentDefinition {
  if (!isRecord(value)) throw new TypeError("config.definition is invalid");
  if ("content" in value) throw new TypeError("definition.content is not supported; use definition.prompt");
  if ("context" in value) throw new TypeError("definition.context is not supported; use definition.contexts");
  requiredString(value.name, "definition.name");
  requiredString(value.description, "definition.description");
  requiredString(value.prompt, "definition.prompt");
  optionalStringList(value.tools, "definition.tools");
  optionalStringList(value.skills, "definition.skills");
  optionalBundledSkills(value.bundledSkills, "definition.bundledSkills");
  optionalPhaseRegistrySelection(value.phases, "definition.phases");
  optionalStringList(value.contexts, "definition.contexts");
  if (value.metadata !== undefined && (!isRecord(value.metadata) || !isJsonValue(value.metadata))) {
    throw new TypeError("definition.metadata must be a JSON object");
  }
  if ("extensions" in value) throw new TypeError("definition.extensions is not supported; Extensions are Runtime-global");
  if ("entryPhase" in value) throw new TypeError("definition.entryPhase is not supported; use definition.phases.entryPhaseId");
  if (value.model !== undefined) {
    if (!isRecord(value.model)
      || typeof value.model.provider !== "string"
      || value.model.provider.trim() === ""
      || typeof value.model.id !== "string"
      || value.model.id.trim() === "") {
      throw new TypeError("definition.model must be a valid model reference");
    }
  }
}

/** Parse one Markdown definition using the same frontmatter vocabulary as Phase resources. */
export function parseAgentDefinition(raw: string): AgentDefinition {
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw);
  return normalizeAgentDefinition(frontmatter, body);
}

export function normalizeAgentDefinition(
  frontmatter: Record<string, unknown>,
  prompt: string,
  options: Readonly<{ fallbackName?: string }> = {},
): AgentDefinition {
  if (frontmatter.content !== undefined) throw new TypeError("content is not supported; use prompt and the document body");
  if (frontmatter.context !== undefined) throw new TypeError("context is not supported; use contexts");
  if (frontmatter.extensions !== undefined) {
    throw new TypeError("extensions is not supported; Extensions are Runtime-global");
  }
  if (frontmatter.entryPhase !== undefined) {
    throw new TypeError("entryPhase is not supported; use phases.entryPhaseId");
  }
  const normalizedMetadata = normalizeDefinitionMetadata("agent-definition", frontmatter);
  const metadataProblem = normalizedMetadata.problems.find((problem) => problem.code !== "non_json_value");
  if (metadataProblem) throw new TypeError(metadataProblem.message);
  const fields = normalizedMetadata.fields;
  const name = fields.name === undefined && options.fallbackName
    ? options.fallbackName
    : requiredString(fields.name, "name");
  const description = requiredString(fields.description, "description");
  const normalizedPrompt = requiredString(prompt, "prompt");
  const tools = optionalStringList(fields.tools, "tools");
  const skills = optionalStringList(fields.skills, "skills");
  const phases = optionalPhaseRegistrySelection(fields.phases, "phases");
  const contexts = optionalStringList(fields.contexts, "contexts");
  const model = optionalModel(fields.model);

  return {
    name,
    description,
    prompt: normalizedPrompt,
    ...(tools ? { tools } : {}),
    ...(skills ? { skills } : {}),
    ...(phases ? { phases } : {}),
    ...(contexts ? { contexts } : {}),
    ...(model ? { model } : {}),
    ...(normalizedMetadata.metadata ? { metadata: normalizedMetadata.metadata } : {}),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalStringList(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array of strings`);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new TypeError(`${field}[${index}] must be a non-empty string`);
    }
    const name = item.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function optionalBundledSkills(value: unknown, field: string): readonly Skill[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array of Skills`);
  const names = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)
      || typeof item.name !== "string"
      || item.name.trim() === ""
      || typeof item.description !== "string"
      || typeof item.filePath !== "string"
      || typeof item.baseDir !== "string"
      || typeof item.content !== "string"
      || (item.disableAutoInvocation !== undefined && typeof item.disableAutoInvocation !== "boolean")
      || (item.disableImplicitInvocation !== undefined && typeof item.disableImplicitInvocation !== "boolean")) {
      throw new TypeError(`${field}[${index}] is invalid`);
    }
    if (names.has(item.name)) throw new TypeError(`Duplicate bundled Skill "${item.name}".`);
    names.add(item.name);
  }
  return value as readonly Skill[];
}

function optionalPhaseRegistrySelection(
  value: unknown,
  field: string,
): PhaseRegistrySelection | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  if (!("phaseIds" in value)) throw new TypeError(`${field}.phaseIds is required`);
  const entryPhaseId = value.entryPhaseId ?? null;
  if (entryPhaseId !== null && (typeof entryPhaseId !== "string" || entryPhaseId.trim() === "")) {
    throw new TypeError(`${field}.entryPhaseId must be a non-empty string or null`);
  }
  const phaseIds = optionalStringList(value.phaseIds, `${field}.phaseIds`);
  if (!phaseIds) throw new TypeError(`${field}.phaseIds is required`);
  return {
    entryPhaseId: entryPhaseId === null ? null : entryPhaseId.trim(),
    phaseIds,
  };
}

function optionalModel(value: unknown): ModelRef | undefined {
  const source = optionalString(value, "model");
  if (!source) return undefined;
  const model = parseModelRef(source);
  if (!model || model.provider.trim() === "" || model.id.trim() === "") {
    throw new TypeError("model must be a valid model reference");
  }
  return model;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
