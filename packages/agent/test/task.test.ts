import { expect, test } from "bun:test";
import { createTimestamp } from "../src/utils";

test("createTimestamp returns ISO 8601 UTC timestamp", () => {
  const timestamp = createTimestamp();

  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:\d{2})$/);
  expect(timestamp.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(timestamp)).toBe(true);
});
