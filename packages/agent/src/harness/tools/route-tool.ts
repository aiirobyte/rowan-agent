import Type from "typebox";
import type { Tool } from "../../types";
import type { Phase } from "../../harness/phases/types";
import { phaseInputSchema } from "../../harness/phases/input";
import { buildStructuredSection } from "../context/resource-formatter";

export const PhaseRouteTool = "route";

export type RouteToolArgs = {
  decision: Array<{ phase: string; reason?: string; payload?: unknown }>;
  instruction?: string;
};

function buildPhaseEntry(p: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>): Record<string, string> {
  const entry: Record<string, string> = { name: p.name, description: p.description };
  if (p.tools && p.tools.length > 0) {
    entry.available_tools = p.tools.join(", ");
  }
  if (p.input !== undefined) {
    entry.payload_schema = JSON.stringify(phaseInputSchema(p.input));
  } else {
    entry.payload_schema = "any JSON-safe value";
  }
  return entry;
}

function buildRouteDescription(availablePhases: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[]): string {
  const routablePhases = availablePhases.filter(({ name }) => name !== "stop");
  const phasesBlock = buildStructuredSection("phase", [
    ...routablePhases.map(buildPhaseEntry),
    {
      name: "stop",
      description: "Complete the task; when the current reply has no final user-facing conclusion, the built-in Stop Phase provides one",
    },
  ]);

  return [
    "Route is optional. Omit it when the current reply should wait for more user input and remain in the current phase.",
    "",
    "Rules:",
    "- Call route only to continue execution immediately in one or more phases, or to explicitly stop.",
    "- `decision` lists phase executions; a single target equal to the current phase starts another iteration of that phase.",
    "- `stop` completes the task; when the current reply has no final user-facing conclusion, the built-in Stop Phase provides one. Use it only when the task is complete and no further user input is needed, and make it the only target.",
    "- Each target may include `phase`, `reason`, `payload`.",
    "- A phase may appear multiple times as independent execution instances.",
    "- `payload` MUST match the phase's `payload_schema`",
    "- `instruction` is optional shared guidance for all phases.",
    "- Executions are independent and concurrent; order is irrelevant.",
    "- Do not call route in the same response as an ordinary tool; finish ordinary tools first.",
    "",
    "<available_phases>",
    phasesBlock,
    "</available_phases>",
  ].join("\n");
}

/**
 * Create a route tool with the available phase names as valid route targets.
 * The execute function is a no-op placeholder - phase routing is handled by
 * intercepting route tool calls in each phase's run function.
 */
export function createRouteTool(availablePhases: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[]): Tool<RouteToolArgs> {
  const routablePhases = availablePhases.filter(({ name }) => name !== "stop");
  const decisionTargets = [
    ...routablePhases.map((phase) => Type.Object({
      phase: Type.Literal(phase.name),
      reason: Type.Optional(Type.String({ description: "Brief reason for this decision" })),
      payload: Type.Optional(
        phase.input === undefined
          ? Type.Unknown({ description: "Any JSON-safe value for the target phase" })
          : phaseInputSchema(phase.input),
      ),
    })),
    Type.Object({
      phase: Type.Literal("stop"),
      reason: Type.Optional(Type.String({ description: "Brief reason for this decision" })),
      payload: Type.Optional(Type.Unknown({ description: "Optional stop payload" })),
    }),
  ];

  return {
    name: PhaseRouteTool,
    description: buildRouteDescription(availablePhases),
    promptSnippet: "Route is optional: omit it to remain in the current phase and wait for user input; use it for immediate phase execution, or use stop to complete the task and obtain a final user-facing conclusion when needed.",
    promptGuidelines: [
      "Do not call route together with ordinary tools.",
      "Use route(stop) only when the current user request or task is complete; the Stop Phase will provide the final user-facing conclusion.",
    ],
    parameters: Type.Object({
      decision: Type.Array(Type.Union(decisionTargets), { description: "Phase executions to start", minItems: 1 }),
      instruction: Type.Optional(Type.String({ description: "Overall instruction, passed as context" })),
    }),
    // No-op: this tool is intercepted by phases, never executed via tool execution
    execute: async (_, context) => ({
      toolCallId: context.toolCallId,
      toolName: PhaseRouteTool,
      ok: true,
      content: "",
    }),
  };
}

/** Extract route tool call from collected tool calls. Returns undefined if not found. */
export function extractRouteCall(toolCalls: Array<{ name: string; args: unknown }>): RouteToolArgs | undefined {
  const routeCalls = toolCalls.filter(t => t.name === PhaseRouteTool);
  if (routeCalls.length !== 1) return undefined;
  const routeCall = routeCalls[0]!;

  let args: Record<string, unknown>;
  if (typeof routeCall.args === "string") {
    try {
      const parsed: unknown = JSON.parse(routeCall.args);
      args = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return { decision: [{ phase: "" }] };
    }
  } else {
    args = routeCall.args !== null && typeof routeCall.args === "object"
      ? routeCall.args as Record<string, unknown>
      : {};
  }

  // Extract decision array
  const decisionRaw = args.decision;
  let decision: RouteToolArgs["decision"] = [];

  if (Array.isArray(decisionRaw)) {
    decision = decisionRaw.map((d: unknown) => {
      const obj = d !== null && typeof d === "object" ? d as Record<string, unknown> : {};
      return {
        // Empty phase is an invalid target sentinel. Never coerce malformed
        // input to stop: only an explicit, valid stop target may terminate.
        phase: typeof obj.phase === "string" ? obj.phase : "",
        reason: typeof obj?.reason === "string" ? obj.reason : undefined,
        payload: obj?.payload,
      };
    });
  } else if (decisionRaw !== undefined) {
    decision = [{ phase: "" }];
  }

  return {
    decision,
    instruction: typeof args.instruction === "string" ? args.instruction : undefined,
  };
}
