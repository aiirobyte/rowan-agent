import type { JsonValue } from "../runtime-events";

const COMPLETE_NUMBER_REGEX = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function escapeRawControlChars(s: string): string {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const code = ch.charCodeAt(0);
    if (code === 0x0a) result += "\\n";
    else if (code === 0x0d) result += "\\r";
    else if (code === 0x09) result += "\\t";
    else if (code < 0x20) result += "\\u" + code.toString(16).padStart(4, "0");
    else result += ch;
  }
  return result;
}

function cleanOpenString(raw: string): string {
  let s = raw;
  let backslashes = 0;
  while (s.length - 1 - backslashes >= 0 && s[s.length - 1 - backslashes] === "\\") {
    backslashes++;
  }
  if (backslashes % 2 === 1) {
    s = s.slice(0, -1);
  } else {
    s = s.replace(/(^|[^\\])(?:\\\\)*\\u[0-9a-fA-F]{0,3}$/, (match) => {
      const uIndex = match.lastIndexOf("\\u");
      return match.slice(0, uIndex);
    });
  }
  return escapeRawControlChars(s) + '"';
}

type Container = {
  kind: "object" | "array";
  safeEnd: number;
  state: "expect_key" | "expect_colon" | "expect_value" | "after_value";
};

function repairPartialJson(input: string): string | undefined {
  const stack: Container[] = [];
  let i = 0;
  let hasTopLevelValue = false;
  let topLevelSafeEnd = 0;

  function finishWithSafeEnd(safeEnd: number): string {
    let result = input.slice(0, safeEnd);
    for (let j = stack.length - 1; j >= 0; j--) {
      result += stack[j]!.kind === "object" ? "}" : "]";
    }
    return result;
  }

  function closeStackWithPrefix(prefix: string): string {
    let result = prefix;
    for (let j = stack.length - 1; j >= 0; j--) {
      result += stack[j]!.kind === "object" ? "}" : "]";
    }
    return result;
  }

  function popContainer(endIndex: number): void {
    stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.safeEnd = endIndex;
      parent.state = "after_value";
    } else {
      hasTopLevelValue = true;
      topLevelSafeEnd = endIndex;
    }
  }

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    const current = stack[stack.length - 1];

    if (!current) {
      if (hasTopLevelValue) break;

      if (ch === "{") {
        stack.push({ kind: "object", safeEnd: i + 1, state: "expect_key" });
        i++;
      } else if (ch === "[") {
        stack.push({ kind: "array", safeEnd: i + 1, state: "expect_value" });
        i++;
      } else if (ch === '"') {
        const strStart = i;
        i++;
        let closed = false;
        while (i < input.length) {
          if (input[i] === "\\") {
            i += 2;
          } else if (input[i] === '"') {
            i++;
            closed = true;
            break;
          } else {
            i++;
          }
        }
        if (closed) {
          hasTopLevelValue = true;
          topLevelSafeEnd = i;
        } else {
          return cleanOpenString(input.slice(strStart));
        }
      } else {
        const tokStart = i;
        while (i < input.length && !/[\s,}\]]/.test(input[i]!)) {
          i++;
        }
        const tok = input.slice(tokStart, i);
        if (tok === "true" || tok === "false" || tok === "null" || COMPLETE_NUMBER_REGEX.test(tok)) {
          hasTopLevelValue = true;
          topLevelSafeEnd = i;
        } else {
          return undefined;
        }
      }
      continue;
    }

    if (current.kind === "object") {
      if (current.state === "expect_key") {
        if (ch === "}") {
          i++;
          popContainer(i);
        } else if (ch === '"') {
          i++;
          let closed = false;
          while (i < input.length) {
            if (input[i] === "\\") {
              i += 2;
            } else if (input[i] === '"') {
              i++;
              closed = true;
              break;
            } else {
              i++;
            }
          }
          if (closed) {
            current.state = "expect_colon";
          } else {
            return finishWithSafeEnd(current.safeEnd);
          }
        } else {
          return finishWithSafeEnd(current.safeEnd);
        }
      } else if (current.state === "expect_colon") {
        if (ch === ":") {
          current.state = "expect_value";
          i++;
        } else {
          return finishWithSafeEnd(current.safeEnd);
        }
      } else if (current.state === "expect_value") {
        if (ch === '"') {
          const valStart = i;
          i++;
          let closed = false;
          while (i < input.length) {
            if (input[i] === "\\") {
              i += 2;
            } else if (input[i] === '"') {
              i++;
              closed = true;
              break;
            } else {
              i++;
            }
          }
          if (closed) {
            current.safeEnd = i;
            current.state = "after_value";
          } else {
            const prefix = input.slice(0, valStart);
            const repairedStr = cleanOpenString(input.slice(valStart));
            return closeStackWithPrefix(prefix + repairedStr);
          }
        } else if (ch === "{") {
          stack.push({ kind: "object", safeEnd: i + 1, state: "expect_key" });
          i++;
        } else if (ch === "[") {
          stack.push({ kind: "array", safeEnd: i + 1, state: "expect_value" });
          i++;
        } else if (ch === "}" || ch === "]") {
          return finishWithSafeEnd(current.safeEnd);
        } else {
          const tokStart = i;
          while (i < input.length && !/[\s,}\]]/.test(input[i]!)) {
            i++;
          }
          const tok = input.slice(tokStart, i);
          if (tok === "true" || tok === "false" || tok === "null" || COMPLETE_NUMBER_REGEX.test(tok)) {
            current.safeEnd = i;
            current.state = "after_value";
          } else {
            return finishWithSafeEnd(current.safeEnd);
          }
        }
      } else if (current.state === "after_value") {
        if (ch === ",") {
          current.state = "expect_key";
          i++;
        } else if (ch === "}") {
          i++;
          popContainer(i);
        } else {
          return finishWithSafeEnd(current.safeEnd);
        }
      }
    } else {
      // current.kind === "array"
      if (current.state === "expect_value") {
        if (ch === "]") {
          i++;
          popContainer(i);
        } else if (ch === '"') {
          const valStart = i;
          i++;
          let closed = false;
          while (i < input.length) {
            if (input[i] === "\\") {
              i += 2;
            } else if (input[i] === '"') {
              i++;
              closed = true;
              break;
            } else {
              i++;
            }
          }
          if (closed) {
            current.safeEnd = i;
            current.state = "after_value";
          } else {
            const prefix = input.slice(0, valStart);
            const repairedStr = cleanOpenString(input.slice(valStart));
            return closeStackWithPrefix(prefix + repairedStr);
          }
        } else if (ch === "{") {
          stack.push({ kind: "object", safeEnd: i + 1, state: "expect_key" });
          i++;
        } else if (ch === "[") {
          stack.push({ kind: "array", safeEnd: i + 1, state: "expect_value" });
          i++;
        } else if (ch === "}") {
          return finishWithSafeEnd(current.safeEnd);
        } else {
          const tokStart = i;
          while (i < input.length && !/[\s,}\]]/.test(input[i]!)) {
            i++;
          }
          const tok = input.slice(tokStart, i);
          if (tok === "true" || tok === "false" || tok === "null" || COMPLETE_NUMBER_REGEX.test(tok)) {
            current.safeEnd = i;
            current.state = "after_value";
          } else {
            return finishWithSafeEnd(current.safeEnd);
          }
        }
      } else if (current.state === "after_value") {
        if (ch === ",") {
          current.state = "expect_value";
          i++;
        } else if (ch === "]") {
          i++;
          popContainer(i);
        } else {
          return finishWithSafeEnd(current.safeEnd);
        }
      }
    }
  }

  if (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    return finishWithSafeEnd(current.safeEnd);
  }
  if (hasTopLevelValue) {
    return input.slice(0, topLevelSafeEnd);
  }
  return undefined;
}

/**
 * Best-effort parse of an incomplete JSON prefix.
 *
 * Closes open strings (dropping dangling escapes or partial \uXXXX),
 * closes open objects/arrays, and drops incomplete trailing keys/colons/literals.
 * Returns undefined when nothing usable parses.
 */
export function parsePartialJson(input: string): JsonValue | undefined {
  if (typeof input !== "string") return undefined;
  if (!input.trim()) return undefined;
  const source = input.trimStart();
  try {
    return JSON.parse(source) as JsonValue;
  } catch {}
  const repaired = repairPartialJson(source);
  if (repaired === undefined) return undefined;
  try {
    return JSON.parse(repaired) as JsonValue;
  } catch {
    return undefined;
  }
}
