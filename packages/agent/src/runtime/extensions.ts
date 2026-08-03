import type { RegisteredTool } from "../extensions/types";
import type { PhaseRegistry } from "../harness/phases/types";
import { DEFAULT_PHASE_ID } from "../harness/phases/default";
import { selectNamedResources } from "../harness/resource-selection";
import { buildContextDescription } from "../harness/context/resource-formatter";
import type { AgentConfig, ResolvedAgentContext, AfterToolCall, BeforeToolCall, Tool, ToolInvocationContext, ToolExecutionResult } from "./contracts";
import type { JsonValue } from "../runtime-events";
import { projectTool } from "./model-context";
import type { BeforePhaseHook, AfterPhaseHook, BeforePromptHook } from "../loop/types";
import type { AgentContext, ToolResult } from "../types";

export type ExtensionAssembly = Readonly<{
  context: ResolvedAgentContext;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  /** Bind the mutable loop context used by ExtensionAPI context helpers. */
  setContext?: (context: AgentContext) => void;
}>;

/** Assemble already-activated Runtime-global Extensions for one immutable
 * configuration. No Extension factory is executed here. */
export function assembleRegisteredExtensions(
  config: AgentConfig,
  runner: import("../extensions").ExtensionRunner,
): ExtensionAssembly {

  const extensionTools = runner.getAllRegisteredTools().map(adaptExtensionTool);
  const tools = [...config.resources.tools];
  const names = new Set(tools.map((tool) => tool.name));
  for (const tool of extensionTools) {
    if (names.has(tool.name)) throw new TypeError(`Extension Tool collides with Context Tool "${tool.name}"`);
    names.add(tool.name);
    tools.push(tool);
  }

  const extensionPhases = runner.createPhaseRegistry({ entryPhaseId: null });
  const phases = mergePhases(config.resources.phases, extensionPhases);
  const context = resolveDefinitionContext(config, { tools, phases });
  return {
    context,
    beforePhase: (phaseId, input) => runner.emitBeforePhase(phaseId, input),
    afterPhase: (phaseId, output) => runner.emitAfterPhase(phaseId, output),
    beforePrompt: (phaseId, input) => runner.emitBeforePrompt(phaseId, input),
    beforeToolCall: async (input) => {
      const tool = projectTool(input.tool, input.context.agentId, input.context.runId);
      const decision = await runner.emitBeforeToolCall(tool, input.args);
      return decision.allow ? { allow: true } : { allow: false, reason: decision.reason ?? "Extension hook rejected the Tool." };
    },
    afterToolCall: async (input) => {
      const tool = projectTool(input.tool, input.context.agentId, input.context.runId);
      const result = await runner.emitAfterToolCall(tool, toLoopResult(input.result, input.context.toolCallId, input.tool.name));
      return fromLoopResult(result);
    },
    setContext: (context) => {
      runner.currentContext = context;
    },
  };
}

function resolveDefinitionContext(
  config: AgentConfig,
  assembled: Readonly<{ tools?: readonly Tool[]; phases?: PhaseRegistry }> = {},
): ResolvedAgentContext {
  const tools = selectNamedResources(
    assembled.tools ?? config.resources.tools,
    config.definition.tools,
    "Tool",
  );
  const skills = selectNamedResources(
    config.resources.skills,
    config.definition.skills,
    "Skill",
  );
  const contexts = selectNamedResources(
    config.resources.contexts ?? [],
    config.definition.context,
    "Context",
  );
  const candidateRegistry = assembled.phases ?? config.resources.phases;
  const selectedPhases = selectNamedResources(
    [...(candidateRegistry?.phases.values() ?? [])],
    config.definition.phases?.phaseIds,
    "Phase",
  );
  const phases = new Map(selectedPhases.map((phase) => [phase.name, phase]));
  const requestedEntry = config.definition.phases
    ? config.definition.phases.entryPhaseId
    : candidateRegistry?.entryPhaseId ?? null;
  const entryPhaseId = requestedEntry === DEFAULT_PHASE_ID
    ? DEFAULT_PHASE_ID
    : requestedEntry && phases.has(requestedEntry)
    ? requestedEntry
    : null;
  if (requestedEntry && requestedEntry !== DEFAULT_PHASE_ID && !phases.has(requestedEntry)) {
    console.warn(`Phase entry "${requestedEntry}" is not available; Rowan will use "default".`);
  }
  return {
    systemPrompt: [config.definition.content, buildContextDescription(contexts)]
      .filter((section) => section.length > 0)
      .join("\n\n"),
    tools,
    skills,
    phases: { phases, entryPhaseId },
  };
}

function mergePhases(base: PhaseRegistry | undefined, extension: PhaseRegistry): PhaseRegistry | undefined {
  if (!base && extension.phases.size === 0) return undefined;
  const phases = new Map(base?.phases ?? []);
  for (const [name, phase] of extension.phases) {
    if (phases.has(name)) throw new TypeError(`Extension Phase collides with Context Phase "${name}"`);
    phases.set(name, phase);
  }
  return {
    phases,
    entryPhaseId: base?.entryPhaseId ?? extension.entryPhaseId,
  };
}

function adaptExtensionTool(input: RegisteredTool): Tool {
  const definition = input.definition;
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters as never,
    execute: async (args: JsonValue, _context: ToolInvocationContext, signal: AbortSignal): Promise<ToolExecutionResult> => {
      const result = await definition.execute(args, signal);
      const content = JSON.parse(JSON.stringify(result.content)) as JsonValue;
      return result.isError
        ? { ok: false, content, error: "Extension Tool failed." }
        : { ok: true, content };
    },
  };
}

function toLoopResult(result: ToolExecutionResult, toolCallId: string, toolName: string): ToolResult {
  return {
    toolCallId,
    toolName,
    ok: result.ok,
    content: result.content,
    ...(!result.ok ? { error: result.error } : {}),
  };
}

function fromLoopResult(result: ToolResult): ToolExecutionResult {
  return result.ok
    ? { ok: true, content: result.content as JsonValue }
    : { ok: false, content: result.content as JsonValue, error: result.error ?? "Extension hook rejected the Tool result." };
}
