import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import { type WorkspaceContext, resolveWorkspacePath } from "../workspace";

const DEFAULT_BASH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BASH_OUTPUT_BYTES = 64_000;

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

function positiveNumber(value: number, name: string): string | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return `${name} must be a positive number.`;
  }
  return undefined;
}

export function createWorkspaceBashTool(context: WorkspaceContext): Tool<BashArgs> {
  return {
    name: "workspace.bash",
    description:
      "Runs a bash command within the workspace. This tool is only available when execute access is enabled.",
    parameters: BashArgsSchema,
    async execute(args: BashArgs, toolContext: ToolContext, signal?: AbortSignal): Promise<ToolResult> {
      if (!context.allowExecute) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.bash",
          ok: false,
          content: null,
          error: "Workspace execute access is disabled.",
        };
      }

      const parsed = BashArgsValidator.Parse(args);
      const timeoutMs = parsed.timeoutMs ?? context.bashTimeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
      const maxOutputBytes = parsed.maxOutputBytes ?? context.maxBashOutputBytes ?? DEFAULT_MAX_BASH_OUTPUT_BYTES;
      const invalidTimeout = positiveNumber(timeoutMs, "timeoutMs");
      const invalidOutputLimit = positiveNumber(maxOutputBytes, "maxOutputBytes");

      if (invalidTimeout || invalidOutputLimit) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.bash",
          ok: false,
          content: null,
          error: invalidTimeout ?? invalidOutputLimit,
        };
      }

      const cwd = resolveWorkspacePath(context, parsed.cwd ?? ".");
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

        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.bash",
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
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
