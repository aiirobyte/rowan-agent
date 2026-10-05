import { describe, expect, it } from "bun:test";
import { parsePartialJson } from "../../src/loop/partial-json";

describe("parsePartialJson", () => {
  describe("open strings", () => {
    it("parses top-level open string and returns text received so far", () => {
      expect(parsePartialJson('"hello')).toBe("hello");
      expect(parsePartialJson('"hello world')).toBe("hello world");
    });

    it("parses open string inside an object property", () => {
      expect(parsePartialJson('{"newText": "hello wor')).toEqual({ newText: "hello wor" });
    });

    it("preserves trailing whitespace inside an open string", () => {
      expect(parsePartialJson('{"newText": "hello ')).toEqual({ newText: "hello " });
      expect(parsePartialJson('"trailing space   ')).toBe("trailing space   ");
    });

    it("parses open string inside an array", () => {
      expect(parsePartialJson('["first", "secon')).toEqual(["first", "secon"]);
    });

    it("handles escaped quotes inside an open string", () => {
      expect(parsePartialJson('{"text": "he said \\"hello')).toEqual({ text: 'he said "hello' });
    });

    it("handles empty open string", () => {
      expect(parsePartialJson('"')).toBe("");
      expect(parsePartialJson('{"key": "')).toEqual({ key: "" });
    });

    it("reflects growing string as tokens arrive", () => {
      expect(parsePartialJson('{"edits": [{"newText": "func')).toEqual({ edits: [{ newText: "func" }] });
      expect(parsePartialJson('{"edits": [{"newText": "function foo() {')).toEqual({ edits: [{ newText: "function foo() {" }] });
      expect(parsePartialJson('{"edits": [{"newText": "function foo() {\\n  return 42;\\n}'))
        .toEqual({ edits: [{ newText: "function foo() {\n  return 42;\n}" }] });
    });
  });

  describe("escape at cut", () => {
    it("drops dangling single backslash at cut", () => {
      const input = '{"text": "hello' + String.fromCharCode(92);
      expect(parsePartialJson(input)).toEqual({ text: "hello" });
    });

    it("drops dangling escape at cut for top-level open string", () => {
      const input = '"hello' + String.fromCharCode(92);
      expect(parsePartialJson(input)).toBe("hello");
    });

    it("preserves escaped backslash (double backslash) at cut", () => {
      const input = '{"text": "hello' + String.fromCharCode(92) + String.fromCharCode(92);
      expect(parsePartialJson(input)).toEqual({ text: "hello\\" });
    });

    it("drops dangling backslash when preceded by escaped backslash (3 backslashes)", () => {
      const input = '{"text": "hello' + String.fromCharCode(92).repeat(3);
      expect(parsePartialJson(input)).toEqual({ text: "hello\\" });
    });

    it("drops incomplete unicode escape sequences", () => {
      const bs = String.fromCharCode(92);
      expect(parsePartialJson(`{"text": "hello${bs}u`)).toEqual({ text: "hello" });
      expect(parsePartialJson(`{"text": "hello${bs}u1`)).toEqual({ text: "hello" });
      expect(parsePartialJson(`{"text": "hello${bs}u12`)).toEqual({ text: "hello" });
      expect(parsePartialJson(`{"text": "hello${bs}u123`)).toEqual({ text: "hello" });
    });

    it("preserves complete unicode escape sequences", () => {
      const bs = String.fromCharCode(92);
      expect(parsePartialJson(`{"text": "hello${bs}u0041`)).toEqual({ text: "helloA" });
    });
  });

  describe("nested arrays and objects", () => {
    it("closes deeply nested open objects and arrays", () => {
      expect(parsePartialJson('{"a": {"b": {"c": {"d": "val')).toEqual({
        a: { b: { c: { d: "val" } } },
      });
      expect(parsePartialJson('{"edits": [{"range": [0, 10], "newText": "abc')).toEqual({
        edits: [{ range: [0, 10], newText: "abc" }],
      });
      expect(parsePartialJson('[[1, 2], [3, 4')).toEqual([[1, 2], [3, 4]]);
      expect(parsePartialJson('{"a": [{}, {"b": [')).toEqual({ a: [{}, { b: [] }] });
    });

    it("closes open empty containers", () => {
      expect(parsePartialJson("{")).toEqual({});
      expect(parsePartialJson("[")).toEqual([]);
      expect(parsePartialJson('{"a": {')).toEqual({ a: {} });
      expect(parsePartialJson('{"a": [')).toEqual({ a: [] });
    });
  });

  describe("numbers cut mid-way", () => {
    it("drops trailing incomplete numbers in objects", () => {
      expect(parsePartialJson('{"count": -')).toEqual({});
      expect(parsePartialJson('{"count": 12.')).toEqual({});
      expect(parsePartialJson('{"count": 12e')).toEqual({});
      expect(parsePartialJson('{"count": 12e+')).toEqual({});
      expect(parsePartialJson('{"count": 12e-')).toEqual({});
      expect(parsePartialJson('{"count": -0.')).toEqual({});
    });

    it("drops trailing incomplete numbers in arrays", () => {
      expect(parsePartialJson("[1, 2, -")).toEqual([1, 2]);
      expect(parsePartialJson("[1, 2, 12.")).toEqual([1, 2]);
      expect(parsePartialJson("[1, 2, 12e")).toEqual([1, 2]);
    });

    it("returns undefined for incomplete numbers at top-level", () => {
      expect(parsePartialJson("-")).toBeUndefined();
      expect(parsePartialJson("12.")).toBeUndefined();
      expect(parsePartialJson("12e")).toBeUndefined();
    });

    it("parses complete numbers at any stage", () => {
      expect(parsePartialJson('{"count": 12')).toEqual({ count: 12 });
      expect(parsePartialJson('{"count": 12.5')).toEqual({ count: 12.5 });
      expect(parsePartialJson('{"count": 12e5')).toEqual({ count: 12e5 });
      expect(parsePartialJson('{"count": -42')).toEqual({ count: -42 });
      expect(parsePartialJson("[1, 2, 3")).toEqual([1, 2, 3]);
      expect(parsePartialJson("123")).toBe(123);
    });
  });

  describe("true / false / null cut mid-way", () => {
    it("drops incomplete boolean and null literals in objects", () => {
      expect(parsePartialJson('{"active": t')).toEqual({});
      expect(parsePartialJson('{"active": tr')).toEqual({});
      expect(parsePartialJson('{"active": tru')).toEqual({});
      expect(parsePartialJson('{"active": f')).toEqual({});
      expect(parsePartialJson('{"active": fa')).toEqual({});
      expect(parsePartialJson('{"active": fal')).toEqual({});
      expect(parsePartialJson('{"active": fals')).toEqual({});
      expect(parsePartialJson('{"data": n')).toEqual({});
      expect(parsePartialJson('{"data": nu')).toEqual({});
      expect(parsePartialJson('{"data": nul')).toEqual({});
    });

    it("drops incomplete boolean and null literals in arrays", () => {
      expect(parsePartialJson("[true, fal")).toEqual([true]);
      expect(parsePartialJson("[false, tru")).toEqual([false]);
      expect(parsePartialJson("[1, nul")).toEqual([1]);
    });

    it("returns undefined for incomplete literals at top-level", () => {
      expect(parsePartialJson("tru")).toBeUndefined();
      expect(parsePartialJson("fal")).toBeUndefined();
      expect(parsePartialJson("nul")).toBeUndefined();
    });

    it("parses complete boolean and null literals", () => {
      expect(parsePartialJson('{"active": true')).toEqual({ active: true });
      expect(parsePartialJson('{"active": false')).toEqual({ active: false });
      expect(parsePartialJson('{"data": null')).toEqual({ data: null });
      expect(parsePartialJson("true")).toBe(true);
      expect(parsePartialJson("false")).toBe(false);
      expect(parsePartialJson("null")).toBeNull();
    });
  });

  describe("incomplete trailing key and colon", () => {
    it("drops incomplete open key string", () => {
      expect(parsePartialJson('{"query": "rowan", "f')).toEqual({ query: "rowan" });
    });

    it("drops complete key string missing colon", () => {
      expect(parsePartialJson('{"query": "rowan", "filter"')).toEqual({ query: "rowan" });
    });

    it("drops key with colon but missing value", () => {
      expect(parsePartialJson('{"query": "rowan", "filter":')).toEqual({ query: "rowan" });
    });

    it("drops trailing comma", () => {
      expect(parsePartialJson('{"query": "rowan",')).toEqual({ query: "rowan" });
      expect(parsePartialJson("[1, 2,")).toEqual([1, 2]);
    });
  });

  describe("unusable and empty input", () => {
    it("returns undefined for empty or whitespace strings", () => {
      expect(parsePartialJson("")).toBeUndefined();
      expect(parsePartialJson("   ")).toBeUndefined();
      expect(parsePartialJson("\n\t")).toBeUndefined();
    });

    it("returns undefined for non-JSON content", () => {
      expect(parsePartialJson("foo")).toBeUndefined();
      expect(parsePartialJson("}")).toBeUndefined();
      expect(parsePartialJson("]")).toBeUndefined();
      expect(parsePartialJson(":")).toBeUndefined();
    });
  });
});
