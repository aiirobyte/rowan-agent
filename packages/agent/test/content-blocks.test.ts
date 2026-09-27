import { expect, test } from "bun:test";
import { contentBlocksToMessageContent } from "../src/types";

test("streamed thinking keeps its provider signature for replay", () => {
  expect(contentBlocksToMessageContent([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "thinking", thinking: "unsigned" },
  ])).toEqual([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "thinking", thinking: "unsigned" },
  ]);
});
