import Type from "typebox";
import Schema from "typebox/schema";
import type { Tool, ToolContext, ToolResult } from "@rowan-agent/agent";
import { type WorkspaceContext } from "../workspace";

const TestArgsSchema = Type.Object({
  command: Type.String(),
});

type TestArgs = Type.Static<typeof TestArgsSchema>;
const TestArgsValidator = Schema.Compile(TestArgsSchema);

export function createWorkspaceTestTool(context: WorkspaceContext): Tool<TestArgs> {
  return {
    name: "workspace.test",
    description: "Runs an allowlisted test command in the workspace. This tool is only available when execute access is enabled.",
    parameters: TestArgsSchema,
    async execute(args: TestArgs, toolContext: ToolContext): Promise<ToolResult> {
      if (!context.allowExecute) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.test",
          ok: false,
          content: null,
          error: "Workspace execute access is disabled.",
        };
      }

      const parsed = TestArgsValidator.Parse(args);
      const allowed = context.allowedTestCommands ?? [];
      if (!allowed.includes(parsed.command)) {
        return {
          toolCallId: toolContext.toolCallId,
          toolName: "workspace.test",
          ok: false,
          content: null,
          error: `Command is not allowlisted: ${parsed.command}`,
        };
      }

      const proc = Bun.spawn(["sh", "-lc", parsed.command], {
        cwd: context.root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      return {
        toolCallId: toolContext.toolCallId,
        toolName: "workspace.test",
        ok: exitCode === 0,
        content: {
          command: parsed.command,
          exitCode,
          stdout,
          stderr,
        },
        ...(exitCode === 0 ? {} : { error: `Command exited with ${exitCode}.` }),
      };
    },
  };
}
