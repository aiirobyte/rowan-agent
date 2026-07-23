import type { JsonValue } from "../runtime-events";

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyDataProperties(value: object): boolean {
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor);
  });
}

function visit(value: unknown, seen: Set<object>): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || !hasOnlyDataProperties(value)) return false;
      if (Reflect.ownKeys(value).some((key) => key !== "length" && typeof key !== "string")) return false;
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index) || !visit(value[index], seen)) return false;
      }
      return true;
    }
    if (!isPlainObject(value) || !hasOnlyDataProperties(value)) return false;
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) return false;
    if (Object.prototype.hasOwnProperty.call(value, "toJSON")) return false;
    return Object.keys(value).every((key) => visit(value[key], seen));
  } finally {
    seen.delete(value);
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  return visit(value, new Set());
}

export function assertJsonValue(value: unknown, argument = "value"): asserts value is JsonValue {
  if (!isJsonValue(value)) throw new TypeError(`${argument} must be JSON-safe`);
}

export function canonicalJson(value: JsonValue): string {
  assertJsonValue(value);
  const encode = (candidate: JsonValue): string => {
    if (candidate === null || typeof candidate !== "object") return JSON.stringify(candidate);
    if (Array.isArray(candidate)) return `[${candidate.map(encode).join(",")}]`;
    const object = candidate as { readonly [key: string]: JsonValue };
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${encode(object[key]!)}`).join(",")}}`;
  };
  return encode(value);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertUtf8ByteLimit(value: string, limit: number, argument = "value"): void {
  if (utf8ByteLength(value) > limit) throw new RangeError(`${argument} exceeds ${limit} UTF-8 bytes`);
}
