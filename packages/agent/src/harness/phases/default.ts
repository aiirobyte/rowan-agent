import type { Phase } from "./types";
import { contentBlocksToMessageContent, createMessage } from "../../types";

export const DEFAULT_PHASE_ID = "default";
export const STOP_PHASE_ID = "stop";
export const COMPACT_PHASE_ID = "compact";

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
      // Compaction is non-conversational, but the summarizer still needs to
      // recover details from spilled Tool Results when a bounded preview is
      // insufficient. Only read/bash are exposed and their calls stay
      // ephemeral: they are not appended as Conversation Messages.
      const tools = context.tools.filter((tool) =>
        tool.core && (tool.name === "read" || tool.name === "bash"));
      const working = { ...context, tools, skills: [...context.skills], messages: [...context.messages] };
      let result = await execution.invokeModel(working, { output: "internal" });
      for (let attempt = 0; attempt < 8 && result.toolCalls.length > 0; attempt += 1) {
        const calls = result.toolCalls.filter((call) => tools.some((tool) => tool.name === call.name));
        if (calls.length === 0) break;
        const normalizedCalls = calls.map((call) => ({
          ...call,
          args: typeof call.args === "string"
            ? (() => {
                try { return JSON.parse(call.args); } catch { return call.args; }
              })()
            : call.args,
        }));
        const assistantContent = result.contentBlocks.length > 0
          ? contentBlocksToMessageContent(result.contentBlocks)
          : normalizedCalls.map((call) => ({ type: "tool_use" as const, id: call.id, name: call.name, input: call.args }));
        working.messages.push(createMessage("assistant", assistantContent, {
          kind: "phase_tool",
          phase: COMPACT_PHASE_ID,
        }));
        for (const call of normalizedCalls) {
          const tool = tools.find((candidate) => candidate.name === call.name)!;
          let toolResult;
          try {
            toolResult = await tool.execute(call.args, {
              skills: working.skills,
              toolCallId: call.id,
            });
          } catch (error) {
            toolResult = {
              toolCallId: call.id,
              toolName: call.name,
              ok: false,
              content: null,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          working.messages.push(createMessage("tool", [{
            type: "tool_result",
            toolUseId: call.id,
            content: JSON.stringify(toolResult),
            isError: !toolResult.ok,
          }], {
            kind: "phase_tool",
            phase: COMPACT_PHASE_ID,
          }));
        }
        result = await execution.invokeModel(working, { output: "internal" });
      }
      return {
        route: "stop",
        phase: COMPACT_PHASE_ID,
        payload: { kind: "context_compaction", summary: result.text },
        status: {
          state: "completed",
          kind: "compacted",
          message: "Conversation context compacted.",
        },
      };
    },
  };
}

export function createCorePhases(): Phase[] {
  return [createDefaultPhase(), createStopPhase(), createCompactPhase()];
}
