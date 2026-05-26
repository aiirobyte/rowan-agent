import { createId, createMessage, Validators } from "../../../../types";
import type { LoopPhaseOutputMap, Outcome, Task, VerificationResult } from "../../../../types";
import type { LlmContext } from "../../../../protocol";
import { isInvalidModelSchemaError } from "../../../errors";
import {
  createInvalidModelVerification,
  createToolTaskOutput,
} from "../../../outcomes";
import type { VerifyInput } from "../../../types";
import type { PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import type { PromptTool } from "../../../../harness/context/prompt-builder";
import { toJson } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInternalPlanningMessage(message: string): boolean {
  return /^plan\s*:/i.test(message.trim());
}

function normalizeVerificationInput(value: unknown): VerificationResult {
  if (!isRecord(value)) {
    throw new Error("Expected verify output to be an object.");
  }

  if (typeof value.passed !== "boolean") {
    throw new Error("Expected verify output to include boolean passed.");
  }

  const passed = value.passed;
  const message =
    typeof value.message === "string" && value.message.trim().length > 0
      ? value.message
      : passed === true
        ? "Task passed."
        : "Task failed.";

  return Validators.verificationResult.Parse({
    passed,
    message,
  });
}

function parseVerificationResult(value: unknown): VerificationResult {
  return Validators.verificationResult.Parse(normalizeVerificationInput(value));
}

export function createOutcome(task: Task, verification: VerificationResult): Outcome {
  const normalizedVerification = Validators.verificationResult.Parse(verification);
  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: normalizedVerification.passed,
    message: normalizedVerification.message,
  });
}

export function createFailedOutcome(task: Task, verification?: VerificationResult): Outcome {
  const message =
    verification?.message && !isInternalPlanningMessage(verification.message)
      ? verification.message
      : "Task did not pass acceptance criteria.";

  return Validators.outcome.Parse({
    id: createId("out"),
    taskId: task.id,
    passed: false,
    message,
  });
}

function requireVerifyContext(context: LlmContext): Extract<LlmContext, { phase: "verify" }> {
  if (context.phase !== "verify") {
    throw new Error(`Expected verify context, received ${context.phase}.`);
  }
  return context as Extract<LlmContext, { phase: "verify" }>;
}

export const verifyHandler: PhaseHandler<VerifyInput, VerificationResult> = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    let collected;
    try {
      collected = await context.model.collect({
        phase: "verify",
        payload: {
          phase: "verify",
          state: input.state,
          task: input.task,
          taskOutput: input.taskOutput,
          criteria: input.criteria,
          runtime: input.runtime,
        },
      });
    } catch (error) {
      if (!isInvalidModelSchemaError(error)) {
        throw error;
      }
      return createInvalidModelVerification(input.task, error);
    }

    const phaseOutput = collected.phaseOutput as LoopPhaseOutputMap["verify"] | undefined;
    const rawVerification = phaseOutput ?? collected.structured;
    return rawVerification
      ? parseVerificationResult(rawVerification)
      : {
          passed: false,
          message: "Verifier did not produce structured output.",
        };
  }),

  conversationLimit: 8,

  buildInput(context) {
    const task = context.state.task!;
    const taskOutput = createToolTaskOutput(context.state.toolResults);

    return {
      state: context.state.agentState,
      task,
      taskOutput,
      criteria: task.acceptanceCriteria,
      runtime: context.state.depth,
    };
  },

  buildPrompt(context, _tools) {
    const ctx = requireVerifyContext(context);
    return [
      "Phase: verify",
      "",
      "Analyze the task output and return only a JSON judgement.",
      "`passed` is a boolean for whether the task is complete; `message` is the final user-visible task answer.",
      "Use `passed: true` when the task output is sufficient to answer the user's task, even if the answer is negative such as no matching files found.",
      "Use `passed: false` only when required tool calls failed, required information is missing, or the user's task cannot be determined from the available output.",
      "Do not return a task, plan, toolCalls, or instructions for future work in this phase.",
      "Return no extra keys beyond passed and message.",
      "If more information is needed, return passed=false and explain what is missing in message.",
      "Evaluate the task against the acceptance criteria using the task output and the conversation messages already included in this request.",
      "",
      "Task:",
      toJson(ctx.task),
      "",
      "Acceptance criteria:",
      toJson(ctx.criteria),
      "",
      "Task output:",
      toJson(ctx.taskOutput),
    ].join("\n");
  },

  async applyOutput(context, input, output) {
    if (output.passed) {
      const outcome = createOutcome(input.task, output);
      await context.messages.appendState(
        createMessage("assistant", outcome.message, {
          kind: "task_outcome",
          taskId: input.task.id,
        }),
      );
      return { type: "stop", outcome };
    }

    const maxAttempts = context.maxAttempts ?? 2;
    if (context.state.attempt < maxAttempts) {
      return { type: "next", phaseId: "execute" };
    }

    const outcome = createFailedOutcome(input.task, output);
    return { type: "stop", outcome };
  },
};

export type { VerifyInput } from "../../../types";