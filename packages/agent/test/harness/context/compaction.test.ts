import { expect, test } from "bun:test";
import { compactMessages } from "../../../src/harness/context/compaction";
import { createMessage } from "../../../src/types";

test("compaction keeps the active phase prompt available to the model", () => {
  const phasePrompt = createMessage(
    "user",
    '<phase_content name="review">Follow the review phase.</phase_content>',
    { kind: "phase_prompt", phase: "review" },
  );
  const messages = [
    createMessage("user", "Review this code."),
    phasePrompt,
    ...Array.from({ length: 30 }, (_, index) => createMessage("assistant", `Turn ${index}`)),
  ];

  const result = compactMessages(messages, {
    maxMessages: 10,
    keepRecent: 2,
    minCompact: 1,
  });

  expect(result.compacted).toBe(true);
  expect(result.messages).toContainEqual(phasePrompt);
});
