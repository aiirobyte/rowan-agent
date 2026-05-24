import { expect, test } from "bun:test";
import { JsonExtractionError, extractJsonObject } from "../src/json-extract";

test("extractJsonObject parses pure JSON objects and arrays", () => {
  expect(extractJsonObject('{ "ok": true, "items": [1, 2] }')).toEqual({
    ok: true,
    items: [1, 2],
  });
  expect(extractJsonObject('[{ "id": "one" }]')).toEqual([{ id: "one" }]);
});

test("extractJsonObject parses a json fenced block", () => {
  const value = extractJsonObject([
    "Here is the result:",
    "```json",
    '{ "task": { "title": "Example" } }',
    "```",
  ].join("\n"));

  expect(value).toEqual({ task: { title: "Example" } });
});

test("extractJsonObject parses the first balanced JSON fragment in prose", () => {
  const value = extractJsonObject('before { "text": "brace } in string", "nested": [{ "ok": true }] } after');

  expect(value).toEqual({
    text: "brace } in string",
    nested: [{ ok: true }],
  });
});

test("extractJsonObject throws JsonExtractionError for empty input", () => {
  expect(() => extractJsonObject("   ")).toThrow(JsonExtractionError);
  expect(() => extractJsonObject("   ")).toThrow("empty string");
});

test("extractJsonObject throws JsonExtractionError when no JSON is present", () => {
  expect(() => extractJsonObject("nothing structured here")).toThrow(JsonExtractionError);
  expect(() => extractJsonObject("nothing structured here")).toThrow("No JSON object or array");
});

test("extractJsonObject throws JsonExtractionError for invalid JSON", () => {
  expect(() => extractJsonObject("```json\n{ nope }\n```")).toThrow(JsonExtractionError);
  expect(() => extractJsonObject("```json\n{ nope }\n```")).toThrow("Invalid JSON");
});
