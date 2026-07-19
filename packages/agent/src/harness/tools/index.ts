import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import Type from "typebox";
import Schema from "typebox/schema";
import type { ToolCall, ToolResult } from "../../protocol";
import type { AfterToolCall, BeforeToolCall, Tool, ToolContext } from "../../types";
import { formatResourceOutput, detectResourceType, type ResourceType } from "../context/resource-formatter";
import { parseFrontmatter, inferResourceName } from "../loader";
import { normalizeRelativePath } from "../path";

// Re-export route tool
export { createRouteTool, extractRouteCall, PhaseRouteTool } from "./route-tool";
export type { RouteToolArgs } from "./route-tool";

const DEFAULT_MAX_READ_BYTES = 64_000;
const DEFAULT_BASH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BASH_OUTPUT_BYTES = 64_000;

export type CoreToolContext = {
  root?: string;
  maxReadBytes?: number;
  bashTimeoutMs?: number;
  maxBashOutputBytes?: number;
};

type ResolvedCoreToolPath = {
  root: string;
  inputPath: string;
  absolutePath: string;
  relativePath: string;
};

type NormalizedCoreToolContext = Required<CoreToolContext>;

const ReadArgsSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read." }),
  offset: Type.Optional(Type.Number({ description: "1-based line to start from." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines." })),
});

type ReadArgs = Type.Static<typeof ReadArgsSchema>;
const ReadArgsValidator = Schema.Compile(ReadArgsSchema);

const WriteArgsSchema = Type.Object({
  path: Type.String({ description: "Path to the file to write." }),
  content: Type.String({ description: "Complete file contents." }),
});

type WriteArgs = Type.Static<typeof WriteArgsSchema>;
const WriteArgsValidator = Schema.Compile(WriteArgsSchema);

const EditArgsSchema = Type.Object({
  path: Type.String({ description: "Path to the file to edit." }),
  edits: Type.Array(Type.Object({
    oldText: Type.String({ description: "Exact unique text to replace." }),
    newText: Type.String({ description: "Replacement text." }),
  }), { description: "One or more non-overlapping replacements." }),
});

type EditArgs = Type.Static<typeof EditArgsSchema>;
const EditArgsValidator = Schema.Compile(EditArgsSchema);

const BashArgsSchema = Type.Object({
  command: Type.String({ description: "Bash command to execute." }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds." })),
});

type BashArgs = Type.Static<typeof BashArgsSchema>;
const BashArgsValidator = Schema.Compile(BashArgsSchema);

type CapturedOutput = {
  text: string;
  truncated: boolean;
};

type ToolArgsValidator = {
  Parse(value: unknown): unknown;
};

const validatorCache = new WeakMap<Type.TSchema, ToolArgsValidator>();

function validatorFor(schema: Type.TSchema): ToolArgsValidator {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }

  const validator = Schema.Compile(schema);
  validatorCache.set(schema, validator);
  return validator;
}

export type RuntimeToolExecutionEvent =
  | { type: "approval_requested"; tool: Tool; args: unknown }
  | {
      type: "approval_result";
      tool: Tool;
      args: unknown;
      decision: { allow: true } | { allow: false; reason: string };
    }
  | { type: "tool_start"; tool: Tool; args: unknown }
  | { type: "tool_blocked"; tool: Tool; reason: string }
  | { type: "result_review_requested"; tool: Tool; result: ToolResult }
  | { type: "result_review_result"; tool: Tool; result: ToolResult }
  | { type: "tool_end"; toolName: string; result: ToolResult };

export type RuntimeToolExecutionInput = {
  tools: Tool[];
  toolCall: ToolCall;
  toolContext: ToolContext;
  beforeToolCall?: BeforeToolCall;
  afterToolCall?: AfterToolCall;
  signal?: AbortSignal;
  observe?: (event: RuntimeToolExecutionEvent) => void | Promise<void>;
};

function normalizeCoreToolInputPath(path = "."): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/" || trimmed === "\\") {
    return ".";
  }

  return path;
}

function createCoreToolContext(input: CoreToolContext = {}): NormalizedCoreToolContext {
  return {
    root: resolve(input.root ?? process.cwd()),
    maxReadBytes: input.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
    bashTimeoutMs: input.bashTimeoutMs ?? DEFAULT_BASH_TIMEOUT_MS,
    maxBashOutputBytes: input.maxBashOutputBytes ?? DEFAULT_MAX_BASH_OUTPUT_BYTES,
  };
}

function resolveCoreToolPath(context: Pick<NormalizedCoreToolContext, "root">, path = "."): ResolvedCoreToolPath {
  const root = resolve(context.root);
  const inputPath = normalizeCoreToolInputPath(path);
  const absolutePath = resolve(root, inputPath);
  const relativePath = relative(root, absolutePath);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Path escapes workspace root: ${path}`);
  }

  return {
    root,
    inputPath,
    absolutePath,
    relativePath: normalizeRelativePath(relativePath || "."),
  };
}

function toolResult(input: {
  context: ToolContext;
  toolName: string;
  ok: boolean;
  content: unknown;
  error?: string;
}): ToolResult {
  return {
    toolCallId: input.context.toolCallId,
    toolName: input.toolName,
    ok: input.ok,
    content: input.content,
    ...(input.error ? { error: input.error } : {}),
  };
}

export async function executeRuntimeToolCall(input: RuntimeToolExecutionInput): Promise<ToolResult> {
  const tool = input.tools.find((candidate) => candidate.name === input.toolCall.name);
  if (!tool) {
    const result = toolResult({
      context: input.toolContext,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: `Unknown tool: ${input.toolCall.name}`,
    });
    await input.observe?.({ type: "tool_end", toolName: input.toolCall.name, result });
    return result;
  }

  let args: unknown;
  try {
    args = validatorFor(tool.parameters).Parse(input.toolCall.args);
  } catch (error) {
    const result = toolResult({
      context: input.toolContext,
      toolName: tool.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : String(error),
    });
    await input.observe?.({ type: "tool_end", toolName: tool.name, result });
    return result;
  }

  let decision: { allow: true } | { allow: false; reason: string } | undefined;
  if (input.beforeToolCall) {
    await input.observe?.({ type: "approval_requested", tool, args });
    decision = await input.beforeToolCall({ tool, args });
    await input.observe?.({
      type: "approval_result",
      tool,
      args,
      decision: decision ?? { allow: true },
    });
  }

  if (decision && !decision.allow) {
    const result = toolResult({
      context: input.toolContext,
      toolName: tool.name,
      ok: false,
      content: null,
      error: decision.reason,
    });
    await input.observe?.({ type: "tool_blocked", tool, reason: decision.reason });
    return result;
  }

  await input.observe?.({ type: "tool_start", tool, args });

  try {
    let result = await tool.execute(args, input.toolContext, input.signal);
    if (input.afterToolCall) {
      await input.observe?.({
        type: "result_review_requested",
        tool,
        result,
      });
      result = await input.afterToolCall({ tool, result });
      await input.observe?.({
        type: "result_review_result",
        tool,
        result,
      });
    }

    await input.observe?.({ type: "tool_end", toolName: tool.name, result });
    return result;
  } catch (error) {
    const result = toolResult({
      context: input.toolContext,
      toolName: tool.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : "Tool execution failed.",
    });
    await input.observe?.({ type: "tool_end", toolName: tool.name, result });
    return result;
  }
}

function positiveNumber(value: number, name: string): string | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return `${name} must be a positive number.`;
  }
  return undefined;
}

function positiveInteger(value: number, name: string): string | undefined {
  if (!Number.isInteger(value) || value <= 0) {
    return `${name} must be a positive integer.`;
  }
  return undefined;
}

function readTextLines(text: string, offset?: number, limit?: number): string {
  if (offset === undefined && limit === undefined) {
    return text;
  }

  const start = (offset ?? 1) - 1;
  const lines = text.split(/\r\n|\n|\r/);
  return lines.slice(start, limit === undefined ? undefined : start + limit).join("\n");
}

async function captureStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<CapturedOutput> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    const remainingBytes = maxBytes - totalBytes;
    if (remainingBytes > 0) {
      const kept = value.subarray(0, remainingBytes);
      chunks.push(kept);
      totalBytes += kept.byteLength;
    }

    if (value.byteLength > remainingBytes || totalBytes >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(bytes),
    truncated,
  };
}

export function createReadTool(context: NormalizedCoreToolContext): Tool<ReadArgs> {
  return {
    name: "read",
    description: "Read a file in the workspace.",
    parameters: ReadArgsSchema,
    promptSnippet: "Read file contents.",
    promptGuidelines: ["Read files before editing them."],
    async execute(args: ReadArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = ReadArgsValidator.Parse(args);
      const offsetError = parsed.offset === undefined ? undefined : positiveInteger(parsed.offset, "offset");
      const limitError = parsed.limit === undefined ? undefined : positiveInteger(parsed.limit, "limit");
      if (offsetError || limitError) {
        return toolResult({
          context: toolContext,
          toolName: "read",
          ok: false,
          content: null,
          error: offsetError ?? limitError,
        });
      }

      const resolved = resolveCoreToolPath(context, parsed.path);
      const maxBytes = context.maxReadBytes;
      const invalidLimit = positiveNumber(maxBytes, "maxBytes");
      if (invalidLimit) {
        return toolResult({
          context: toolContext,
          toolName: "read",
          ok: false,
          content: null,
          error: invalidLimit,
        });
      }

      const fileStat = await stat(resolved.absolutePath);
      if (!fileStat.isFile()) {
        return toolResult({
          context: toolContext,
          toolName: "read",
          ok: false,
          content: null,
          error: `Not a file: ${resolved.relativePath}`,
        });
      }

      const bytes = await readFile(resolved.absolutePath);
      const source = new TextDecoder().decode(bytes);
      const selected = readTextLines(source, parsed.offset, parsed.limit);
      const selectedBytes = new TextEncoder().encode(selected);
      const sliced = selectedBytes.subarray(0, maxBytes);
      const text = new TextDecoder().decode(sliced);

      // Resolve resource type and name
      const resourceType: ResourceType = detectResourceType(resolved.absolutePath);
      let name: string;
      let baseDir: string | undefined;

      if (resourceType === "skill" || resourceType === "phase") {
        const { frontmatter } = parseFrontmatter(text);
        const marker = resourceType === "skill" ? "SKILL.md" : "PHASE.md";
        name = (frontmatter.name as string) ?? inferResourceName(resolved.absolutePath, marker);
        baseDir = dirname(resolved.absolutePath);
      } else {
        name = inferResourceName(resolved.absolutePath, basename(resolved.absolutePath));
      }

      const formatted = resourceType === "skill" || resourceType === "phase"
        ? formatResourceOutput({ type: resourceType, name, location: resolved.absolutePath, content: text, baseDir })
        : text;
      const content = selectedBytes.byteLength > maxBytes ? `${formatted}\n[truncated]` : formatted;

      return toolResult({
        context: toolContext,
        toolName: "read",
        ok: true,
        content,
      });
    },
  };
}

export function createWriteTool(context: NormalizedCoreToolContext): Tool<WriteArgs> {
  return {
    name: "write",
    description: "Create or overwrite a file in the workspace.",
    parameters: WriteArgsSchema,
    promptSnippet: "Create or overwrite files.",
    promptGuidelines: ["Use edit for partial changes."],
    async execute(args: WriteArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = WriteArgsValidator.Parse(args);
      const resolved = resolveCoreToolPath(context, parsed.path);
      await mkdir(dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, parsed.content, "utf8");

      return toolResult({
        context: toolContext,
        toolName: "write",
        ok: true,
        content: `Successfully wrote ${parsed.content.length} bytes to ${resolved.relativePath}.`,
      });
    },
  };
}

function applyEditReplacements(
  current: string,
  edits: EditArgs["edits"],
): { content: string; replacements: number } {
  if (edits.length === 0) {
    throw new Error("edits must contain at least one replacement.");
  }

  const matches: Array<{ start: number; end: number; newText: string }> = [];
  for (const edit of edits) {
    if (!edit.oldText) throw new Error("oldText must not be empty.");

    const start = current.indexOf(edit.oldText);
    if (start < 0) throw new Error(`oldText not found in file.`);
    const second = current.indexOf(edit.oldText, start + edit.oldText.length);
    if (second >= 0) {
      const count = current.split(edit.oldText).length - 1;
      throw new Error(`oldText appears ${count} times; provide more context.`);
    }

    matches.push({ start, end: start + edit.oldText.length, newText: edit.newText });
  }

  matches.sort((a, b) => a.start - b.start);
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const currentMatch = matches[index];
    if (currentMatch.start < previous.end) {
      throw new Error("edits must not overlap.");
    }
  }

  let content = current;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    content = content.slice(0, match.start) + match.newText + content.slice(match.end);
  }
  return { content, replacements: matches.length };
}

export function createEditTool(context: NormalizedCoreToolContext): Tool<EditArgs> {
  return {
    name: "edit",
    description: "Apply exact text replacements to a workspace file.",
    parameters: EditArgsSchema,
    promptSnippet: "Apply exact text replacements.",
    promptGuidelines: ["Read the file first; each oldText must match exactly once."],
    async execute(args: EditArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = EditArgsValidator.Parse(args);
      const resolved = resolveCoreToolPath(context, parsed.path);
      const current = await readFile(resolved.absolutePath, "utf8");
      let next: string;
      let replacements: number;
      try {
        const result = applyEditReplacements(current, parsed.edits);
        next = result.content;
        replacements = result.replacements;
      } catch (error) {
        return toolResult({
          context: toolContext,
          toolName: "edit",
          ok: false,
          content: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await writeFile(resolved.absolutePath, next, "utf8");

      return toolResult({
        context: toolContext,
        toolName: "edit",
        ok: true,
        content: `Successfully replaced ${replacements} block(s) in ${resolved.relativePath}.`,
      });
    },
  };
}

export function createBashTool(context: NormalizedCoreToolContext): Tool<BashArgs> {
  return {
    name: "bash",
    description: "Run a bash command in the workspace.",
    parameters: BashArgsSchema,
    promptSnippet: "Run shell commands.",
    promptGuidelines: ["Use read/write/edit for file operations."],
    async execute(args: BashArgs, toolContext: ToolContext, signal?: AbortSignal): Promise<ToolResult> {
      const parsed = BashArgsValidator.Parse(args);
      const timeoutMs = parsed.timeout === undefined ? context.bashTimeoutMs : parsed.timeout * 1000;
      const maxOutputBytes = context.maxBashOutputBytes;
      const invalidTimeout = positiveNumber(timeoutMs, "timeout");
      const invalidOutputLimit = positiveNumber(maxOutputBytes, "maxOutputBytes");

      if (invalidTimeout || invalidOutputLimit) {
        return toolResult({
          context: toolContext,
          toolName: "bash",
          ok: false,
          content: null,
          error: invalidTimeout ?? invalidOutputLimit,
        });
      }

      const cwd = resolveCoreToolPath(context, ".");
      let timedOut = false;
      let aborted = false;
      const proc = Bun.spawn(["bash", "-lc", parsed.command], {
        cwd: cwd.absolutePath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const kill = () => {
        proc.kill();
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeoutMs);
      const onAbort = () => {
        aborted = true;
        kill();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          captureStream(proc.stdout, maxOutputBytes),
          captureStream(proc.stderr, maxOutputBytes),
          proc.exited,
        ]);
        const ok = exitCode === 0 && !timedOut && !aborted;
        const output = [stdout.text, stderr.text].filter(Boolean).join(stdout.text && stderr.text ? "\n" : "");
        const content = stdout.truncated || stderr.truncated ? `${output}\n[truncated]` : output;

        return toolResult({
          context: toolContext,
          toolName: "bash",
          ok,
          content,
          ...(ok
            ? {}
            : {
                error: timedOut
                  ? `Command timed out after ${timeoutMs}ms.`
                  : aborted
                    ? "Command aborted."
                    : `Command exited with ${exitCode}.`,
              }),
        });
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export function createCoreTools(input: CoreToolContext = {}): Tool[] {
  const context = createCoreToolContext(input);
  return [
    createReadTool(context),
    createBashTool(context),
    createEditTool(context),
    createWriteTool(context),
  ];
}
