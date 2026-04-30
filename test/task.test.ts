import { expect, test } from "bun:test";
import { createDefaultCriteria, parseTask } from "../src/task";
import { createId } from "../src/types";

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
