import type { ModelConfig, ModelRef, StreamFn } from "@rowan-agent/models";
import type {
  AgentDefinition,
  PhaseRegistrySelection,
} from "../harness/definitions";
import { mergeSkills, selectNamedResources } from "../harness/resource-selection";
import type { Phase, PhaseRegistry } from "../harness/phases/types";
import { COMPACT_PHASE_ID, DEFAULT_PHASE_ID, STOP_PHASE_ID } from "../harness/phases/core-phases";
import type { ContextCandidate } from "./contracts";
import { validateMaxAttempts } from "../loop/types";
import {
  ResourceRegistry,
  type ResourceKind,
  type ResourceRef,
  type ResourceView,
  type ResolvedResourceView,
} from "./resource-registry";

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
  /** Trusted Host-owned Contexts appended after Definition selection. */
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
    skills: readonly import("../protocol").Skill[];
    phases?: PhaseRegistry;
    revisions: Readonly<Record<ResourceKind, readonly string[]>>;
    refs: Readonly<Record<ResourceKind, readonly ResourceRef[]>>;
  }>;
  contexts: readonly ContextCandidate[];
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
  const selectedContexts = selectNamedResources(input.contexts ?? [], base.contexts, "Context");
  const contexts = appendAdditionalContexts(selectedContexts, input.additionalContexts ?? []);
  const definition = addAdditionalContextNames(
    applyDefinitionLayer(base, layer),
    contexts.slice(selectedContexts.length).map(({ name }) => name),
  );
  const tools = selectNamedResources(resolved.tools, definition.tools, "Tool");
  const skills = mergeSkills(
    selectNamedResources(resolved.skills, definition.skills, "Skill"),
    definition.bundledSkills,
  );
  const phases = resolvePhases(resolved.phases, definition.phases);
  return {
    identity: input.identity,
    definition,
    resources: {
      tools,
      skills,
      ...(phases ? { phases } : {}),
      revisions: resolved.revisions,
      refs: {
        agent: selectedRefs(resolved.refs.agent, [base.name]),
        tool: selectedRefs(resolved.refs.tool, tools.map(({ name }) => name)),
        skill: selectedRefs(resolved.refs.skill, skills.map(({ name }) => name)),
        phase: selectedRefs(resolved.refs.phase, [...(phases?.phases.keys() ?? [])]),
      },
    },
    contexts,
    resourceView: input.resourceView,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...("stream" in input && input.stream
      ? { model: layer?.model ?? input.model, stream: input.stream }
      : { model: layer?.model ?? input.model }),
  } as ConfigurationSnapshot;
}

/** Materialize the immutable resolver output at the legacy execution seam.
 * The conversion is intentionally one-way: callers cannot feed concrete
 * candidate bags back through the public configuration request. */
export function materializeConfigurationSnapshot(snapshot: ConfigurationSnapshot): import("./contracts").AgentConfig {
  return {
    identity: snapshot.identity,
    definition: snapshot.definition,
    resources: {
      tools: snapshot.resources.tools,
      skills: snapshot.resources.skills,
      ...(snapshot.resources.phases ? { phases: snapshot.resources.phases } : {}),
      ...(snapshot.contexts.length > 0 ? { contexts: snapshot.contexts } : {}),
      resourceView: snapshot.resourceView,
      resourceRefs: [
        ...snapshot.resources.refs.agent,
        ...snapshot.resources.refs.tool,
        ...snapshot.resources.refs.skill,
        ...snapshot.resources.refs.phase,
      ],
      resourceRevisions: snapshot.resources.revisions,
    },
    ...(snapshot.cwd === undefined ? {} : { cwd: snapshot.cwd }),
    ...(snapshot.maxAttempts === undefined ? {} : { maxAttempts: snapshot.maxAttempts }),
    ...("stream" in snapshot && snapshot.stream
      ? { model: snapshot.model, stream: snapshot.stream }
      : { model: snapshot.model }),
  } as import("./contracts").AgentConfig;
}

function applyDefinitionLayer(base: AgentDefinition, layer: DefinitionLayer | undefined): AgentDefinition {
  if (!layer) return { ...base };
  return {
    ...base,
    ...(layer.description === undefined ? {} : { description: layer.description }),
    ...(layer.prompt === undefined ? {} : { prompt: layer.prompt }),
    ...(layer.model === undefined ? {} : { model: layer.model }),
    ...(layer.tools === undefined ? {} : { tools: intersectNames(base.tools, layer.tools, "Tool") }),
    ...(layer.skills === undefined ? {} : { skills: intersectNames(base.skills, layer.skills, "Skill") }),
    ...(layer.phases === undefined ? {} : { phases: intersectPhaseSelection(base.phases, layer.phases) }),
  };
}

function appendAdditionalContexts(
  selected: readonly ContextCandidate[],
  additional: readonly ContextCandidate[],
): ContextCandidate[] {
  const contexts = [...selected];
  const seen = new Set(contexts.map(({ name }) => name));
  for (const context of additional) {
    if (seen.has(context.name)) continue;
    seen.add(context.name);
    contexts.push(context);
  }
  return contexts;
}

function addAdditionalContextNames(
  definition: AgentDefinition,
  names: readonly string[],
): AgentDefinition {
  if (definition.contexts === undefined || names.length === 0) return definition;
  const existing = new Set(definition.contexts);
  const additions = names.filter((name) => !existing.has(name));
  return additions.length === 0
    ? definition
    : { ...definition, contexts: [...definition.contexts, ...additions] };
}

function intersectNames(parent: readonly string[] | undefined, layer: readonly string[], kind: "Tool" | "Skill"): readonly string[] {
  if (parent === undefined) return [...layer];
  const parentNames = new Set(parent);
  for (const name of layer) {
    if (!parentNames.has(name)) console.warn(`${kind} "${name}" is not available and will be skipped.`);
  }
  return layer.filter((name) => parentNames.has(name));
}

function intersectPhaseSelection(
  parent: PhaseRegistrySelection | undefined,
  layer: PhaseRegistrySelection,
): PhaseRegistrySelection {
  if (!parent) return layer;
  const parentNames = new Set(parent.phaseIds);
  for (const name of layer.phaseIds) {
    if (!parentNames.has(name)) console.warn(`Phase "${name}" is not available and will be skipped.`);
  }
  return {
    entryPhaseId: layer.entryPhaseId,
    phaseIds: layer.phaseIds.filter((name) => parentNames.has(name)),
  };
}

function resolvePhases(
  candidates: readonly Phase[],
  selection: PhaseRegistrySelection | undefined,
): PhaseRegistry | undefined {
  const coreNames = new Set([DEFAULT_PHASE_ID, STOP_PHASE_ID, COMPACT_PHASE_ID]);
  const core = candidates.filter((phase) => phase.core || coreNames.has(phase.name));
  const authored = candidates.filter((phase) => !coreNames.has(phase.name) && !phase.core);
  const selected = [...core, ...selectNamedResources(authored, selection?.phaseIds, "Phase")];
  const entryPhaseId = selection?.entryPhaseId ?? null;
  // The built-in default Phase is materialized by Runtime execution rather
  // than selected from a host source. It is therefore valid even when an
  // explicit phase selector intentionally contains no authored Phases.
  if (entryPhaseId !== null
    && entryPhaseId !== DEFAULT_PHASE_ID
    && !selected.some(({ name }) => name === entryPhaseId)) {
    console.warn(`Phase entry "${entryPhaseId}" is not available and will be skipped.`);
    return { phases: new Map(selected.map((phase) => [phase.name, phase])), entryPhaseId: null };
  }
  return {
    phases: new Map(selected.map((phase) => [phase.name, phase])),
    entryPhaseId,
  };
}

function selectedRefs(refs: readonly ResourceRef[], names: readonly string[]): readonly ResourceRef[] {
  const selected = new Set(names);
  return refs.filter(({ name }) => selected.has(name));
}
