import Type from "typebox";
import type { Tool } from "../../types";
import type { Phase } from "../../harness/phases/types";
import { buildStructuredSection } from "../context/resource-formatter";

export const PhaseRouteTool = "route";

export type RouteToolArgs = {
  route: string;
  reason?: string;
  payload?: unknown;
};

function buildPhaseEntry(p: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input'>): Record<string, string> {
  const entry: Record<string, string> = { id: p.id, description: p.description };
  if (p.tools && p.tools.length > 0) {
    entry.available_tools = p.tools.join(", ");
  }
  if (p.skills && p.skills.length > 0) {
    entry.available_skills = p.skills.join(", ");
  }
  if (p.input && Object.keys(p.input).length > 0) {
    entry.required_input = Object.entries(p.input)
      .map(([key, desc]) => `- ${key}: ${desc}`)
      .join("\n");
  }
  return entry;
}

function buildRouteDescription(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input'>[]): string {
  const phasesBlock = buildStructuredSection("phase", [
    ...availablePhases.map(buildPhaseEntry),
    { id: "stop", description: "Terminate the workflow and return final result to the user" },
  ]);

  return [
    "Route to next phase or stop execution.",
    "",
    "Rules:",
    "- Always route to exactly one target phase id or 'stop'.",
    "- 'payload' must be JSON matching target phase input.",
    "",
    "<available_phases>",
    phasesBlock,
    "</available_phases>",
  ].join("\n");
}

/**
 * Create a route tool with the available phase IDs as valid route targets.
 * The execute function is a no-op placeholder - phase routing is handled by
 * intercepting route tool calls in each phase's run function.
 */
export function createRouteTool(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input'>[]): Tool<RouteToolArgs> {
  return {
    name: PhaseRouteTool,
    description: buildRouteDescription(availablePhases),
    promptSnippet: "Route to next phase on completion.",
    promptGuidelines: [
      "Call route immediately when the phase is complete.",
    ],
    parameters: Type.Object({
      route: Type.Union([
        ...availablePhases.map(p => Type.Literal(p.id)),
        Type.Literal("stop"),
      ], { description: "Target phase id or 'stop' to end" }),
      reason: Type.Optional(Type.String({ description: "Brief reason for routing decision" })),
      payload: Type.Optional(Type.Unknown({ description: "Structured input for next phase (must match required schema)" })),
    }),
    // No-op: this tool is intercepted by phases, never executed via tool execution
    execute: async (args, context) => ({
      toolCallId: context.toolCallId,
      toolName: PhaseRouteTool,
      ok: true,
      content: "",
    }),
  };
}

/** Extract route tool call from collected tool calls. Returns undefined if not found. */
export function extractRouteCall(toolCalls: Array<{ name: string; args: unknown }>): RouteToolArgs | undefined {
  const routeCall = toolCalls.find(t => t.name === PhaseRouteTool);
  if (!routeCall) return undefined;

  let args: Record<string, unknown>;
  if (typeof routeCall.args === "string") {
    try {
      args = JSON.parse(routeCall.args);
    } catch {
      return undefined;
    }
  } else {
    args = routeCall.args as Record<string, unknown>;
  }

  return {
    route: typeof args.route === "string" ? args.route : "stop",
    reason: typeof args.reason === "string" ? args.reason : undefined,
    payload: args.payload,
  };
}
