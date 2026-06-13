import { expect, test } from "bun:test";
import { formatJsonOutput, formatOutcomeOutput } from "../src/output";
import type { Outcome } from "@rowan-agent/agent";

test("formatOutcomeOutput uses the outcome JSON shape", () => {
  const directOutcome: Outcome = {
    id: "out_direct",
    message: "Hello from model",
  };
  const taskOutcome: Outcome = {
    id: "out_task",
    message: "Task completed",
  };

  expect(formatOutcomeOutput(directOutcome)).toBe(formatJsonOutput(directOutcome));
  expect(formatOutcomeOutput(taskOutcome)).toBe(formatJsonOutput(taskOutcome));
  expect(JSON.parse(formatOutcomeOutput(directOutcome))).not.toHaveProperty("evidence");
  expect(JSON.parse(formatOutcomeOutput(directOutcome))).not.toHaveProperty("failedCriteria");
  expect(JSON.parse(formatOutcomeOutput(taskOutcome))).not.toHaveProperty("evidence");
  expect(JSON.parse(formatOutcomeOutput(taskOutcome))).not.toHaveProperty("failedCriteria");
});
