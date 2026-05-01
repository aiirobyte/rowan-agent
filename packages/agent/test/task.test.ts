import { expect, test } from "bun:test";
import { createDefaultCriteria, parseTask, parseVerificationResult } from "../src/task";
import { createId, nowIso } from "../src/types";

test("parseTask validates structured task schema", () => {
  const task = parseTask({
    id: createId("task"),
    title: "Example",
    instruction: "Do the thing",
    acceptanceCriteria: createDefaultCriteria("Must be done"),
    toolNames: [],
    skillIds: [],
    status: "pending",
    attempts: 0,
  });

  expect(task.title).toBe("Example");
  expect(task.acceptanceCriteria[0]?.type).toBe("model_judge");
});

test("parseTask rejects invalid task", () => {
  expect(() => parseTask({ title: "bad" })).toThrow();
});

test("parseVerificationResult does not allow passed with failed criteria", () => {
  const result = parseVerificationResult({
    passed: true,
    message: "Looks fine.",
    evidence: [],
    failedCriteria: ["crit_failed"],
  });

  expect(result.passed).toBe(false);
});

test("nowIso uses the log timestamp format with local timezone offset", () => {
  const timestamp = nowIso();

  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
  expect(timestamp.endsWith("Z")).toBe(false);
});
