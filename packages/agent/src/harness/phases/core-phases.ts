import type { Phase, PhaseContext } from "./types";
import type { InternalModelLoopOptions, ModelInvokeOutput, PhaseExecution } from "../../loop/execution";
import { PhaseRouteTool } from "../tools/route-tool";
import type { LlmToolCall } from "@rowan-agent/models";
import type { ToolCallId, ToolResultRecord } from "../../runtime-events";
import { contentBlocksToMessageContent, createMessage } from "../../loop/messages";

export const DEFAULT_PHASE_ID = "default";
export const STOP_PHASE_ID = "stop";
export const COMPACT_PHASE_ID = "compact";
export const CORE_PHASE_NAMES = new Set([DEFAULT_PHASE_ID, STOP_PHASE_ID, COMPACT_PHASE_ID]);

export function createDefaultPhase(): Phase {
  return {
    name: DEFAULT_PHASE_ID,
    core: true,
    description: "Execute the current user request using the current context.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: [
      "Execute the current user request using the current context.",
      "Must not plan or evaluate unless requested; use available tools only when needed.",
      "If more user input is needed, omit route. If the request is complete, route(stop) as the only target.",
    ].join("\n"),
    disableAutoInvocation: false,
    disableImplicitInvocation: true,
  };
}

export function createStopPhase(): Phase {
  return {
    name: STOP_PHASE_ID,
    core: true,
    description: "Provide the final user-facing conclusion for the completed task.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: [
      "Return only a brief normal-exit explanation in the user's language (one or two sentences).",
      "Must use only facts from the conversation and completed work, and state that the current run ended normally.",
      "If no actionable work occurred, say so briefly. Never invent Backlog, Task, Context, blockers, or next steps.",
      "Do not greet, ask questions, mention routing, call tools, or route to another Phase.",
    ].join("\n"),
    disableAutoInvocation: false,
    disableImplicitInvocation: false,
  };
}

export async function runInternalModelLoop(
  context: PhaseContext,
  execution: PhaseExecution,
  phase: string,
  options: InternalModelLoopOptions,
): Promise<ModelInvokeOutput> {
  const working: PhaseContext = { ...context, messages: [...context.messages] };
  working.messages.push(createMessage("user", options.prompt, {
    kind: "phase_input",
    phase,
  }));
  let result = await execution.invokeModel(working, { output: "internal" });
  const maxRounds = options.maxToolRounds ?? 8;

  const isAllowedTool = (name: string): boolean => {
    if (name === PhaseRouteTool) return false;
    if (options.tools) {
      return options.tools.includes(name);
    }
    return context.tools.some((tool) => tool.name === name);
  };

  for (let attempt = 0; attempt < maxRounds && result.toolCalls.length > 0; attempt += 1) {
    // A round with no allowed call ends the loop, as compaction always did.
    if (!result.toolCalls.some((call) => isAllowedTool(call.name))) break;
    const normalizedCalls: LlmToolCall[] = result.toolCalls.map((call) => {
      const callArgs = call.arguments;
      return {
        ...call,
        arguments: typeof callArgs === "string"
          ? (() => {
              try { return JSON.parse(callArgs); } catch { return callArgs; }
            })()
          : callArgs,
      };
    });
    const toolUseParts = normalizedCalls.map((call) => ({
      type: "tool_use" as const,
      id: call.id,
      name: call.name,
      input: call.arguments,
    }));
    const assistantContent = result.contentBlocks.length > 0
      ? contentBlocksToMessageContent(result.contentBlocks)
      : (result.text
          ? [{ type: "text" as const, text: result.text }, ...toolUseParts]
          : toolUseParts);
    working.messages.push(createMessage("assistant", assistantContent, {
      kind: "phase_tool",
      phase,
    }));

    const allowedCalls = normalizedCalls.filter((call) => isAllowedTool(call.name));
    const executedResults = allowedCalls.length > 0
      ? await execution.executeTools(
          working,
          allowedCalls,
          result.contentBlocks,
          result.model ? { model: result.model, usage: result.usage } : undefined,
        )
      : [];
    const executedByCallId = new Map<string, ToolResultRecord>(executedResults.map((r) => [r.toolCallId, r]));

    const createErrorResult = (call: LlmToolCall): ToolResultRecord => {
      const message = `Tool ${call.name} is not available in Phase ${phase}`;
      return {
        toolCallId: call.id as ToolCallId,
        toolName: call.name,
        ok: false,
        error: message,
        content: message,
      };
    };

    const toolResults = normalizedCalls.map((call) => {
      if (isAllowedTool(call.name)) {
        const executed = executedByCallId.get(call.id);
        if (executed) return executed;
      }
      return createErrorResult(call);
    });

    for (const toolResult of toolResults) {
      working.messages.push(createMessage("tool", [{
        type: "tool_result",
        toolUseId: toolResult.toolCallId,
        content: JSON.stringify(toolResult),
        isError: !toolResult.ok,
      }], {
        kind: "phase_tool",
        phase,
      }));
    }
    result = await execution.invokeModel(working, { output: "internal" });
  }
  return result;
}

export function createCompactPhase(): Phase {
  return {
    name: COMPACT_PHASE_ID,
    core: true,
    description: "Compact the complete conversation context into a durable summary.",
    filePath: "",
    baseDir: "",
    skills: [],
    content: "Summarize all historical conversation roles and tool activity for future context. Preserve durable archive references and important decisions.",
    disableAutoInvocation: true,
    disableImplicitInvocation: false,
    run: async (context, execution) => {
      await execution.reportStatus({
        state: "running",
        kind: "compacting",
        message: "Compacting conversation context.",
      });
      const instructions = compactInstructions(context);
      const result = await execution.runInternalModelLoop(context, {
        prompt: buildCompactionPrompt(instructions),
        tools: ["read", "bash"],
      });
      return {
        route: "stop",
        phase: COMPACT_PHASE_ID,
        payload: {
          kind: "context_compaction",
          summary: result.text,
          ...(instructions ? { instructions } : {}),
        },
        status: {
          state: "completed",
          kind: "compacted",
          message: "Conversation context compacted.",
        },
      };
    },
  };
}

function buildCompactionPrompt(instructions?: string): string {
  const lines = [
    "The conversation above is to be summarized, not continued. Do not answer, carry out, or use Tools for any request in it.",
    "Output only the summary in a fixed structure:",
    "- Goal and state",
    "- Decisions with reasons",
    "- Open requests left unfinished",
    "- Files and archive references",
    "- Facts to keep",
  ];
  if (instructions) {
    lines.push("", `Additional compaction instructions:\n${instructions}`);
  }
  return lines.join("\n");
}

function compactInstructions(context: PhaseContext): string | undefined {
  const payload = context.state.payload;
  if (typeof payload === "object" && payload !== null && "instructions" in payload) {
    const instructions = (payload as { instructions?: unknown }).instructions;
    if (typeof instructions === "string" && instructions.trim().length > 0) {
      return instructions.trim();
    }
  }

  const input = context.execution.input;
  if (input === undefined) return undefined;
  const text = typeof input === "string"
    ? input
    : input
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  const match = text.match(/^\/compact(?:\s+([\s\S]*))?$/i);
  return match?.[1]?.trim() || undefined;
}

export function createCorePhases(): Phase[] {
  return [createDefaultPhase(), createStopPhase(), createCompactPhase()];
}
