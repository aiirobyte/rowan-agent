import { createExtensionRunner } from "../extensions";
import type { LoadedExtension, RegisteredTool } from "../extensions/types";
import type { PhaseRegistry } from "../harness/phases/types";
import type { AgentConfig, AgentDefinitionContext, AfterToolCall, BeforeToolCall, Tool, ToolInvocationContext, ToolExecutionResult } from "./contracts";
import type { JsonValue } from "../runtime-events";
import { projectTool } from "./model-context";
import type { BeforePhaseHook, AfterPhaseHook, BeforePromptHook } from "../loop/types";
import type { AgentContext, ToolResult } from "../types";

export type ExtensionAssembly = Readonly<{
  context: AgentDefinitionContext;
  beforePhase?: BeforePhaseHook;
  afterPhase?: AfterPhaseHook;
  beforePrompt?: BeforePromptHook;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  /** Bind the mutable loop context used by ExtensionAPI context helpers. */
  setContext?: (context: AgentContext) => void;
}>;

/** Load extensions once and assemble their tools, phases, and hooks behind the Runtime seam. */
export async function assembleExtensions(
  config: AgentConfig,
): Promise<ExtensionAssembly> {
  if (!config.extensions?.length) return { context: config.context };

  const runner = createExtensionRunner({ cwd: config.cwd });
  await runner.loadExtensions([...config.extensions] as LoadedExtension[]);
  runner.bind();

  const extensionTools = runner.getAllRegisteredTools().map(adaptExtensionTool);
  const tools = [...config.context.tools];
  const names = new Set(tools.map((tool) => tool.name));
  for (const tool of extensionTools) {
    if (names.has(tool.name)) throw new TypeError(`Extension Tool collides with Context Tool "${tool.name}"`);
    names.add(tool.name);
    tools.push(tool);
  }

  const extensionPhases = runner.createPhaseRegistry({ entryPhaseId: null });
  const phases = mergePhases(config.context.phases, extensionPhases);
  return {
    context: { ...config.context, tools, ...(phases ? { phases } : {}) },
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
