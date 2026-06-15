/**
 * Structured formatting utilities for system prompt sections.
 *
 * Pattern: each section uses XML-like tags for structured data,
 * making it easy for the model to parse without ambiguity.
 * Shared by route-tool, skills, tools, and any future structured sections.
 */

/** Escape XML special characters. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a structured section from items with tag-based formatting. */
export function buildStructuredSection(
  tag: string,
  items: Array<Record<string, string>>,
): string {
  const lines: string[] = [];
  for (const item of items) {
    lines.push(`  <${tag}>`);
    for (const [key, value] of Object.entries(item)) {
      lines.push(`    <${key}>${escapeXml(value)}</${key}>`);
    }
    lines.push(`  </${tag}>`);
  }
  return lines.join("\n");
}

/** Build a structured description for skills. */
export function buildSkillsDescription(
  skills: Array<{ name: string; description: string; filePath: string }>,
): string {
  const lines = ["<available_skills>"];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Unified resource output formatting
// ---------------------------------------------------------------------------

export type ResourceType = "skill" | "phase" | "markdown" | "code" | "file";

export type ResourceOutput = {
  type: ResourceType;
  name: string;
  location: string;
  content: string;
  /** Directory for resolving relative paths (skills and phases only) */
  baseDir?: string;
};

/**
 * Format a resource as XML for LLM consumption.
 * Uses the resource type as the XML tag name.
 */
export function formatResourceOutput(resource: ResourceOutput): string {
  const parts = [`<${resource.type} name="${escapeXml(resource.name)}" location="${escapeXml(resource.location)}">`];
  if (resource.baseDir) {
    parts.push(`References are relative to ${resource.baseDir}.`);
    parts.push("");
  }
  parts.push(resource.content);
  parts.push(`</${resource.type}>`);
  return parts.join("\n");
}

/**
 * Detect resource type from file path.
 * Used by the read tool to auto-classify files.
 */
export function detectResourceType(filePath: string): ResourceType {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/.rowan/skills/") && normalized.endsWith("/SKILL.md")) return "skill";
  if (normalized.includes("/.rowan/phases/") && normalized.endsWith("/PHASE.md")) return "phase";
  if (normalized.endsWith(".md")) return "markdown";
  if (/\.(ts|js|tsx|jsx|py|rs|go|java|c|cpp|rb|sh|sql|yaml|yml|json|toml)$/.test(normalized)) return "code";
  return "file";
}