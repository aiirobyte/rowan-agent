import { expect, test } from "bun:test";
import { collectPages } from "../src/pagination";

test("collectPages consumes every cursor page", async () => {
  const values = Array.from({ length: 205 }, (_, index) => index);
  const calls: Array<number | undefined> = [];
  const result = await collectPages(async (after?: number) => {
    calls.push(after);
    const start = after ?? 0;
    const items = values.slice(start, start + 100);
    return {
      items,
      ...(start + items.length < values.length ? { next: start + items.length } : {}),
    };
  });

  expect(result).toEqual(values);
  expect(calls).toEqual([undefined, 100, 200]);
});
