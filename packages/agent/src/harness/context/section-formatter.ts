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