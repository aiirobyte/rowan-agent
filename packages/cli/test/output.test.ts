import { expect, test } from "bun:test";
import { formatJsonOutput, formatOutcomeOutput } from "../src/output";
import type { Outcome } from "@rowan-agent/agent";

test("formatOutcomeOutput uses the outcome JSON shape", () => {
  const directOutcome: Outcome = {
    id: "out_direct",
    passed: true,
    message: "Hello from model",
  };
  const taskOutcome: Outcome = {
    id: "out_task",
    taskId: "task_123",
    passed: true,
    message: "Task passed",
  };

  expect(formatOutcomeOutput(directOutcome)).toBe(formatJsonOutput(directOutcome));
  expect(formatOutcomeOutput(taskOutcome)).toBe(formatJsonOutput(taskOutcome));
  expect(JSON.parse(formatOutcomeOutput(directOutcome))).not.toHaveProperty("evidence");
  expect(JSON.parse(formatOutcomeOutput(directOutcome))).not.toHaveProperty("failedCriteria");
  expect(JSON.parse(formatOutcomeOutput(taskOutcome))).not.toHaveProperty("evidence");
  expect(JSON.parse(formatOutcomeOutput(taskOutcome))).not.toHaveProperty("failedCriteria");
});
