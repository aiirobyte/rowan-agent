import Type from "typebox";
import type { Tool, ToolContext, ToolResult, Skill, RunResult } from "../../types";
import { buildStructuredSection } from "../context/section-formatter";

export const ThreadTool = "thread";

export type ThreadToolArgs = {
  prompt: string;
  /** Tool names available to the sub-agent. If omitted, all tools are available. */
  tools?: string[];
  /** Skill names available to the sub-agent. If omitted, all skills are available. */
  skills?: string[];
  limits?: {
    maxIterations?: number;
  };
};

/** Function signature for spawning a sub-agent loop. */
export type SpawnThreadFn = (input: {
  prompt: string;
  tools?: Tool[];
  skills?: Skill[];
  limits?: { maxIterations?: number };
}) => Promise<RunResult>;

function buildThreadDescription(availableSkills: Skill[]): string {
  const lines = [
    "Spawn a sub-agent to handle an independent subtask.",
    "",
    "The sub-agent runs a full agent loop on the given prompt,",
    "then returns the result. Use this to delegate well-scoped, parallelizable work",
    "that would otherwise clutter the current context.",
    "",
    "When to use:",
    "- A self-contained subtask that doesn't need back-and-forth with the current conversation.",
    "- Parallel work that can run independently (e.g. research, file generation, testing).",
    "- When the current context is getting long and a fresh scope would be cleaner.",
    "",
    "When NOT to use:",
    "- Tasks that require access to the current conversation's full history.",
    "- Simple tool calls that can be done directly in the current phase.",
    "- Tasks that need real-time interaction with the user.",
  ];

  if (availableSkills.length > 0) {
    const skillsBlock = buildStructuredSection("skill",
      availableSkills.map(s => ({ name: s.name, description: s.description })),
    );
    lines.push("");
    lines.push("<available_skills>");
    lines.push(skillsBlock);
    lines.push("</available_skills>");
  }

  lines.push("");
  lines.push("The sub-agent inherits the current model and system prompt.");

  return lines.join("\n");
}

/**
 * Extract a human-readable summary from a run result.
 * Returns the content of the last assistant message, or a fallback.
 */
function extractThreadSummary(result: RunResult): string {
  for (let i = result.messages.length - 1; i >= 0; i--) {
    const msg = result.messages[i];
    if (msg.role === "assistant" && msg.content.trim().length > 0) {
      return msg.content.trim();
    }
  }

  if (result.outcome.message) {
    return result.outcome.message;
  }

  return `Sub-agent completed with outcome: ${result.outcome.id}`;
}

/**
 * Resolve skill name strings to Skill objects from the available pool.
 * Silently skips names that don't match any loaded skill.
 */
function resolveSkills(names: string[], available: Skill[]): Skill[] {
  const byName = new Map(available.map(s => [s.name, s]));
  const resolved: Skill[] = [];
  for (const name of names) {
    const skill = byName.get(name);
    if (skill) {
      resolved.push(skill);
    }
  }
  return resolved;
}

/**
 * Resolve tool name strings to Tool objects from the available pool.
 * Silently skips names that don't match any loaded tool.
 */
function resolveTools(names: string[], available: Tool[]): Tool[] {
  const byName = new Map(available.map(t => [t.name, t]));
  const resolved: Tool[] = [];
  for (const name of names) {
    const tool = byName.get(name);
    if (tool) {
      resolved.push(tool);
    }
  }
  return resolved;
}

/**
 * Create a thread tool that spawns a sub-agent to handle a subtask.
 *
 * Unlike the route tool (which is a no-op intercepted by phases), the thread
 * tool actually executes: it calls the injected `spawnThread` function to
 * launch a new agent loop and returns the result to the calling phase.
 */
export function createThreadTool(
  availableTools: Tool[],
  availableSkills: Skill[],
  spawnThread: SpawnThreadFn,
): Tool<ThreadToolArgs> {
  return {
    name: ThreadTool,
    description: buildThreadDescription(availableSkills),
    parameters: Type.Object({
      prompt: Type.String({
        description: "Clear, self-contained instructions for the sub-agent. Include all context needed — the sub-agent does NOT see the current conversation.",
      }),
      tools: Type.Optional(Type.Array(
        Type.String(),
        { description: "Tool names to make available to the sub-agent. Only include tools the subtask actually needs." },
      )),
      skills: Type.Optional(Type.Array(
        Type.String(),
        { description: "Skill names to make available to the sub-agent. Only include skills the subtask actually needs." },
      )),
      limits: Type.Optional(Type.Object({
        maxIterations: Type.Optional(Type.Number({
          description: "Maximum phase iterations the sub-agent is allowed. Default: 50.",
        })),
      }, { description: "Resource limits for the sub-agent. Omit to inherit defaults." })),
    }),
    execute: async (args, context: ToolContext): Promise<ToolResult> => {
      const { prompt, tools: toolNames, skills: skillNames, limits } = args;

      if (!prompt || prompt.trim().length === 0) {
        return {
          toolCallId: context.toolCallId,
          toolName: ThreadTool,
          ok: false,
          content: "",
          error: "Thread prompt must not be empty.",
        };
      }

      // Resolve tool names to Tool objects
      const resolvedTools = toolNames
        ? resolveTools(toolNames, availableTools)
        : undefined;

      // Resolve skill names to Skill objects
      const resolvedSkills = skillNames
        ? resolveSkills(skillNames, context.skills)
        : undefined;

      const result = await spawnThread({
        prompt: prompt.trim(),
        ...(resolvedTools && resolvedTools.length > 0 ? { tools: resolvedTools } : {}),
        ...(resolvedSkills && resolvedSkills.length > 0 ? { skills: resolvedSkills } : {}),
        ...(limits ? { limits } : {}),
      });

      const summary = extractThreadSummary(result);
      const ok = result.outcome.id !== "aborted";

      return {
        toolCallId: context.toolCallId,
        toolName: ThreadTool,
        ok,
        content: JSON.stringify({
          summary,
          outcome: result.outcome.id,
          sessionId: result.sessionId,
          messageCount: result.messages.length,
        }),
        ...(ok ? {} : { error: result.outcome.message || `Sub-agent ended with outcome: ${result.outcome.id}` }),
      };
    },
  };
}

/**
 * Check if a tool call is a thread tool call.
 */
export function isThreadToolCall(toolCall: { name: string }): boolean {
  return toolCall.name === ThreadTool;
}
