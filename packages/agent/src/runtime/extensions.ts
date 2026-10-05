import { DEFAULT_PHASE_ID } from "../harness/phases/core-phases";
import { mergeSkills, selectNamedResources } from "../harness/resource-selection";
import { buildContextDescription } from "../harness/context/resource-formatter";
import type { ResolvedAgentContext, AfterToolCall, BeforeToolCall, Tool, ToolExecutionResult } from "./contracts";
import type { ConfigurationSnapshot } from "./configuration-snapshot";
import type { JsonValue } from "../runtime-events";
import { projectTool } from "./model-context";
import type { BeforePhaseHook, AfterPhaseHook, BeforePromptHook } from "../loop/types";
import type { AgentContext, ToolResult } from "../types";
import { createRuntimeCoreTools } from "./core-tools";

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
  options: Readonly<{ toolArchiveDir?: string }> = {},
): ExtensionAssembly {
  // Extension contributions reach this assembly the way every other resource
  // does: through the Resource View's implicit Extension source. The assembly
  // never adds a second copy of them.
  const coreTools = createRuntimeCoreTools({
    root: snapshot.cwd,
    ...(options.toolArchiveDir ? { archiveDir: options.toolArchiveDir } : {}),
  });
  const replacingNames = new Set(
    snapshot.resources.tools
      .filter((tool) => tool.core)
      .map((tool) => tool.name),
  );
  const tools = [
    ...snapshot.resources.tools,
    ...coreTools.filter((tool) => !replacingNames.has(tool.name)),
  ];
  const context = resolveDefinitionContext(snapshot, tools);
  return {
    context,
    beforePhase: (phaseId, input) => runner.emitBeforePhase(phaseId, input),
    afterPhase: (phaseId, output) => runner.emitAfterPhase(phaseId, output),
    beforePrompt: (phaseId, input) => runner.emitBeforePrompt(phaseId, input),
    beforeToolCall: async (input) => {
      const tool = projectTool(input.tool, input.context.agentId, input.context.runId);
      const decision = await runner.emitBeforeToolCall(tool, input.args, {
        runId: input.context.runId,
        agentId: input.context.agentId,
        toolCallId: input.context.toolCallId,
        metadata: input.context.runMetadata,
        answer: input.answer,
        scope: input.context.scope,
        turn: input.context.turn,
      });
      if (decision.interaction !== undefined) {
        return { interaction: decision.interaction };
      }
      return decision.allow ? { allow: true } : { allow: false, reason: decision.reason ?? "Extension hook rejected the Tool." };
    },
    afterToolCall: async (input) => {
      const tool = projectTool(input.tool, input.context.agentId, input.context.runId);
      const result = await runner.emitAfterToolCall(
        tool,
        toLoopResult(input.result, input.context.toolCallId, input.tool.name),
        {
          runId: input.context.runId,
          agentId: input.context.agentId,
          toolCallId: input.context.toolCallId,
          metadata: input.context.runMetadata,
          scope: input.context.scope,
          turn: input.context.turn,
        },
      );
      return fromLoopResult(result);
    },
    setContext: (context) => {
      runner.currentContext = context;
    },
  };
}

function resolveDefinitionContext(
  snapshot: ConfigurationSnapshot,
  assembled: readonly Tool[],
): ResolvedAgentContext {
  const coreTools = assembled.filter((tool) => tool.core);
  const authoredTools = assembled.filter((tool) => !tool.core);
  const authoredSelection = snapshot.definition.tools
    ? snapshot.definition.tools.filter((name) => !assembled.some((t) => t.core && t.name === name))
    : undefined;
  const tools = [
    ...selectNamedResources(authoredTools, authoredSelection, "Tool"),
    ...coreTools,
  ];
  const skills = mergeSkills(
    selectNamedResources(snapshot.resources.skills, snapshot.definition.skills, "Skill"),
    snapshot.definition.bundledSkills,
  );
  // Host-supplied Context is part of the same System Prompt Context block as
  // the Definition's declared Context. It is never a separate message, so the
  // System Prompt remains the single Context injection seam.
  const contexts = [
    ...selectNamedResources(snapshot.contexts, snapshot.definition.contexts, "Context"),
    ...snapshot.additionalContexts,
  ];
  const phaseCandidates = [...(snapshot.resources.phases?.phases.values() ?? [])];
  const corePhases = phaseCandidates.filter((phase) => phase.core);
  const authoredPhases = phaseCandidates.filter((phase) => !phase.core);
  const authoredPhaseIds = snapshot.definition.phases?.phaseIds
    ? snapshot.definition.phases.phaseIds.filter((name) => !corePhases.some((p) => p.name === name))
    : undefined;
  const selectedPhases = [
    ...corePhases,
    ...selectNamedResources(authoredPhases, authoredPhaseIds, "Phase"),
  ];
  const phases = new Map(selectedPhases.map((phase) => [phase.name, phase]));
  const requestedEntry = snapshot.definition.phases
    ? snapshot.definition.phases.entryPhaseId
    : snapshot.resources.phases?.entryPhaseId ?? null;
  const entryPhaseId = requestedEntry === DEFAULT_PHASE_ID
    ? DEFAULT_PHASE_ID
    : requestedEntry && phases.has(requestedEntry)
    ? requestedEntry
    : null;
  return {
    systemPrompt: [snapshot.definition.prompt, buildContextDescription(contexts)]
      .filter((section) => section.length > 0)
      .join("\n\n"),
    tools,
    skills,
    phases: { phases, entryPhaseId },
    ...(snapshot.cwd ? { cwd: snapshot.cwd } : {}),
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
