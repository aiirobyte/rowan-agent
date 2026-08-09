import type { Skill } from "../protocol";

export type NamedResource = Readonly<{ name: string }>;

/** Select named candidates with shared Agent/Phase semantics. */
export function selectNamedResources<T extends NamedResource>(
  candidates: readonly T[],
  names: readonly string[] | undefined,
  kind: "Tool" | "Skill" | "Phase" | "Extension" | "Context",
): T[] {
  const byName = new Map<string, T>();
  for (const candidate of candidates) {
    if (byName.has(candidate.name)) {
      throw new TypeError(`Duplicate ${kind} candidate "${candidate.name}".`);
    }
    byName.set(candidate.name, candidate);
  }
  if (names === undefined) return [...candidates];

  const selected: T[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const candidate = byName.get(name);
    if (!candidate) {
      console.warn(`${kind} "${name}" is not available and will be skipped.`);
      continue;
    }
    selected.push(candidate);
  }
  return selected;
}

/** Merge layered Skills; a later layer replaces an earlier same-name Skill. */
export function mergeSkills(...layers: Array<readonly Skill[] | undefined>): Skill[] {
  const byName = new Map<string, Skill>();
  for (const layer of layers) {
    for (const skill of layer ?? []) byName.set(skill.name, skill);
  }
  return [...byName.values()];
}
