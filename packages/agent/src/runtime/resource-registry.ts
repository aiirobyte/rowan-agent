import { stat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentDefinition } from "../harness/definitions";
import { assertAgentDefinition, normalizeAgentDefinition } from "../harness/definitions";
import { FrontmatterParseError, inferResourceName, loadMarkdown } from "../harness/loader";
import { loadPhase } from "../harness/phases/loader";
import type { Phase } from "../harness/phases/types";
import { loadSkill } from "../harness/skills";
import type { Skill } from "../protocol";
import type { Tool } from "./contracts";

export type { AgentDefinition } from "../harness/definitions";

export type ResourceKind = "agent" | "tool" | "skill" | "phase";
export type ResourceSourceId = string;

/** Rowan-native contribution aliases. Hosts may adapt their domain handlers to
 * these existing Tool/Phase lifecycles without importing host Scope types. */
export type ToolContribution = Tool;
export type PhaseContribution = Phase;

export type ResourceView = Readonly<{
  agents: readonly ResourceSourceId[];
  tools: readonly ResourceSourceId[];
  skills: readonly ResourceSourceId[];
  phases: readonly ResourceSourceId[];
}>;

export type ResourceRef = Readonly<{
  kind: ResourceKind;
  sourceId: ResourceSourceId;
  name: string;
}>;

export type ResourceDiagnostic = Readonly<{
  kind: "invalid" | "missing" | "collision";
  sourceId: ResourceSourceId;
  message: string;
  path?: string;
}>;

export type LoadResult = Readonly<{
  revision: string;
  registered: readonly ResourceRef[];
  skipped: readonly ResourceDiagnostic[];
}>;

export type LoadInput<T> = Readonly<{
  sourceId: ResourceSourceId;
  directory?: string;
  values?: readonly T[];
}>;

export type ResolvedResourceView = Readonly<{
  agents: readonly AgentDefinition[];
  tools: readonly Tool[];
  skills: readonly Skill[];
  phases: readonly Phase[];
  revisions: Readonly<Record<ResourceKind, readonly string[]>>;
  refs: Readonly<Record<ResourceKind, readonly ResourceRef[]>>;
}>;

export type ResourceRegistryErrorCode =
  | "invalid_source_id"
  | "invalid_resource_name"
  | "resource_collision"
  | "resource_input_missing"
  | "resource_directory_not_supported"
  | "unknown_resource_source"
  | "implicit_source_protected";

export class ResourceRegistryError extends Error {
  readonly code: ResourceRegistryErrorCode;

  constructor(code: ResourceRegistryErrorCode, message: string) {
    super(message);
    this.name = "ResourceRegistryError";
    this.code = code;
  }
}

type NamedResource = Readonly<{ name: string }>;
type RegistryValue = AgentDefinition | Tool | Skill | Phase;

type SourceRecord<T extends RegistryValue = RegistryValue> = Readonly<{
  kind: ResourceKind;
  sourceId: ResourceSourceId;
  revision: string;
  values: readonly T[];
}>;

const RESOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/**
 * Runtime Resource Registry source transaction and view resolver.
 *
 * Directory normalization is intentionally added by the typed loader slice;
 * this first module owns only the atomic source/revision/collision semantics.
 */
export class ResourceRegistry {
  private readonly sources = new Map<ResourceKind, Map<ResourceSourceId, SourceRecord>>();
  /** Sources registered by the bootstrap boundary (currently Extensions). */
  private readonly implicitSources = new Map<ResourceKind, ResourceSourceId[]>();
  private revisionSequence = 0;

  async loadAgents(input: LoadInput<AgentDefinition>): Promise<LoadResult> {
    assertSourceId(input.sourceId);
    const collected = await this.collect("agent", input);
    return this.commit("agent", input.sourceId, collected.values, collected.skipped);
  }

  async loadSkills(input: LoadInput<Skill>): Promise<LoadResult> {
    assertSourceId(input.sourceId);
    const collected = await this.collect("skill", input);
    return this.commit("skill", input.sourceId, collected.values, collected.skipped);
  }

  async loadPhases(input: LoadInput<Phase>): Promise<LoadResult> {
    assertSourceId(input.sourceId);
    const collected = await this.collect("phase", input);
    return this.commit("phase", input.sourceId, collected.values, collected.skipped);
  }

  async loadTools(input: Readonly<{
    sourceId: ResourceSourceId;
    values: readonly ToolContribution[];
  }>): Promise<LoadResult> {
    assertSourceId(input.sourceId);
    return this.commit("tool", input.sourceId, input.values, []);
  }

  async unload(input: Readonly<{
    kind: ResourceKind;
    sourceId: ResourceSourceId;
  }>): Promise<LoadResult> {
    assertSourceId(input.sourceId);
    if (this.hasImplicit(input.kind, input.sourceId)) {
      throw new ResourceRegistryError(
        "implicit_source_protected",
        `Implicit ${input.kind} source "${input.sourceId}" is managed by Runtime bootstrap.`,
      );
    }
    const bySource = this.sources.get(input.kind);
    const existing = bySource?.get(input.sourceId);
    if (!existing) {
      return {
        revision: this.nextRevision(input.kind, input.sourceId),
        registered: [],
        skipped: [],
      };
    }
    bySource!.delete(input.sourceId);
    return {
      revision: this.nextRevision(input.kind, input.sourceId),
      registered: [],
      skipped: [],
    };
  }

  resolveView(view: ResourceView): ResolvedResourceView {
    const sourceIds = {
      agents: this.withImplicit("agent", view.agents),
      tools: this.withImplicit("tool", view.tools),
      skills: this.withImplicit("skill", view.skills),
      phases: this.withImplicit("phase", view.phases),
    };
    return {
      agents: this.resolveKind("agent", sourceIds.agents) as AgentDefinition[],
      tools: this.resolveKind("tool", sourceIds.tools) as Tool[],
      skills: this.resolveKind("skill", sourceIds.skills) as Skill[],
      phases: this.resolveKind("phase", sourceIds.phases) as Phase[],
      revisions: {
        agent: this.resolveRevisions("agent", sourceIds.agents),
        tool: this.resolveRevisions("tool", sourceIds.tools),
        skill: this.resolveRevisions("skill", sourceIds.skills),
        phase: this.resolveRevisions("phase", sourceIds.phases),
      },
      refs: {
        agent: this.resolveRefs("agent", sourceIds.agents),
        tool: this.resolveRefs("tool", sourceIds.tools),
        skill: this.resolveRefs("skill", sourceIds.skills),
        phase: this.resolveRefs("phase", sourceIds.phases),
      },
    };
  }

  /** Mark one already-loaded source as implicit for every Resource View. */
  protected markImplicit(kind: ResourceKind, sourceId: ResourceSourceId): void {
    assertSourceId(sourceId);
    const entries = this.implicitSources.get(kind) ?? [];
    if (!entries.includes(sourceId)) entries.push(sourceId);
    this.implicitSources.set(kind, entries);
  }

  /** Bootstrap-only helper for replacing an implicit contribution source. */
  protected async replaceImplicit<T extends RegistryValue>(
    kind: ResourceKind,
    sourceId: ResourceSourceId,
    values: readonly T[],
  ): Promise<LoadResult> {
    const result = await this.commit(kind, sourceId, values, []);
    this.markImplicit(kind, sourceId);
    return result;
  }

  protected hasImplicit(kind: ResourceKind, sourceId: ResourceSourceId): boolean {
    return this.implicitSources.get(kind)?.includes(sourceId) ?? false;
  }

  private withImplicit(kind: ResourceKind, sourceIds: readonly ResourceSourceId[]): ResourceSourceId[] {
    const combined = [...sourceIds];
    for (const sourceId of this.implicitSources.get(kind) ?? []) {
      if (!combined.includes(sourceId)) combined.push(sourceId);
    }
    return combined;
  }

  private async collect<T extends RegistryValue>(
    kind: ResourceKind,
    input: LoadInput<T>,
  ): Promise<{ values: readonly T[]; skipped: readonly ResourceDiagnostic[] }> {
    const hasDirectory = input.directory !== undefined;
    const hasValues = input.values !== undefined;
    if (!hasDirectory && !hasValues) {
      throw new ResourceRegistryError(
        "resource_input_missing",
        `Resource source "${input.sourceId}" requires directory or values.`,
      );
    }
    const directoryValues = hasDirectory
      ? await loadDirectoryValues<T>(kind, input.directory!, input.sourceId)
      : { values: [] as T[], skipped: [] as ResourceDiagnostic[] };
    return {
      values: [...directoryValues.values, ...(input.values ?? [])],
      skipped: directoryValues.skipped,
    };
  }

  private async commit<T extends RegistryValue>(
    kind: ResourceKind,
    sourceId: ResourceSourceId,
    values: readonly T[],
    skipped: readonly ResourceDiagnostic[],
  ): Promise<LoadResult> {
    assertSourceId(sourceId);
    const names = new Set<string>();
    for (const value of values) {
      if (kind === "agent") assertAgentDefinition(value);
      assertNamedResource(value, kind, sourceId);
      if (isImplicitCoreName(kind, value.name) && sourceId !== "rowan.core") {
        throw new ResourceRegistryError(
          "resource_collision",
          `${capitalize(kind)} resource "${value.name}" is reserved by Rowan core.`,
        );
      }
      if (names.has(value.name)) {
        throw new ResourceRegistryError(
          "resource_collision",
          `Duplicate ${capitalize(kind)} resource "${value.name}" in source "${sourceId}".`,
        );
      }
      names.add(value.name);
    }

    const revision = this.nextRevision(kind, sourceId);
    const snapshottedValues = values.map((value) => snapshotResourceValue(kind, value));
    const record: SourceRecord<T> = {
      kind,
      sourceId,
      revision,
      values: Object.freeze(snapshottedValues),
    };
    let bySource = this.sources.get(kind);
    if (!bySource) {
      bySource = new Map();
      this.sources.set(kind, bySource);
    }
    bySource.set(sourceId, record as SourceRecord);
    return {
      revision,
      registered: values.map((value) => ({ kind, sourceId, name: value.name })),
      skipped,
    };
  }

  private resolveKind(kind: ResourceKind, sourceIds: readonly ResourceSourceId[]): RegistryValue[] {
    const names = new Set<string>();
    const values: RegistryValue[] = [];
    for (const source of this.sourcesFor(kind, sourceIds)) {
      for (const value of source.values) {
        if (names.has(value.name)) {
          throw new ResourceRegistryError(
            "resource_collision",
            `Duplicate ${capitalize(kind)} resource "${value.name}" in Resource View.`,
          );
        }
        names.add(value.name);
        values.push(value);
      }
    }
    return values;
  }

  private resolveRevisions(kind: ResourceKind, sourceIds: readonly ResourceSourceId[]): readonly string[] {
    return this.sourcesFor(kind, sourceIds).map(({ revision }) => revision);
  }

  private resolveRefs(kind: ResourceKind, sourceIds: readonly ResourceSourceId[]): readonly ResourceRef[] {
    const seenNames = new Set<string>();
    const refs: ResourceRef[] = [];
    for (const source of this.sourcesFor(kind, sourceIds)) {
      for (const value of source.values) {
        if (seenNames.has(value.name)) throw new ResourceRegistryError("resource_collision", `Duplicate ${capitalize(kind)} resource "${value.name}" in Resource View.`);
        seenNames.add(value.name);
        refs.push({ kind, sourceId: source.sourceId, name: value.name });
      }
    }
    return refs;
  }

  private sourcesFor(kind: ResourceKind, sourceIds: readonly ResourceSourceId[]): SourceRecord[] {
    const bySource = this.sources.get(kind);
    const seen = new Set<ResourceSourceId>();
    const sources: SourceRecord[] = [];
    for (const sourceId of sourceIds) {
      assertSourceId(sourceId);
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      const source = bySource?.get(sourceId);
      if (!source) {
        throw new ResourceRegistryError(
          "unknown_resource_source",
          `Unknown resource source "${sourceId}" for ${kind}.`,
        );
      }
      sources.push(source);
    }
    return sources;
  }

  private nextRevision(kind: ResourceKind, sourceId: ResourceSourceId): string {
    this.revisionSequence += 1;
    return `${kind}:${sourceId}:${this.revisionSequence}`;
  }
}

function snapshotResourceValue<T extends RegistryValue>(kind: ResourceKind, value: T): T {
  if (kind === "agent") {
    const agent = value as AgentDefinition;
    return Object.freeze({
      ...agent,
      ...(agent.bundledSkills
        ? { bundledSkills: Object.freeze(agent.bundledSkills.map((skill) => Object.freeze({ ...skill }))) }
        : {}),
    }) as unknown as T;
  }
  if (kind !== "phase") return value;
  const phase = value as Phase;
  const snapshot: Phase = {
    ...phase,
    disableAutoInvocation: phase.disableAutoInvocation ?? false,
    disableImplicitInvocation: phase.disableImplicitInvocation ?? false,
    ...(phase.tools ? { tools: Object.freeze([...phase.tools]) as unknown as Phase["tools"] } : {}),
    skills: Object.freeze((phase.skills ?? []).map((skill) => Object.freeze({ ...skill }))) as unknown as Phase["skills"],
    ...(phase.input ? { input: Object.freeze({ ...phase.input }) as unknown as Phase["input"] } : {}),
    ...(phase.model ? { model: Object.freeze({ ...phase.model }) as unknown as Phase["model"] } : {}),
  };
  return Object.freeze(snapshot) as unknown as T;
}

function assertSourceId(sourceId: string): void {
  if (typeof sourceId !== "string" || !SOURCE_ID.test(sourceId)) {
    throw new ResourceRegistryError("invalid_source_id", `Invalid resource source "${String(sourceId)}".`);
  }
}

function assertNamedResource(value: unknown, kind: ResourceKind, sourceId: ResourceSourceId): asserts value is NamedResource {
  if (!value || typeof value !== "object" || typeof (value as NamedResource).name !== "string") {
    throw new ResourceRegistryError("invalid_resource_name", `Invalid ${kind} resource in source "${sourceId}".`);
  }
  const name = (value as NamedResource).name;
  if (!RESOURCE_NAME.test(name)) {
    throw new ResourceRegistryError("invalid_resource_name", `Invalid ${capitalize(kind)} resource name "${name}".`);
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Names reserved for Rowan's own execution machinery. The concrete route
 * Tool is assembled by the loop, while the default Phase is materialized by
 * Runtime execution; neither can be shadowed by a host source. */
function isImplicitCoreName(kind: ResourceKind, name: string): boolean {
  return (kind === "tool" && name === "route")
    || (kind === "phase" && (name === "default" || name === "stop" || name === "compact"));
}

type DirectoryValues<T extends RegistryValue> = {
  values: T[];
  skipped: ResourceDiagnostic[];
};

async function loadDirectoryValues<T extends RegistryValue>(
  kind: ResourceKind,
  directory: string,
  sourceId: ResourceSourceId,
): Promise<DirectoryValues<T>> {
  const root = resolve(directory);
  let rootInfo;
  try {
    rootInfo = await stat(root);
  } catch (error) {
    if (isMissingPath(error)) {
      return {
        values: [],
        skipped: [{ kind: "missing", sourceId, path: root, message: `Resource directory "${root}" does not exist.` }],
      };
    }
    return {
      values: [],
      skipped: [{
        kind: "invalid",
        sourceId,
        path: root,
        message: `Resource directory "${root}" could not be read: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }

  const marker = markerFor(kind);
  const targets: string[] = [];
  if (rootInfo.isFile()) {
    targets.push(root);
  } else if (rootInfo.isDirectory()) {
    const markerAtRoot = join(root, marker);
    try {
      const markerInfo = await stat(markerAtRoot);
      if (markerInfo.isFile()) targets.push(markerAtRoot);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      let entries;
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch (error) {
        return {
          values: [],
          skipped: [{
            kind: "invalid",
            sourceId,
            path: root,
            message: `Resource directory "${root}" could not be read: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isDirectory()) continue;
        const target = join(root, entry.name, marker);
        try {
          const targetInfo = await stat(target);
          if (targetInfo.isFile()) targets.push(target);
        } catch (targetError) {
          if (!isMissingPath(targetError)) throw targetError;
        }
      }
    }
  }

  const values: T[] = [];
  const skipped: ResourceDiagnostic[] = [];
  for (const target of targets) {
    try {
      const value = await loadDirectoryValue<T>(kind, target);
      values.push(value);
    } catch (error) {
      skipped.push({
        kind: "invalid",
        sourceId,
        path: target,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { values, skipped };
}

async function loadDirectoryValue<T extends RegistryValue>(kind: ResourceKind, target: string): Promise<T> {
  switch (kind) {
    case "agent": {
      let loaded: Awaited<ReturnType<typeof loadMarkdown<Record<string, unknown>>>>;
      try {
        loaded = await loadMarkdown<Record<string, unknown>>(target);
      } catch (error) {
        if (error instanceof FrontmatterParseError) {
          throw new TypeError(`frontmatter could not be parsed: ${error.message}`);
        }
        throw error;
      }
      return normalizeAgentDefinition(
        loaded.frontmatter,
        loaded.body,
        { fallbackName: inferResourceName(target, "AGENT.md") },
      ) as T;
    }
    case "skill":
      return await loadSkill(target) as T;
    case "phase":
      return await loadPhase(target) as T;
    case "tool":
      throw new ResourceRegistryError(
        "resource_directory_not_supported",
        "Tool sources accept inline values only.",
      );
  }
}

function markerFor(kind: ResourceKind): string {
  switch (kind) {
    case "agent": return "AGENT.md";
    case "skill": return "SKILL.md";
    case "phase": return "PHASE.md";
    case "tool": return "";
  }
}

function isMissingPath(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}
