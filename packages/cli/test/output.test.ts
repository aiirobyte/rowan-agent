import { expect, test } from "bun:test";
import { formatJsonOutput, formatOutcomeOutput } from "../src/output";
import type { Outcome } from "@rowan-agent/agent";

test("formatOutcomeOutput uses one JSON formatter for direct and task outcomes", () => {
  const directOutcome: Outcome = {
    id: "out_direct",
    passed: true,
    message: "Hello from model",
    evidence: [],
    failedCriteria: [],
  };
  const taskOutcome: Outcome = {
    id: "out_task",
    taskId: "task_123",
    passed: true,
    message: "Task passed",
    evidence: [],
    failedCriteria: [],
  };

  expect(formatOutcomeOutput(directOutcome)).toBe(formatJsonOutput(directOutcome));
  expect(formatOutcomeOutput(taskOutcome)).toBe(formatJsonOutput(taskOutcome));
  expect(JSON.parse(formatOutcomeOutput(directOutcome))).toEqual(directOutcome);
  expect(JSON.parse(formatOutcomeOutput(taskOutcome))).toEqual(taskOutcome);
});
