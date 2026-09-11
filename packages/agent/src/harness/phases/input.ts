import type { JsonValue } from "../../runtime-events";
import { isJsonValue } from "../../runtime/json";
import type { PhaseInput } from "./types";
import Type from "typebox";
import Schema from "typebox/schema";

/** Parse the structural defaults declared by a Phase's `input` mapping. */
export function parsePhaseInput(value: unknown): PhaseInput | undefined {
  if (value === undefined) return undefined;
  if (!isJsonValue(value) || value === null || Array.isArray(value)) {
    throw new TypeError("input must be a JSON-safe object");
  }
  return value as PhaseInput;
}

/** A JSON-safe scalar or container used by a Phase input definition. */
export type PhaseInputValue = JsonValue;

/** Build the Model-facing schema directly from structural input defaults. */
export function phaseInputSchema(input: PhaseInput): Type.TSchema {
  return schemaForObject(input);
}

/** Validate and materialize one Phase invocation payload. */
export function preparePhasePayload(input: PhaseInput | undefined, payload: unknown): JsonValue | undefined {
  if (payload !== undefined && !isJsonValue(payload)) {
    throw new TypeError("Phase payload must be JSON-safe");
  }
  if (input === undefined || payload === undefined) {
    if (input === undefined) return payload as JsonValue | undefined;
    return mergeDefaultObject(input, {});
  }

  const validator = Schema.Compile(phaseInputSchema(input));
  if (!validator.Check(payload)) {
    throw new TypeError("Phase payload does not match the Phase input definition");
  }
  return mergeDefaultObject(input, payload as Readonly<Record<string, JsonValue>>);
}

function schemaForValue(value: JsonValue): Type.TSchema {
  if (value === null) return Type.Unknown();
  if (typeof value === "string") return Type.String();
  if (typeof value === "boolean") return Type.Boolean();
  if (typeof value === "number") return Type.Number();
  if (Array.isArray(value)) {
    if (value.length === 0) return Type.Array(Type.Unknown());
    const schemas = value.map(schemaForValue);
    const unique = new Map(schemas.map((schema) => [JSON.stringify(schema), schema]));
    const item = unique.size === 1 ? [...unique.values()][0]! : Type.Union([...unique.values()]);
    return Type.Array(item);
  }
  if (!isJsonObject(value)) throw new TypeError("Phase input values must be JSON-safe");
  return schemaForObject(value);
}

function schemaForObject(value: Readonly<Record<string, JsonValue>>): Type.TSchema {
  const keys = Object.keys(value);
  if (keys.length === 0) return Type.Record(Type.String(), Type.Unknown());
  const properties = Object.fromEntries(keys.map((key) => [key, schemaForValue(value[key]!)]));
  return Type.Partial(Type.Object(properties), { additionalProperties: false });
}

function mergeDefaultObject(
  defaults: Readonly<Record<string, JsonValue>>,
  payload: Readonly<Record<string, JsonValue>>,
): JsonValue {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(payload)) {
    const defaultValue = defaults[key];
    result[key] = defaultValue !== undefined
      && isJsonObject(defaultValue)
      && isJsonObject(value)
      ? mergeDefaultObject(defaultValue, value) as JsonValue
      : cloneJsonValue(value);
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      result[key] = cloneJsonValue(value);
    }
  }
  return result;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isJsonObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
  }
  return value;
}

function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
