import type {
  JsonObject,
  JsonValue,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolKind,
} from "@rowan-agent/models";
import type { ToolExecutionResult } from "../runtime-events";

export type ToolCallPresentationInput = Readonly<{
  status: ToolCallStatus;
  args: JsonValue;
  progress?: JsonValue;
  result?: ToolExecutionResult;
}>;

export type ToolCallPresentationOutput = {
  title?: string;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  _meta?: JsonObject;
};

export type ToolCallMergeTarget = {
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
  rawInput?: JsonValue;
  rawOutput?: JsonValue;
  _meta?: JsonObject;
};

export type ToolCallMergePatch = {
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
  rawInput?: JsonValue;
  rawOutput?: JsonValue;
  _meta?: JsonObject;
};

export function isValidPresentationOutput(output: unknown): output is ToolCallPresentationOutput {
  if (typeof output !== "object" || output === null || Array.isArray(output)) return false;
  const o = output as Record<string, unknown>;
  if (o.title !== undefined && typeof o.title !== "string") return false;
  if (o.locations !== undefined) {
    if (!Array.isArray(o.locations)) return false;
    for (const loc of o.locations) {
      if (typeof loc !== "object" || loc === null || typeof loc.path !== "string") return false;
      if (loc.line !== undefined && typeof loc.line !== "number") return false;
    }
  }
  if (o.content !== undefined) {
    if (!Array.isArray(o.content)) return false;
    for (const c of o.content) {
      if (typeof c !== "object" || c === null || typeof c.type !== "string") return false;
    }
  }
  if (o._meta !== undefined) {
    if (typeof o._meta !== "object" || o._meta === null || Array.isArray(o._meta)) return false;
  }
  return true;
}

export function mergeToolCall<T extends ToolCallMergeTarget>(
  target: T,
  patch: ToolCallMergePatch,
): T {
  if (patch.title !== undefined) target.title = patch.title;
  if (patch.kind !== undefined) target.kind = patch.kind;
  if (patch.status !== undefined) target.status = patch.status;
  if (patch.locations !== undefined) target.locations = structuredClone(patch.locations);
  if (patch.content !== undefined) target.content = structuredClone(patch.content);
  if (patch.rawInput !== undefined) target.rawInput = structuredClone(patch.rawInput);
  if (patch.rawOutput !== undefined) target.rawOutput = structuredClone(patch.rawOutput);
  if (patch._meta !== undefined) {
    target._meta = {
      ...(target._meta ?? {}),
      ...structuredClone(patch._meta),
    };
  }
  return target;
}
