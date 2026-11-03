import { expect, test } from "bun:test";
import { contentBlocksToMessageContent } from "../src/loop/messages";

test("streamed thinking keeps its provider signature for replay", () => {
  expect(contentBlocksToMessageContent([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "thinking", thinking: "unsigned" },
  ])).toEqual([
    { type: "thinking", thinking: "plan", signature: "sig-1" },
    { type: "thinking", thinking: "unsigned" },
  ]);
});

test("streamed tool calls keep their provider signature for replay", () => {
  expect(contentBlocksToMessageContent([
    { type: "tool_call", id: "call_1", name: "read", args: "{\"path\":\"a.txt\"}", signature: "sig-1" },
  ])).toEqual([
    {
      type: "tool_use",
      id: "call_1",
      name: "read",
      input: { path: "a.txt" },
      signature: "sig-1",
    },
  ]);
});
