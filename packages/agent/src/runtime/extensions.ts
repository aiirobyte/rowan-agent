import { buildContextDescription } from "../harness/context/resource-formatter";
import type { ResolvedAgentContext, AfterToolCall, BeforeToolCall, Tool } from "./contracts";
import type { ConfigurationSnapshot } from "./configuration-snapshot";
import type { JsonValue } from "../runtime-events";
import type { BeforePhaseHook, AfterPhaseHook, BeforePromptHook, AgentContext } from "../loop/types";
import type { ToolResult } from "@rowan-agent/models";
import { CORE_TOOL_ORDER, createRuntimeCoreTools } from "./core-tools";

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
  snapshot: ConfigurationSnapshot,
  runner: import("../extensions").ExtensionRunner,
  options: Readonly<{ toolArchiveDir?: string; scope?: import("@rowan-agent/models").ScopeRef }> = {},
): ExtensionAssembly {
  // Extension contributions reach this assembly the way every other resource
  // does: through the Resource View's implicit Extension source. The assembly
  // never adds a second copy of them.
  const runtimeCoreTools = createRuntimeCoreTools({
    root: snapshot.cwd,
    ...(options.toolArchiveDir ? { archiveDir: options.toolArchiveDir } : {}),
  });
  const selectedCoreNames = new Set(snapshot.resources.coreToolNames ?? CORE_TOOL_ORDER);
  const selectedByName = new Map(snapshot.resources.tools.map((tool) => [tool.name, tool]));
  const builtInNames = new Set(runtimeCoreTools.map(({ name }) => name));
  const tools = [
    ...runtimeCoreTools.flatMap((tool) => {
      if (!selectedCoreNames.has(tool.name)) return [];
      return [selectedByName.get(tool.name) ?? tool];
    }),
    ...snapshot.resources.tools.filter((tool) => tool.core && !builtInNames.has(tool.name)),
    ...snapshot.resources.tools.filter((tool) => !tool.core),
  ];
  const context = resolveDefinitionContext(snapshot, tools, runner, options.scope);
  return {
    context,
    beforePhase: (phaseId, input) => runner.emitBeforePhase(phaseId, input),
    afterPhase: (phaseId, output) => runner.emitAfterPhase(phaseId, output),
    beforePrompt: (phaseId, input) => runner.emitBeforePrompt(phaseId, input),
    beforeToolCall: async (input) => {
      const decision = await runner.emitBeforeToolCall(input.tool, input.args, {
        runId: input.context.runId,
        agentId: input.context.agentId,
        toolCallId: input.context.toolCallId,
        metadata: input.context.runMetadata,
        ...(input.context.agentMetadata === undefined ? {} : { agentMetadata: input.context.agentMetadata }),
        answer: input.answer,
        scope: input.context.scope,
        turn: input.context.turn,
        ...(input.context.phase === undefined ? {} : { phase: input.context.phase }),
      });
      if (decision.interaction !== undefined) {
        return { interaction: decision.interaction };
      }
      return decision.allow ? { allow: true } : { allow: false, reason: decision.reason ?? "Extension hook rejected the Tool." };
    },
    afterToolCall: async (input) => {
      return runner.emitAfterToolCall(
        input.tool,
        input.result,
        {
          runId: input.context.runId,
          agentId: input.context.agentId,
          toolCallId: input.context.toolCallId,
          metadata: input.context.runMetadata,
          scope: input.context.scope,
          turn: input.context.turn,
          ...(input.context.phase === undefined ? {} : { phase: input.context.phase }),
        },
      );
    },
    setContext: (context) => {
      runner.currentContext = context;
    },
  };
}

function resolveDefinitionContext(
  snapshot: ConfigurationSnapshot,
  assembled: readonly Tool[],
  runner?: import("../extensions").ExtensionRunner,
  scope?: import("@rowan-agent/models").ScopeRef,
): ResolvedAgentContext {
  const skills = [...snapshot.resources.skills];
  // Definition-selected Context goes into the System Prompt. Turn-scoped
  // host-supplied Contexts (additionalContexts) ride on the turn's user message
  // instead, keeping the System Prompt stable across turns.
  const contexts = snapshot.contexts;
  const selectedPhases = [...(snapshot.resources.phases?.phases.values() ?? [])].map((phase) => {
    const handler = runner?.getPhaseHandler(phase.name, scope);
    return handler && !phase.run ? { ...phase, run: handler } : phase;
  });
  const phases = new Map(selectedPhases.map((phase) => [phase.name, phase]));
  const requestedEntry = snapshot.resources.phases?.entryPhaseId ?? null;
  const entryPhaseId = requestedEntry && phases.has(requestedEntry) ? requestedEntry : null;
  return {
    systemPrompt: [snapshot.definition.prompt, buildContextDescription(contexts)]
      .filter((section) => section.length > 0)
      .join("\n\n"),
    tools: assembled,
    skills,
    phases: { phases, entryPhaseId },
    ...(snapshot.cwd ? { cwd: snapshot.cwd } : {}),
  };
}
