import { createId } from "../../../../types";
import type { Outcome } from "../../../../types";
import type { PhaseInput, PhaseOutput, PhaseContext } from "../../config";
import { createPhaseDefinition, type PhaseHandler } from "../types";
import { toJson } from "../../../../harness/context/prompt-builder";
import manifestJson from "./manifest.json";

export function createPhaseOutcome(taskId: string | undefined, message: string, passed: boolean): Outcome {
  return { id: createId("out"), ...(taskId ? { taskId } : {}), passed, message };
}

function isInternalPlanningMessage(message: string): boolean {
  return /^plan\s*:/i.test(message.trim());
}

export function createFailedPhaseOutcome(taskId: string | undefined, message?: string): Outcome {
  const filtered = message && !isInternalPlanningMessage(message) ? message : "Task did not pass acceptance criteria.";
  return { id: createId("out"), ...(taskId ? { taskId } : {}), passed: false, message: filtered };
}

export const verifyHandler: PhaseHandler = {
  definition: createPhaseDefinition(manifestJson, async (context, input) => {
    const maxAttempts = context.maxAttempts ?? 2;
    const task = (input.yield as Record<string, unknown> | undefined)?.task;

    let collected;
    try {
      collected = await context.turn(() => context.model.collect({
        phase: "verify",
        input,
      }));
    } catch (error) {
      // On error, route to execute for retry (if attempts remain)
      if (context.state.attempt >= maxAttempts) {
        return {
          message: "Verification error, no retries remaining.",
          route: "stop",
          yield: { task, passed: true },
        };
      }
      return {
        message: "Verification error, retrying.",
        route: "execute",
        yield: { task },
      };
    }

    const raw = collected.structured as Record<string, unknown> | undefined;
    const message = (raw?.message as string) ?? "";
    const modelPassed = raw?.passed as boolean | undefined;
    let route = (raw?.route as string) ?? (modelPassed === false ? "execute" : "stop");

    // Force stop if max attempts exhausted
    if (route === "execute" && context.state.attempt >= maxAttempts) {
      route = "stop";
    }

    return { message, route, yield: { task, passed: modelPassed ?? true } };
  }),

  conversationLimit: 8,

  buildInput(context, yield_) {
    return {
      phase: "verify",
      systemPrompt: context.state.agentState.systemPrompt,
      messages: context.messages.visible(),
      tools: [],
      skills: context.skills,
      yield: yield_,
    };
  },

  buildPrompt(input) {
    const yield_ = input.yield as Record<string, unknown> | undefined;
    const task = yield_?.task;
    const toolResults = (yield_?.toolResults as unknown[]) ?? [];
    return [
      "Phase: verify",
      "",
      'JSON-only contract: output exactly an object shaped like `{ "message": string, "route": "stop" | "execute" }`.',
      'Use route="stop" when the task output satisfies the acceptance criteria.',
      'Use route="execute" when more work is needed.',
      "Do not return a task, plan, toolCalls, or instructions for future work in this phase.",
      "",
      "Task:",
      toJson(task ?? null),
      "",
      "Task output:",
      toJson({ kind: "tools", toolResults }),
    ].join("\n");
  },

  createOutcome(output) {
    const yield_ = output.yield as Record<string, unknown> | undefined;
    const task = yield_?.task as Record<string, unknown> | undefined;
    const taskId = typeof task?.id === "string" ? task.id : undefined;
    const passed = yield_?.passed !== false;

    if (passed) {
      return createPhaseOutcome(taskId, output.message, true);
    }

    return createFailedPhaseOutcome(taskId, output.message);
  },
};
