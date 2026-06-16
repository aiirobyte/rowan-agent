export interface SystemPromptOptions {
  /** Base system prompt. */
  systemPrompt: string;
  /** Additional guideline bullets appended to the default runtime instructions. */
  promptGuidelines?: string[];
  /** Text to append after the default runtime instructions. */
  appendSystemPrompt?: string;
  /** Active tools — snippets and guidelines are included in the prompt. */
  tools?: Array<{
    name: string;
    description?: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
  }>;
  /** Loaded skills — serialized into the prompt. */
  skills?: Array<{
    name: string;
    description: string;
    filePath: string;
    disableModelInvocation?: boolean;
  }>;
  /** Working directory. */
  cwd?: string;
}

import { buildSkillsDescription } from "./resource-formatter";
import { createTimestamp } from "../../utils";

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { systemPrompt, promptGuidelines, appendSystemPrompt, tools, skills, cwd } = options;
  const date = createTimestamp();

  // Deduplicated guideline collector
  const guidelinesList: string[] = [];
  const guidelinesSet = new Set<string>();
  const addGuideline = (guideline: string): void => {
    const normalized = guideline.trim();
    if (normalized.length === 0 || guidelinesSet.has(normalized)) return;
    guidelinesSet.add(normalized);
    guidelinesList.push(normalized);
  };

  // Build tools list and collect tool-level guidelines
  const visibleTools = (tools ?? []).filter((t) => !!t.promptSnippet);
  const toolsList = visibleTools.length > 0
    ? visibleTools.map((t) => `- ${t.name}: ${t.promptSnippet}`).join("\n")
    : "(none)";

  for (const tool of tools ?? []) {
    for (const g of tool.promptGuidelines ?? []) {
      addGuideline(g);
    }
  }

  // Build skills — structured XML-like format
  const skillsBlock = skills && skills.length > 0
    ? buildSkillsDescription(skills)
    : "";

  // Collect caller-provided guidelines
  for (const g of promptGuidelines ?? []) {
    addGuideline(g);
  }

  const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

  const skillsSection = skillsBlock
    ? `The following skills provide specialized instructions for specific tasks.
Read the full skill file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.

${skillsBlock}
`
    : "";

  let prompt = `${systemPrompt}

**Important:** Tool and skill availability varies by phase. Only use tools that are available in your current phase context.

Available tools:
${toolsList}

${skillsSection}
Guidelines:
${guidelines}`;

  if (date || cwd) {
    const contextParts: string[] = [];
    if (date) contextParts.push(`Current date: ${date}`);
    if (cwd) contextParts.push(`Working directory: ${cwd}`);
    prompt += `\n\n${contextParts.join("\n")}`;
  }

  if (appendSystemPrompt) {
    prompt += `\n\n${appendSystemPrompt}`;
  }

  return prompt;
}