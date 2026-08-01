export type NamedResource = Readonly<{ name: string }>;

/** Select named candidates with shared Agent/Phase semantics. */
export function selectNamedResources<T extends NamedResource>(
  candidates: readonly T[],
  names: readonly string[] | undefined,
  kind: "Tool" | "Skill" | "Phase" | "Extension",
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
