import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCoreTools, type ToolInvocationContext } from "../../src";

const invocationContext = {
  agentId: "agent-1",
  runId: "run-1",
  toolCallId: "tool-1",
  reportProgress: () => {},
} as unknown as ToolInvocationContext;

test("core tools use the process permissions outside the working root", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "rowan-core-tools-"));
  const workspaceRoot = join(tempRoot, "workspace");
  const outsideRoot = join(tempRoot, "outside");
  const outsideFile = join(outsideRoot, "read-me.txt");
  const writtenFile = join(outsideRoot, "written.txt");

  try {
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(outsideFile, "outside content\n", "utf8");

    const tools = createCoreTools({ root: workspaceRoot });
    const read = tools.find((tool) => tool.name === "read");
    const write = tools.find((tool) => tool.name === "write");
    const edit = tools.find((tool) => tool.name === "edit");
    const bash = tools.find((tool) => tool.name === "bash");

    expect(read).toBeDefined();
    expect(write).toBeDefined();
    expect(edit).toBeDefined();
    expect(bash).toBeDefined();

    const readResult = await read!.execute(
      { path: join("..", "outside", "read-me.txt") },
      invocationContext,
      new AbortController().signal,
    );
    expect(readResult.ok).toBe(true);
    expect(readResult.content).toContain("outside content");

    const writeResult = await write!.execute(
      { path: writtenFile, content: "written content\n" },
      invocationContext,
      new AbortController().signal,
    );
    expect(writeResult.ok).toBe(true);
    expect(await readFile(writtenFile, "utf8")).toBe("written content\n");

    const editResult = await edit!.execute(
      {
        path: outsideFile,
        edits: [{ oldText: "outside content", newText: "edited content" }],
      },
      invocationContext,
      new AbortController().signal,
    );
    expect(editResult.ok).toBe(true);
    expect(await readFile(outsideFile, "utf8")).toBe("edited content\n");

    const bashResult = await bash!.execute(
      { command: `pwd && cat ${outsideFile}` },
      invocationContext,
      new AbortController().signal,
    );
    expect(bashResult.ok).toBe(true);
    expect(bashResult.content).toContain(`${workspaceRoot}\n`);
    expect(bashResult.content).toContain("edited content");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("large read and bash results spill the complete result and leave a bounded preview", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "rowan-core-spill-"));
  const archiveDir = join(tempRoot, "tool-results");
  const sourcePath = join(tempRoot, "large.txt");
  try {
    await writeFile(sourcePath, Array.from({ length: 2_100 }, (_, index) => `line-${index + 1}`).join("\n"), "utf8");
    const tools = createCoreTools({ root: tempRoot, archiveDir, maxReadBytes: 1024, maxBashOutputBytes: 1024 });
    const read = tools.find((tool) => tool.name === "read")!;
    const bash = tools.find((tool) => tool.name === "bash")!;
    const readResult = await read.execute({ path: sourcePath }, invocationContext, new AbortController().signal);
    expect(readResult.ok).toBe(true);
    expect(String(readResult.content)).toContain("Full result:");
    const readSpill = String(readResult.content).match(/Full result: (.+)/)?.[1]?.split("\n")[0];
    expect(readSpill).toBeTruthy();
    expect(await readFile(readSpill!, "utf8")).toContain("line-2100");

    const bashResult = await bash.execute({ command: "printf '0123456789%.0s' {1..400}" }, invocationContext, new AbortController().signal);
    expect(bashResult.ok).toBe(true);
    expect(String(bashResult.content)).toContain("Full result:");
    const bashSpill = String(bashResult.content).match(/Full result: (.+)/)?.[1]?.split("\n")[0];
    expect(bashSpill).toBeTruthy();
    expect((await readFile(bashSpill!, "utf8")).length).toBeGreaterThan(1_024);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
