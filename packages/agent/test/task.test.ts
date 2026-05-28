import { expect, test } from "bun:test";
import { createFailedPhaseOutcome } from "../src/loop/phases";
import { createId, nowIso } from "../src/types";

test("createFailedPhaseOutcome does not expose internal planning messages", () => {
  const outcome = createFailedPhaseOutcome(createId("task"), "Plan: read package.json and tsconfig files.");

  expect(outcome.passed).toBe(false);
  expect(outcome.message).toBe("Task did not pass acceptance criteria.");
});

test("nowIso uses the log timestamp format with local timezone offset", () => {
  const timestamp = nowIso();

  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
  expect(timestamp.endsWith("Z")).toBe(false);
});
