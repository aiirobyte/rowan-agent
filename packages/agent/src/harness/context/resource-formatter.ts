import type { LlmContentPart } from "@rowan-agent/models";

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
  skills: Array<{ name: string; description: string; filePath: string; disableModelInvocation?: boolean }>,
): string {
  const visibleSkills = skills.filter((skill) => !skill.disableModelInvocation);
  if (visibleSkills.length === 0) return "";

  const lines = ["<available_skills>"];
  for (const skill of visibleSkills) {
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

// ---------------------------------------------------------------------------
// JSON → XML conversion for phase payload injection
// ---------------------------------------------------------------------------

/**
 * Recursively convert a JSON value to XML elements.
 * Used for phase payload injection.
 *
 * @example
 * jsonToXml({ items: ["a", "b"], count: 2 }, 0)
 * // → <items><item>a</item><item>b</item></items>\n<count>2</count>
 */
export function jsonToXml(value: unknown, depth: number): string {
  const indent = "  ".repeat(depth);

  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return `${indent}${escapeXml(String(value))}`;

  // Array → <item> elements
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "object" && item !== null) {
        return `${indent}<item>\n${jsonToXml(item, depth + 1)}\n${indent}</item>`;
      }
      return `${indent}<item>${escapeXml(String(item))}</item>`;
    }).join("\n");
  }

  // Object → key-named elements
  return Object.entries(value).map(([key, val]) => {
    const tag = escapeXml(key);
    if (typeof val === "object" && val !== null) {
      return `${indent}<${tag}>\n${jsonToXml(val, depth + 1)}\n${indent}</${tag}>`;
    }
    return `${indent}<${tag}>${escapeXml(String(val))}</${tag}>`;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// Phase result message construction
// ---------------------------------------------------------------------------

/** Construct phase directive message as LlmContentPart[] — shared by parallel and serial paths.
 *
 * Output structure:
 *   <phase name="{name}">
 *     <content>{content}</content>
 *     [<prev_phase_outputs>                       (only when results non-empty)
 *        [<instruction>...</instruction>]         (only when instruction set)
 *        <phase name="{source}">{payload xml}</phase>
 *     </prev_phase_outputs>]
 *   </phase>
 */
export function buildPhaseDirectiveMessage(
  phase: { name: string; content: string },
  output: { instruction?: string; results?: Array<{ name: string; output?: unknown }> },
  toolUseId: string,
): LlmContentPart[] {
  const parts: string[] = [];
  parts.push(`<phase name="${escapeXml(phase.name)}">`);
  parts.push(`  <content>${phase.content}</content>`);
  if (output.results && output.results.length > 0) {
    parts.push(`  <prev_phase_outputs>`);
    if (output.instruction) {
      parts.push(`    <instruction>${escapeXml(output.instruction)}</instruction>`);
    }
    for (const r of output.results) {
      parts.push(`    <phase name="${escapeXml(r.name)}">`);
      if (r.output !== undefined) {
        parts.push(jsonToXml(r.output, 3));
      }
      parts.push(`    </phase>`);
    }
    parts.push(`  </prev_phase_outputs>`);
  }
  parts.push(`</phase>`);
  return [{
    type: "tool_result",
    toolUseId,
    content: parts.join("\n"),
    isError: false,
  }];
}