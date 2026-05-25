import { expect, test } from "bun:test";
import { createDefaultCriteria, Validators } from "@rowan-agent/agent";
import { createFailedOutcome } from "../src/loop/phases";
import { createId, nowIso } from "../src/types";

test("parseTask validates structured task schema", () => {
  const task = Validators.task.Parse({
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
  expect(task.acceptanceCriteria[0]).toBe("Must be done");
});

test("parseTask rejects invalid task", () => {
  expect(() => Validators.task.Parse({ title: "bad" })).toThrow();
});

test("parseVerificationResult accepts lightweight pass/fail judgement", () => {
  const result = Validators.verificationResult.Parse({
    passed: true,
    message: "Looks fine.",
  });

  expect(result).toMatchObject({
    passed: true,
    message: "Looks fine.",
  });
});

test("createFailedOutcome does not expose internal planning messages", () => {
  const task = Validators.task.Parse({
    id: createId("task"),
    title: "Inspect workspace",
    instruction: "Inspect workspace language",
    acceptanceCriteria: createDefaultCriteria("Language is identified."),
    toolNames: ["bash"],
    skillIds: [],
    status: "running",
    attempts: 2,
  });
  const outcome = createFailedOutcome(task, {
    passed: false,
    message: "Plan: read package.json and tsconfig files.",
  });

  expect(outcome.passed).toBe(false);
  expect(outcome.message).toBe("Task did not pass acceptance criteria.");
});

test("nowIso uses the log timestamp format with local timezone offset", () => {
  const timestamp = nowIso();

  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}-\d{2}[+-]\d{2}:\d{2}$/);
  expect(timestamp.endsWith("Z")).toBe(false);
});
