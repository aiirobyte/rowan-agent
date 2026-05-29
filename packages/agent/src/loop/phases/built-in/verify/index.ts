import { createId, toJson, type Outcome, type PhaseInput, type PhaseOutput, type PhaseContext } from "../../config";
import type { ExtensionFactory } from "../../../../extensions";
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

async function run(context: PhaseContext, input: PhaseInput): Promise<PhaseOutput> {
  const maxAttempts = context.maxAttempts ?? 2;
  const task = (input.yield as Record<string, unknown> | undefined)?.task;

  let collected;
  try {
    collected = await context.turn(() => context.model.collect({
      phase: "verify",
      input,
    }));
  } catch (error) {
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

  // If model called tools, route to execute for rework
  if (collected.toolCalls.length > 0) {
    if (context.state.attempt >= maxAttempts) {
      return { message: collected.text || "Verification fix attempted.", route: "stop", yield: { task, passed: true } };
    }
    return { message: collected.text || "Fixing issues.", route: "execute", yield: { task } };
  }

  // Try to parse JSON routing (for models that output structured verify results)
  let message = collected.text.trim();
  let passed = !/fail|error|issue|fix|retry/i.test(message);
  let route = passed ? "stop" : "execute";

  try {
    const parsed = JSON.parse(collected.text);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.passed === "boolean") passed = parsed.passed;
      if (typeof parsed.message === "string" && parsed.message.trim()) message = parsed.message.trim();
      if (typeof parsed.route === "string") route = parsed.route;
    }
  } catch {
    // Plain text — use heuristic above
  }

  if (route === "execute" && context.state.attempt >= maxAttempts) {
    route = "stop";
  }

  return { message, route, yield: { task, passed } };
}

export const verifyExtension: ExtensionFactory = (api) => {
  api.registerPhase(manifestJson, {
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
        "Review the task output against the acceptance criteria.",
        "If the criteria are met, respond with a confirmation.",
        "If more work is needed, call tools to fix issues.",
        "Do NOT output JSON.",
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
  }, run);
};
