import { Validators } from "../../../../types";
import type { Task } from "../../../../types";
import type { LlmContext } from "../../../../protocol";
import type { PlanInput } from "../../../types";
import type { PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import type { PromptTool } from "../../../../harness/context/prompt-builder";
import { toJson, latestUserInput, serializeSkills, serializeTools } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function parseTask(value: unknown): Task {
  return Validators.task.Parse(value);
}

function requirePlanContext(context: LlmContext): Extract<LlmContext, { phase: "plan" }> {
  if (context.phase !== "plan") {
    throw new Error(`Expected plan context, received ${context.phase}.`);
  }
  return context as Extract<LlmContext, { phase: "plan" }>;
}

export const planHandler: PhaseHandler<
  PlanInput,
  { task: Task; text: string }
> = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    const collected = await context.model.collect({
      phase: "plan",
      payload: { phase: "plan", state: input.state, runtime: input.runtime },
    });

    const phaseOutput = collected.phaseOutput as { task?: unknown; text?: string } | undefined;
    const rawTask = phaseOutput?.task ?? collected.structured;
    if (!rawTask) {
      throw new Error("Planner did not produce a structured task.");
    }

    const task = parseTask(rawTask);
    return { task, text: phaseOutput?.text ?? collected.text };
  }),

  conversationLimit: 20,

  buildInput(context) {
    return {
      state: context.state.agentState,
      runtime: context.state.depth,
    };
  },

  buildPrompt(context, tools) {
    const ctx = requirePlanContext(context);
    return [
      "Phase: plan",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "task": Task }`.',
      "The top-level message is the user-visible planning message and is preserved as plain string message content before the task object is recorded.",
      "Task fields: title, instruction, acceptanceCriteria, toolNames, skillIds, status, attempts.",
      "Rowan can fill missing id, status, attempts, skillIds, toolNames, and simple acceptance criteria.",
      'Prefer setting task.status to "pending" and task.attempts to 0.',
      "Use toolNames only from the available tools. Use skillIds only from the loaded skills.",
      "Create the task for the current user request below. Use prior conversation only as context.",
      "If Agent state task or Agent state goal is present, this is a worker thread; prioritize that task/goal over broad delegation.",
      "",
      "Current user request:",
      toJson(latestUserInput(ctx)),
      "",
      "Agent state initial input:",
      toJson(ctx.state.input),
      "",
      "Agent state task:",
      toJson(ctx.state.task ?? null),
      "",
      "Agent state goal:",
      toJson(ctx.state.goal ?? null),
      "",
      "Runtime thread depth:",
      toJson(ctx.runtime ?? null),
      "",
      "Loaded skills summary:",
      toJson(serializeSkills(ctx)),
      "",
      "Available tools with name, description, and parameters:",
      toJson(serializeTools(tools)),
    ].join("\n");
  },

  finalize(context, output) {
    context.setTask(output.task);
  },

  async applyOutput(_context, _input, _output) {
    return { type: "next", phaseId: "execute" };
  },
};

export type { PlanInput } from "../../../types";