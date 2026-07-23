import type { Page } from "@rowan-agent/agent";

/** Read every page from a cursor-based Runtime read model. */
export async function collectPages<T, Cursor>(read: (after?: Cursor) => Promise<Page<T, Cursor>>): Promise<T[]> {
  const items: T[] = [];
  let after: Cursor | undefined;
  while (true) {
    const page = await read(after);
    items.push(...page.items);
    if (!page.next) return items;
    after = page.next;
  }
}
