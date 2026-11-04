import type { Skill } from "../protocol";

export type NamedResource = Readonly<{ name: string; core?: boolean }>;

export type ResourceSelectionKind = "Tool" | "Skill" | "Phase" | "Context" | "Extension";

export type SelectionEntry = Readonly<{
  name: string;
  remove: boolean;
}>;

export type ResourceSelection<T extends NamedResource> = Readonly<{
  /** Selected values, in candidate order. Values absent from the candidate
   * source (such as Rowan's materialized Core Tools) appear only in `names`. */
  selected: readonly T[];
  names: ReadonlySet<string>;
  warnings: readonly string[];
}>;

/**
 * Resolve one Resource Selection list against its visible candidates.
 *
 * `parent` makes the call monotonic: the parent's surviving names are the
 * whole universe, so a Layer or Phase can narrow but never restore a value.
 * `coreNames` names resources Rowan owns without materializing them in the
 * candidate source (the built-in Core Tools are the current example).
 */
export function selectResources<T extends NamedResource>(input: Readonly<{
  kind: ResourceSelectionKind;
  candidates: readonly T[];
  selection?: readonly string[];
  parent?: readonly string[];
  coreNames?: ReadonlySet<string> | readonly string[];
}>): ResourceSelection<T> {
  const byName = new Map<string, T>();
  for (const candidate of input.candidates) {
    if (byName.has(candidate.name)) {
      throw new TypeError(`Duplicate ${input.kind} candidate "${candidate.name}".`);
    }
    byName.set(candidate.name, candidate);
  }

  const knownCoreNames = new Set(input.coreNames ?? []);
  for (const candidate of input.candidates) {
    if (candidate.core) knownCoreNames.add(candidate.name);
  }

  const universe = new Set(input.parent ?? [
    ...input.candidates.map(({ name }) => name),
    ...knownCoreNames,
  ]);
  const core = new Set([...universe].filter((name) =>
    knownCoreNames.has(name) || byName.get(name)?.core === true));
  const entries = normalizeSelectionEntries(input.selection, input.kind);
  const positive = new Set(entries.filter(({ remove }) => !remove).map(({ name }) => name));
  const negative = new Set(entries.filter(({ remove }) => remove).map(({ name }) => name));
  const warnings: string[] = [];

  for (const name of positive) {
    if (!universe.has(name)) {
      warnings.push(`${input.kind} "${name}" is not available and will be skipped.`);
    }
  }
  for (const name of negative) {
    if (!universe.has(name)) {
      warnings.push(`${input.kind} "${name}" is not available and will be skipped.`);
    }
  }

  let selectedNames: Set<string>;
  if (input.selection === undefined) {
    selectedNames = new Set(universe);
  } else if (input.selection.length === 0) {
    selectedNames = new Set(core);
  } else if (positive.size === 0) {
    selectedNames = new Set(universe);
  } else {
    selectedNames = new Set(core);
    for (const name of positive) {
      if (universe.has(name) && !core.has(name)) selectedNames.add(name);
    }
  }
  for (const name of negative) selectedNames.delete(name);

  const selected = input.candidates.filter(({ name }) => selectedNames.has(name));
  return {
    selected,
    names: selectedNames,
    warnings,
  };
}

export function normalizeSelectionEntries(
  entries: readonly string[] | undefined,
  kind: ResourceSelectionKind,
): readonly SelectionEntry[] {
  if (entries === undefined) return [];
  const normalized: SelectionEntry[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === "-") {
      throw new TypeError(`${kind} selection entry "-" must name a resource.`);
    }
    if (entry.startsWith("+") || entry.startsWith("!")) {
      throw new TypeError(`${kind} selection entry "${entry}" uses unsupported syntax; use -name to remove a resource.`);
    }
    const remove = entry.startsWith("-");
    const name = remove ? entry.slice(1).trim() : entry;
    if (name.length === 0) {
      throw new TypeError(`${kind} selection entry "${entry}" must name a resource.`);
    }
    const key = `${remove ? "-" : "+"}${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ name, remove });
  }
  return normalized;
}

/** Merge layered Skills; a later layer replaces an earlier same-name Skill. */
export function mergeSkills(...layers: Array<readonly Skill[] | undefined>): Skill[] {
  const byName = new Map<string, Skill>();
  for (const layer of layers) {
    for (const skill of layer ?? []) byName.set(skill.name, skill);
  }
  return [...byName.values()];
}
