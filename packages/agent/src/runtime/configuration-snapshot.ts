import type { ModelConfig, ModelRef, StreamFn } from "@rowan-agent/models";
import type {
  AgentDefinition,
  PhaseRegistrySelection,
} from "../harness/definitions";
import { mergeSkills, selectResources, type ResourceSelection } from "../harness/resource-selection";
import type { Phase, PhaseRegistry } from "../harness/phases/types";
import {
  CORE_PHASE_ORDER,
  CORE_PHASE_NAMES,
  DEFAULT_PHASE_ID,
  isAutoInvocablePhase,
} from "../harness/phases/core-phases";
import { CORE_TOOL_NAMES, CORE_TOOL_ORDER } from "./core-tools";
import type { ContextCandidate } from "./contracts";
import { validateMaxAttempts } from "../loop/types";
import {
  ResourceRegistry,
  type ResourceKind,
  type ResourceRef,
  type ResourceView,
} from "./resource-registry";
import { PhaseRouteTool } from "../harness/tools";

export type DefinitionLayer = Readonly<{
  description?: string;
  prompt?: string;
  model?: ModelRef;
  tools?: readonly string[];
  skills?: readonly string[];
  phases?: PhaseRegistrySelection;
}>;

export type AgentConfiguration = Readonly<{
  identity: string;
  definition: Readonly<{ name: string; layer?: DefinitionLayer }>;
  resourceView: ResourceView;
  contexts?: readonly ContextCandidate[];
  /** Trusted Host-owned Contexts rendered as durable user messages. */
  additionalContexts?: readonly ContextCandidate[];
  cwd?: string;
  maxAttempts?: number;
  model: ModelConfig | ModelRef;
  stream?: StreamFn;
}>;

export type ConfigurationSnapshot = Readonly<{
  identity: string;
  definition: AgentDefinition;
  resources: Readonly<{
    tools: readonly import("./contracts").Tool[];
    /** Rowan-generated Core Tools selected for this Run, in execution order. */
    coreToolNames?: readonly string[];
    skills: readonly import("../protocol").Skill[];
    phases?: PhaseRegistry;
    revisions: Readonly<Record<ResourceKind, readonly string[]>>;
    refs: Readonly<Record<ResourceKind, readonly ResourceRef[]>>;
  }>;
  contexts: readonly ContextCandidate[];
  additionalContexts: readonly ContextCandidate[];
  resourceView: ResourceView;
  cwd?: string;
  maxAttempts?: number;
  model: ModelConfig | ModelRef;
  stream?: StreamFn;
}>;

/** Resolve one Definition request into one immutable, source-qualified snapshot. */
export function resolveConfigurationSnapshot(
  registry: ResourceRegistry,
  input: AgentConfiguration,
): ConfigurationSnapshot {
  validateMaxAttempts(input.maxAttempts);
  const resolved = registry.resolveView(input.resourceView);
  const base = resolved.agents.find(({ name }) => name === input.definition.name);
  if (!base) {
    throw new Error(`Agent Definition "${input.definition.name}" is not available in the Resource View.`);
  }
  const layer = input.definition.layer;
  const definition = applyDefinitionLayer(base, layer);

  const contextSelection = selectResources({
    kind: "Context",
    candidates: input.contexts ?? [],
    selection: base.contexts,
  });
  const additionalContexts = deduplicateContexts(input.additionalContexts ?? [], contextSelection.selected);

  const toolSelection = resolveLayeredSelection(
    "Tool",
    resolved.tools.filter(({ name }) => name !== PhaseRouteTool),
    base.tools,
    layer?.tools,
    CORE_TOOL_ORDER,
  );
  const tools = toolSelection.selected.map((tool) =>
    CORE_TOOL_NAMES.has(tool.name) ? { ...tool, core: true } : tool);
  const coreToolNames = CORE_TOOL_ORDER.filter((name) => toolSelection.names.has(name));

  const skillSelection = resolveLayeredSelection(
    "Skill",
    resolved.skills,
    base.skills,
    layer?.skills,
  );
  const skills = mergeSkills(skillSelection.selected, definition.bundledSkills);

  const phases = resolvePhases(resolved.phases, base, layer);
  const selectedContextNames = [...contextSelection.names];

  warnAll([
    ...contextSelection.warnings,
    ...toolSelection.warnings,
    ...skillSelection.warnings,
    ...phases.warnings,
  ]);

  const effectiveDefinition: AgentDefinition = {
    ...definition,
    tools: [...toolSelection.names],
    skills: [...skillSelection.names],
    phases: {
      entryPhaseId: phases.entryPhaseId,
      phaseIds: [...phases.names],
    },
    contexts: selectedContextNames,
  };
  return {
    identity: input.identity,
    definition: effectiveDefinition,
    resources: {
      tools,
      coreToolNames,
      skills,
      phases: phases.registry,
      revisions: resolved.revisions,
      refs: {
        agent: selectedRefs(resolved.refs.agent, [base.name]),
        tool: selectedRefs(resolved.refs.tool, tools.map(({ name }) => name)),
        skill: selectedRefs(resolved.refs.skill, skills.map(({ name }) => name)),
        phase: selectedRefs(resolved.refs.phase, [...phases.registry.phases.keys()]),
      },
    },
    contexts: contextSelection.selected,
    additionalContexts,
    resourceView: input.resourceView,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...("stream" in input && input.stream
      ? { model: layer?.model ?? input.model, stream: input.stream }
      : { model: layer?.model ?? input.model }),
  } as ConfigurationSnapshot;
}

/** Whether one stored configuration is already a resolved snapshot. A snapshot
 * is used as it stands; a request is resolved against the current sources. */
export function isConfigurationSnapshot(
  config: AgentConfiguration | ConfigurationSnapshot,
): config is ConfigurationSnapshot {
  return "resources" in config;
}

function applyDefinitionLayer(base: AgentDefinition, layer: DefinitionLayer | undefined): AgentDefinition {
  if (!layer) return { ...base };
  return {
    ...base,
    ...(layer.description === undefined ? {} : { description: layer.description }),
    ...(layer.prompt === undefined ? {} : { prompt: layer.prompt }),
    ...(layer.model === undefined ? {} : { model: layer.model }),
  };
}

function deduplicateContexts(
  additional: readonly ContextCandidate[],
  existing: readonly ContextCandidate[] = [],
): ContextCandidate[] {
  const contexts: ContextCandidate[] = [];
  const seen = new Set(existing.map(({ name }) => name));
  for (const context of additional) {
    if (seen.has(context.name)) continue;
    seen.add(context.name);
    contexts.push(context);
  }
  return contexts;
}

function resolveLayeredSelection<T extends { name: string; core?: boolean }>(
  kind: "Tool" | "Skill" | "Phase",
  candidates: readonly T[],
  base: readonly string[] | undefined,
  layer: readonly string[] | undefined,
  coreNames?: readonly string[],
): ResourceSelection<T> {
  const selected = selectResources({
    kind,
    candidates,
    selection: base,
    ...(coreNames === undefined ? {} : { coreNames }),
  });
  return layer === undefined
    ? selected
    : withWarnings(selectResources({
        kind,
        candidates,
        selection: layer,
        parent: [...selected.names],
        ...(coreNames === undefined ? {} : { coreNames }),
      }), selected.warnings);
}

function resolvePhases(
  candidates: readonly Phase[],
  base: AgentDefinition,
  layer: DefinitionLayer | undefined,
): Readonly<{
  registry: PhaseRegistry;
  names: ReadonlySet<string>;
  entryPhaseId: string | null;
  warnings: readonly string[];
}> {
  const coreCandidates = candidates.map((phase) =>
    CORE_PHASE_NAMES.has(phase.name) ? { ...phase, core: true } : phase);
  const narrowed = resolveLayeredSelection(
    "Phase",
    coreCandidates,
    base.phases?.phaseIds,
    layer?.phases?.phaseIds,
  );
  const byName = new Map(narrowed.selected.map((phase) => [phase.name, phase]));
  const selectedValues = [
    ...CORE_PHASE_ORDER.flatMap((name) => {
      const phase = byName.get(name);
      return phase && narrowed.names.has(name) ? [{ ...phase, core: true }] : [];
    }),
    ...narrowed.selected.filter(({ name }) => !CORE_PHASE_NAMES.has(name)),
  ];
  const requestedEntry = layer?.phases
    ? layer.phases.entryPhaseId
    : base.phases?.entryPhaseId ?? null;
  const warnings = [...narrowed.warnings];
  const entryPhaseId = resolveEntryPhase(requestedEntry, narrowed.names, selectedValues, warnings);
  return {
    registry: {
      phases: new Map(selectedValues.map((phase) => [phase.name, phase])),
      entryPhaseId,
    },
    names: narrowed.names,
    entryPhaseId,
    warnings,
  };
}

function resolveEntryPhase(
  requested: string | null,
  selectedNames: ReadonlySet<string>,
  selectedPhases: readonly Phase[],
  warnings: string[],
): string | null {
  const defaultAvailable = selectedNames.has(DEFAULT_PHASE_ID);
  let entry: string | null;
  if (requested !== null && selectedNames.has(requested)) {
    entry = requested;
  } else {
    if (requested !== null) {
      warnings.push(`Phase entry "${requested}" is not available and will be skipped.`);
    }
    const routable = selectedPhases.filter(isAutoInvocablePhase);
    entry = defaultAvailable
      ? DEFAULT_PHASE_ID
      : routable.length === 1
        ? routable[0]!.name
        : null;
  }
  return entry;
}

function warnAll(messages: readonly string[]): void {
  for (const message of messages) console.warn(message);
}

function withWarnings<T extends { name: string; core?: boolean }>(
  selection: ResourceSelection<T>,
  warnings: readonly string[],
): ResourceSelection<T> {
  return {
    ...selection,
    warnings: [...warnings, ...selection.warnings],
  };
}

function selectedRefs(refs: readonly ResourceRef[], names: readonly string[]): readonly ResourceRef[] {
  const selected = new Set(names);
  return refs.filter(({ name }) => selected.has(name));
}
