import Type from "typebox";
import type { Tool } from "../../types";
import type { Phase } from "../../harness/phases/types";
import { buildStructuredSection } from "../context/resource-formatter";

export const PhaseRouteTool = "route";

export type RouteToolArgs = {
  route: string;
  reason?: string;
};

function buildRouteDescription(availablePhases: Pick<Phase, 'id' | 'name' | 'description'>[]): string {
  const phasesBlock = buildStructuredSection("phase", [
    ...availablePhases.map(p => ({ id: p.id, description: p.description })),
    { id: "stop", description: "End execution and return the result to the user" },
  ]);

  return [
    "Decide the next step in the workflow by routing to a specific phase.",
    "",
    "You MUST call this tool when you have completed the current phase's work",
    "and are ready to hand off to the next phase or end execution.",
    "",
    "<available_phases>",
    phasesBlock,
    "</available_phases>",
    "",
    "Choose the phase that best matches what needs to happen next.",
    "Use the 'reason' field to briefly explain your routing decision.",
  ].join("\n");
}

/**
 * Create a route tool with the available phase IDs as valid route targets.
 * The execute function is a no-op placeholder - phase routing is handled by
 * intercepting route tool calls in each phase's run function.
 */
export function createRouteTool(availablePhases: Pick<Phase, 'id' | 'name' | 'description'>[]): Tool<RouteToolArgs> {
  return {
    name: PhaseRouteTool,
    description: buildRouteDescription(availablePhases),
    parameters: Type.Object({
      route: Type.Union([
        ...availablePhases.map(p => Type.Literal(p.id)),
        Type.Literal("stop"),
      ], { description: "Target phase id, or 'stop' to end" }),
      reason: Type.Optional(Type.String({ description: "Brief reason for the routing decision" })),
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
  };
}
