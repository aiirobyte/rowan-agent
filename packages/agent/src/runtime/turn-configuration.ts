import { createHash } from "node:crypto";
import type { ResolvedAgentContext } from "./contracts";
import { canonicalJson } from "./json";
import type {
  ConfigToken,
  ContextConfiguration,
  JsonValue,
  Message,
} from "../runtime-events";

export type ConfigurationView = Readonly<{
  instructions: string;
  tools: readonly Readonly<{
    name: string;
    promptSnippet?: string;
    promptGuidelines?: readonly string[];
  }>[];
  skills: readonly Readonly<{
    name: string;
    description: string;
    filePath: string;
    disableAutoInvocation?: boolean;
    disableModelInvocation?: boolean;
  }>[];
  phases: readonly Readonly<{
    name: string;
    description: string;
    promptGuidelines?: readonly string[];
    disableAutoInvocation?: boolean;
    tools?: readonly string[];
    skills?: readonly string[];
  }>[];
}>;

/** The deterministic projection of what the System Prompt and a Configuration
 * Notice can say. Executable definitions and request-only values stay out. */
export function configurationView(context: ResolvedAgentContext): ConfigurationView {
  return {
    instructions: context.systemPrompt,
    tools: context.tools.map((tool) => ({
      name: tool.name,
      ...(tool.promptSnippet === undefined ? {} : { promptSnippet: tool.promptSnippet }),
      ...(tool.promptGuidelines === undefined ? {} : { promptGuidelines: [...tool.promptGuidelines] }),
    })),
    skills: context.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      ...(skill.disableAutoInvocation === undefined ? {} : { disableAutoInvocation: skill.disableAutoInvocation }),
      ...(skill.disableModelInvocation === undefined ? {} : { disableModelInvocation: skill.disableModelInvocation }),
    })),
    phases: [...(context.phases?.phases.values() ?? [])].map((phase) => ({
      name: phase.name,
      description: phase.description,
      ...(phase.promptGuidelines === undefined ? {} : { promptGuidelines: [...phase.promptGuidelines] }),
      ...(phase.disableAutoInvocation === undefined ? {} : { disableAutoInvocation: phase.disableAutoInvocation }),
      ...(phase.tools === undefined ? {} : { tools: [...phase.tools] }),
      ...(phase.skills === undefined ? {} : { skills: phase.skills.map(({ name }) => name) }),
    })),
  };
}

export function configurationDigest(view: ConfigurationView): string {
  return createHash("sha256").update(canonicalJson(view as unknown as JsonValue)).digest("hex");
}

export function currentContextConfiguration(
  messages: readonly Message[],
): ContextConfiguration | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const configuration = messages[index]?.configuration;
    if (configuration !== undefined) return configuration;
  }
  return undefined;
}

export function prefixContextConfiguration(
  messages: readonly Message[],
): ContextConfiguration | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const configuration = messages[index]?.configuration;
    if (configuration?.prefix === true) return configuration;
  }
  return undefined;
}

/** Decide the value carried by the message that opens a Turn. */
export async function decideContextConfiguration(input: Readonly<{
  messages: readonly Message[];
  token: ConfigToken;
  view: ConfigurationView;
  resolveView(token: ConfigToken): Promise<ConfigurationView | undefined>;
}>): Promise<ContextConfiguration | undefined> {
  const current = currentContextConfiguration(input.messages);
  if (current === undefined) {
    return { token: input.token, digest: configurationDigest(input.view), prefix: true };
  }
  const prefix = prefixContextConfiguration(input.messages);
  if (prefix === undefined) {
    return { token: input.token, digest: configurationDigest(input.view), prefix: true };
  }
  const previous = await input.resolveView(current.token);
  const previousPrefix = await input.resolveView(prefix.token);
  if (previous === undefined || previousPrefix === undefined) {
    return { token: input.token, digest: configurationDigest(input.view), prefix: true };
  }
  const digest = configurationDigest(input.view);
  if (digest === current.digest) return undefined;
  return {
    token: input.token,
    digest,
    notice: renderConfigurationNotice(previous, input.view),
  };
}

export function renderConfigurationNotice(
  previous: ConfigurationView,
  next: ConfigurationView,
): string {
  const lines = [
    "<configuration_update>",
    "The agent configuration changed. These updates take precedence over the system prompt.",
  ];

  const previousTools = new Map(previous.tools.map((tool) => [tool.name, tool]));
  const nextTools = new Map(next.tools.map((tool) => [tool.name, tool]));
  const addedTools = next.tools.filter(({ name }) => !previousTools.has(name));
  const removedTools = previous.tools.filter(({ name }) => !nextTools.has(name));
  const changedTools = next.tools.filter((tool) => {
    const before = previousTools.get(tool.name);
    return before !== undefined && canonicalJson(tool as unknown as JsonValue) !== canonicalJson(before as unknown as JsonValue);
  });
  if (addedTools.length > 0) lines.push(`Tools added: ${addedTools.map(formatTool).join("; ")}`);
  if (removedTools.length > 0) lines.push(`Tools removed: ${removedTools.map(({ name }) => name).join("; ")}`);
  if (changedTools.length > 0) lines.push(`Tools changed: ${changedTools.map(formatTool).join("; ")}`);

  const previousSkills = new Map(previous.skills.map((skill) => [skill.name, skill]));
  const nextSkills = new Map(next.skills.map((skill) => [skill.name, skill]));
  const addedSkills = next.skills.filter(({ name }) => !previousSkills.has(name));
  const removedSkills = previous.skills.filter(({ name }) => !nextSkills.has(name));
  const changedSkills = next.skills.filter((skill) => {
    const before = previousSkills.get(skill.name);
    return before !== undefined && canonicalJson(skill as unknown as JsonValue) !== canonicalJson(before as unknown as JsonValue);
  });
  if (addedSkills.length > 0) lines.push(`Skills added: ${addedSkills.map(formatSkill).join("; ")}`);
  if (removedSkills.length > 0) lines.push(`Skills removed: ${removedSkills.map(({ name }) => name).join("; ")}`);
  if (changedSkills.length > 0) lines.push(`Skills changed: ${changedSkills.map(formatSkill).join("; ")}`);

  const previousPhases = new Map(previous.phases.map((phase) => [phase.name, phase]));
  const nextPhases = new Map(next.phases.map((phase) => [phase.name, phase]));
  const addedPhases = next.phases.filter(({ name }) => !previousPhases.has(name));
  const removedPhases = previous.phases.filter(({ name }) => !nextPhases.has(name));
  const changedPhases = next.phases.filter((phase) => {
    const before = previousPhases.get(phase.name);
    return before !== undefined && canonicalJson(phase as unknown as JsonValue) !== canonicalJson(before as unknown as JsonValue);
  });
  if (addedPhases.length > 0) lines.push(`Phases added: ${addedPhases.map(formatPhase).join("; ")}`);
  if (removedPhases.length > 0) lines.push(`Phases removed: ${removedPhases.map(({ name }) => name).join("; ")}`);
  if (changedPhases.length > 0) lines.push(`Phases changed: ${changedPhases.map(formatPhase).join("; ")}`);

  if (previous.instructions !== next.instructions) {
    lines.push("Instructions updated:", next.instructions);
  }
  lines.push("</configuration_update>");
  return lines.join("\n");
}

function formatTool(tool: ConfigurationView["tools"][number]): string {
  const details = [
    ...(tool.promptSnippet === undefined ? [] : [tool.promptSnippet]),
    ...(tool.promptGuidelines ?? []),
  ];
  return details.length === 0 ? tool.name : `${tool.name} (${details.join(" | ")})`;
}

function formatSkill(skill: ConfigurationView["skills"][number]): string {
  return `${skill.name}: ${skill.description} (${skill.filePath})`;
}

function formatPhase(phase: ConfigurationView["phases"][number]): string {
  return `${phase.name}: ${phase.description}`;
}
