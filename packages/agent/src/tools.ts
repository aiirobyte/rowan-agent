import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "./types";

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
  path: Type.String(),
  maxBytes: Type.Optional(Type.Number()),
});

type ReadArgs = Type.Static<typeof ReadArgsSchema>;
const ReadArgsValidator = Schema.Compile(ReadArgsSchema);

const WriteArgsSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

type WriteArgs = Type.Static<typeof WriteArgsSchema>;
const WriteArgsValidator = Schema.Compile(WriteArgsSchema);

const EditArgsSchema = Type.Object({
  path: Type.String(),
  oldText: Type.String(),
  newText: Type.String(),
  replaceAll: Type.Optional(Type.Boolean()),
});

type EditArgs = Type.Static<typeof EditArgsSchema>;
const EditArgsValidator = Schema.Compile(EditArgsSchema);

const BashArgsSchema = Type.Object({
  command: Type.String(),
  cwd: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  maxOutputBytes: Type.Optional(Type.Number()),
});

type BashArgs = Type.Static<typeof BashArgsSchema>;
const BashArgsValidator = Schema.Compile(BashArgsSchema);

type CapturedOutput = {
  text: string;
  truncated: boolean;
};

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

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

function positiveNumber(value: number, name: string): string | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return `${name} must be a positive number.`;
  }
  return undefined;
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
    description: "Reads a text file within the workspace.",
    parameters: ReadArgsSchema,
    async execute(args: ReadArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = ReadArgsValidator.Parse(args);
      const resolved = resolveCoreToolPath(context, parsed.path);
      const maxBytes = parsed.maxBytes ?? context.maxReadBytes;
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
      const sliced = bytes.subarray(0, maxBytes);
      return toolResult({
        context: toolContext,
        toolName: "read",
        ok: true,
        content: {
          path: resolved.relativePath,
          content: new TextDecoder().decode(sliced),
          sizeBytes: bytes.byteLength,
          truncated: bytes.byteLength > maxBytes,
        },
      });
    },
  };
}

export function createWriteTool(context: NormalizedCoreToolContext): Tool<WriteArgs> {
  return {
    name: "write",
    description: "Writes provided text content to a workspace file, creating parent directories as needed.",
    parameters: WriteArgsSchema,
    async execute(args: WriteArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = WriteArgsValidator.Parse(args);
      const resolved = resolveCoreToolPath(context, parsed.path);
      await mkdir(dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, parsed.content, "utf8");

      return toolResult({
        context: toolContext,
        toolName: "write",
        ok: true,
        content: {
          path: resolved.relativePath,
          bytesWritten: new TextEncoder().encode(parsed.content).byteLength,
        },
      });
    },
  };
}

export function createEditTool(context: NormalizedCoreToolContext): Tool<EditArgs> {
  return {
    name: "edit",
    description: "Edits a workspace text file by replacing exact oldText with newText.",
    parameters: EditArgsSchema,
    async execute(args: EditArgs, toolContext: ToolContext): Promise<ToolResult> {
      const parsed = EditArgsValidator.Parse(args);
      if (!parsed.oldText) {
        return toolResult({
          context: toolContext,
          toolName: "edit",
          ok: false,
          content: null,
          error: "oldText must not be empty.",
        });
      }

      const resolved = resolveCoreToolPath(context, parsed.path);
      const current = await readFile(resolved.absolutePath, "utf8");
      if (!current.includes(parsed.oldText)) {
        return toolResult({
          context: toolContext,
          toolName: "edit",
          ok: false,
          content: null,
          error: `oldText not found in ${resolved.relativePath}.`,
        });
      }

      const matches = current.split(parsed.oldText).length - 1;
      if (matches > 1 && !parsed.replaceAll) {
        return toolResult({
          context: toolContext,
          toolName: "edit",
          ok: false,
          content: null,
          error: `oldText appears ${matches} times in ${resolved.relativePath}; set replaceAll=true or provide more context.`,
        });
      }

      const replacements = parsed.replaceAll ? matches : 1;
      const next = parsed.replaceAll
        ? current.split(parsed.oldText).join(parsed.newText)
        : current.replace(parsed.oldText, parsed.newText);
      await writeFile(resolved.absolutePath, next, "utf8");

      return toolResult({
        context: toolContext,
        toolName: "edit",
        ok: true,
        content: {
          path: resolved.relativePath,
          replacements,
          bytesWritten: new TextEncoder().encode(next).byteLength,
        },
      });
    },
  };
}

export function createBashTool(context: NormalizedCoreToolContext): Tool<BashArgs> {
  return {
    name: "bash",
    description: "Runs a bash command within the workspace.",
    parameters: BashArgsSchema,
    async execute(args: BashArgs, toolContext: ToolContext, signal?: AbortSignal): Promise<ToolResult> {
      const parsed = BashArgsValidator.Parse(args);
      const timeoutMs = parsed.timeoutMs ?? context.bashTimeoutMs;
      const maxOutputBytes = parsed.maxOutputBytes ?? context.maxBashOutputBytes;
      const invalidTimeout = positiveNumber(timeoutMs, "timeoutMs");
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

      const cwd = resolveCoreToolPath(context, parsed.cwd ?? ".");
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

        return toolResult({
          context: toolContext,
          toolName: "bash",
          ok,
          content: {
            command: parsed.command,
            cwd: cwd.relativePath,
            exitCode,
            stdout: stdout.text,
            stderr: stderr.text,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: stderr.truncated,
          },
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
    createWriteTool(context),
    createEditTool(context),
    createBashTool(context),
  ];
}
