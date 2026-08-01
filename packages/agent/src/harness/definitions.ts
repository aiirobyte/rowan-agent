import { parseModelRef, type ModelRef } from "@rowan-agent/models";
import { parseFrontmatter } from "./loader";

export type AgentDefinition = Readonly<{
  name: string;
  description: string;
  content: string;
  tools?: readonly string[];
  skills?: readonly string[];
  phases?: readonly string[];
  extensions?: readonly string[];
  entryPhase?: string;
  model?: ModelRef;
}>;

export function assertAgentDefinition(value: unknown): asserts value is AgentDefinition {
  if (!isRecord(value)) throw new TypeError("config.definition is invalid");
  requiredString(value.name, "definition.name");
  requiredString(value.description, "definition.description");
  requiredString(value.content, "definition.content");
  optionalStringList(value.tools, "definition.tools");
  optionalStringList(value.skills, "definition.skills");
  optionalStringList(value.phases, "definition.phases");
  optionalStringList(value.extensions, "definition.extensions");
  optionalString(value.entryPhase, "definition.entryPhase");
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
  content: string,
  options: Readonly<{ fallbackName?: string }> = {},
): AgentDefinition {
  const name = frontmatter.name === undefined && options.fallbackName
    ? options.fallbackName
    : requiredString(frontmatter.name, "name");
  const description = requiredString(frontmatter.description, "description");
  const normalizedContent = requiredString(content, "content");
  const tools = optionalStringList(frontmatter.tools, "tools");
  const skills = optionalStringList(frontmatter.skills, "skills");
  const phases = optionalStringList(frontmatter.phases, "phases");
  const extensions = optionalStringList(frontmatter.extensions, "extensions");
  const entryPhase = optionalString(frontmatter.entryPhase, "entryPhase");
  const model = optionalModel(frontmatter.model);

  return {
    name,
    description,
    content: normalizedContent,
    ...(tools ? { tools } : {}),
    ...(skills ? { skills } : {}),
    ...(phases ? { phases } : {}),
    ...(extensions ? { extensions } : {}),
    ...(entryPhase ? { entryPhase } : {}),
    ...(model ? { model } : {}),
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

function optionalStringList(value: unknown, field: string): readonly string[] | undefined {
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
