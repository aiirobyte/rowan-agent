import { expect, test } from "bun:test";
import { createTimestamp } from "../src/utils";

test("createTimestamp uses the log timestamp format with local timezone offset", () => {
  const timestamp = createTimestamp();

  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
  expect(timestamp.endsWith("Z")).toBe(false);
});
