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

function buildPhaseEntry(p: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills'>): Record<string, string> {
  const entry: Record<string, string> = { id: p.id, description: p.description };
  if (p.tools && p.tools.length > 0) {
    entry.available_tools = p.tools.join(", ");
  }
  if (p.skills && p.skills.length > 0) {
    entry.available_skills = p.skills.join(", ");
  }
  return entry;
}

function buildRouteDescription(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills'>[]): string {
  const phasesBlock = buildStructuredSection("phase", [
    ...availablePhases.map(buildPhaseEntry),
    { id: "stop", description: "End execution and return the result to the user" },
  ]);

  return [
    "Route to the next phase when the current phase is complete.",
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
export function createRouteTool(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills'>[]): Tool<RouteToolArgs> {
  return {
    name: PhaseRouteTool,
    description: buildRouteDescription(availablePhases),
    parameters: Type.Object({
      route: Type.Union([
        ...availablePhases.map(p => Type.Literal(p.id)),
        Type.Literal("stop"),
      ], { description: "Target phase id, or 'stop' to end" }),
      reason: Type.Optional(Type.String({ description: "Brief reason for the routing decision" })),
      payload: Type.Optional(Type.Unknown({ description: "Structured data to pass to the next phase" })),
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

  const args = routeCall.args as Record<string, unknown>;
  return {
    route: typeof args.route === "string" ? args.route : "stop",
    reason: typeof args.reason === "string" ? args.reason : undefined,
    payload: args.payload,
  };
}
