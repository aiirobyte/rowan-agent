import type { LlmContext } from "../../../protocol";
import {
  createPromptBuilder,
  latestUserInput,
  serializeSkills,
  serializeTools,
  toJson,
  type PhasePromptBuilder,
  type PromptTool,
} from "../../../harness/context/prompt-builder";
import type { PhaseConfigTemplate, PhaseConfigTemplatePhase } from "../config";
import { builtinPhaseConfigTemplate } from ".";

function requirePhase<TPhase extends LlmContext["phase"]>(
  context: LlmContext,
  phase: TPhase,
): Extract<LlmContext, { phase: TPhase }> {
  if (context.phase !== phase) {
    throw new Error(`Expected ${phase} prompt context, received ${context.phase}.`);
  }

  return context as Extract<LlmContext, { phase: TPhase }>;
}

function serializeAllowedTools(context: Extract<LlmContext, { toolResults: unknown }>, tools: PromptTool[]) {
  const allowedToolNames = new Set(context.task.toolNames);
  return serializeTools(tools).filter((tool) => allowedToolNames.has(tool.name));
}

function createPromptValues(context: LlmContext, tools: PromptTool[]): Record<string, string> {
  const values: Record<string, string> = {
    currentUserInputJson: toJson(latestUserInput(context)),
    stateInputJson: toJson(context.state.input),
    stateTaskJson: toJson(context.state.task ?? null),
    stateGoalJson: toJson(context.state.goal ?? null),
    runtimeDepthJson: toJson(context.runtime ?? null),
    loadedSkillsJson: toJson(serializeSkills(context)),
    availableToolsJson: toJson(serializeTools(tools)),
    availablePhasesJson: toJson("availablePhases" in context ? context.availablePhases ?? [] : []),
  };

  if ("task" in context) {
    values.taskJson = toJson(context.task);
  }

  if ("toolResults" in context) {
    values.allowedToolNamesJson = toJson(context.task.toolNames);
    values.allowedToolsJson = toJson(serializeAllowedTools(context, tools));
    values.toolResultsJson = toJson(context.toolResults);
  }

  if ("criteria" in context) {
    values.criteriaJson = toJson(context.criteria);
  }

  if ("taskOutput" in context) {
    values.taskOutputJson = toJson(context.taskOutput);
  }

  return values;
}

function renderPromptTemplate(lines: string[], values: Record<string, string>): string {
  return lines
    .map((line) =>
      line.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, key: string) => {
        if (!(key in values)) {
          throw new Error(`No prompt value available for "${key}".`);
        }
        return values[key];
      }),
    )
    .join("\n");
}

export function createPhasePromptBuilder(phase: PhaseConfigTemplatePhase): PhasePromptBuilder {
  if (!phase.prompt) {
    throw new Error(`Phase "${phase.id}" does not define a prompt template.`);
  }

  return {
    phase: phase.id as LlmContext["phase"],
    conversationLimit: phase.prompt.conversationLimit,
    build({ context, tools }) {
      const phaseContext = requirePhase(context, phase.id as LlmContext["phase"]);
      return renderPromptTemplate(
        phase.prompt!.lines,
        createPromptValues(phaseContext, tools),
      );
    },
  };
}

export function createPhasePromptBuilders(template: PhaseConfigTemplate = builtinPhaseConfigTemplate): PhasePromptBuilder[] {
  return template.phases
    .filter((phase) => phase.prompt)
    .map((phase) => createPhasePromptBuilder(phase));
}

export const builtinPhasePromptBuilders = createPhasePromptBuilders(builtinPhaseConfigTemplate);

export function createBuiltinPromptBuilder(template: PhaseConfigTemplate = builtinPhaseConfigTemplate) {
  return createPromptBuilder(createPhasePromptBuilders(template));
}

const builtinPromptBuilder = createBuiltinPromptBuilder();

export const buildPrompt = builtinPromptBuilder.buildPrompt;
export const buildMessages = builtinPromptBuilder.buildMessages;
