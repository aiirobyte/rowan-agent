import Type from "typebox";
import type { Tool } from "../../types";
import type { Phase } from "../../harness/phases/types";
import { buildStructuredSection } from "../context/resource-formatter";

export const PhaseRouteTool = "route";

export type RouteToolArgs = {
  decision: Array<{ phase: string; reason?: string; payload?: unknown }>;
  instruction?: string;
};

function buildPhaseEntry(p: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>): Record<string, string> {
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

function buildRouteDescription(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[]): string {
  const phasesBlock = buildStructuredSection("phase", [
    ...availablePhases.map(buildPhaseEntry),
    { id: "stop", description: "Terminate the workflow and return final result to the user" },
  ]);

  return [
    "Route execution to one or more phases concurrently, or stop execution.",
    "",
    "Rules:",
    "- `decision` lists phase executions; use phase 'stop' to terminate.",
    "- Each target may include `phase`, `reason`, `payload`.",
    "- A phase may appear multiple times as independent execution instances.",
    "- `payload` MUST match the phase's `payload_schema`",
    "- `instruction` is optional shared guidance for all phases.",
    "- Executions are independent and concurrent; order is irrelevant.",
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
export function createRouteTool(availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[]): Tool<RouteToolArgs> {
  const DecisionTarget = Type.Object({
    phase: Type.Union([
      ...availablePhases.map(p => Type.Literal(p.id)),
      Type.Literal("stop"),
    ]),
    reason: Type.Optional(Type.String({ description: "Brief reason for this decision" })),
    payload: Type.Optional(Type.Unknown({ description: "Structured input for the target phase" })),
  });

  return {
    name: PhaseRouteTool,
    description: buildRouteDescription(availablePhases),
    promptSnippet: "Route to next phase on completion.",
    promptGuidelines: [
      "Call route immediately when the phase is complete.",
    ],
    parameters: Type.Object({
      decision: Type.Array(DecisionTarget, { description: "Phase executions to start" }),
      instruction: Type.Optional(Type.String({ description: "Overall instruction, passed as context" })),
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

  // Extract decision array
  const decisionRaw = args.decision;
  let decision: RouteToolArgs["decision"] = [];

  if (Array.isArray(decisionRaw)) {
    decision = decisionRaw.map((d: unknown) => {
      const obj = d as Record<string, unknown>;
      return {
        phase: typeof obj?.phase === "string" ? obj.phase : "stop",
        reason: typeof obj?.reason === "string" ? obj.reason : undefined,
        payload: obj?.payload,
      };
    });
  }

  return {
    decision,
    instruction: typeof args.instruction === "string" ? args.instruction : undefined,
  };
}
