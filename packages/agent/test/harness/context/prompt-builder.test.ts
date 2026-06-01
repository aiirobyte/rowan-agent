import { expect, test } from "bun:test";
import Type from "typebox";
import {
  buildModelRequest,
  buildPhaseContent,
  type PhaseSection,
} from "../../../src/harness/context/prompt-builder";
import {
  createBuiltinPhaseRegistry,
} from "../../../src/extensions";
import {
  resolvePhaseEntry,
} from "../../../src/loop/phases";
import { createId, createMessage, createAgentState } from "@rowan-agent/agent";
import type { PhaseInput, Tool, ToolResult } from "@rowan-agent/agent";

const builtinPhaseRegistry = createBuiltinPhaseRegistry();

function buildRequest(input: {
  context: PhaseInput;
  toolResults?: ToolResult[];
}) {
  const phase = resolvePhaseEntry(builtinPhaseRegistry, input.context.phase);
  if (!phase.buildPrompt) {
    throw new Error(`Missing buildPrompt for phase "${input.context.phase}".`);
  }
  return phase.buildPrompt(input.context, { toolResults: input.toolResults });
}

const echoTool: Tool<{ message: string }> = {
  name: "echo",
  description: "Returns the input message.",
  parameters: Type.Object({ message: Type.String() }),
  async execute(args, context) {
    return {
      toolCallId: context.toolCallId,
      toolName: "echo",
      ok: true,
      content: args.message,
    };
  },
};

function createTestTask() {
  return {
    id: createId("task"),
    title: "Echo task",
    instruction: "Use echo to answer.",
    acceptanceCriteria: ["Must include echo evidence."],
    toolNames: ["echo"],
    skillIds: ["writer"],
    status: "pending" as const,
    attempts: 0,
  };
}

function createTestInput(overrides: Partial<PhaseInput> & { input?: string; skills?: PhaseInput["skills"] } = {}): PhaseInput {
  const state = createAgentState({
    systemPrompt: overrides.systemPrompt ?? "Test system",
    input: overrides.input ?? "Use echo.",
    skills: overrides.skills,
  });
  return {
    phase: overrides.phase ?? "chat",
    systemPrompt: state.systemPrompt,
    messages: state.messages,
    tools: overrides.tools ?? [],
    skills: state.skills,
    ...("yield" in overrides ? { yield: overrides.yield } : {}),
  };
}

// ---------------------------------------------------------------------------
// buildModelRequest
// ---------------------------------------------------------------------------

test("buildModelRequest returns a valid LlmRequest with system, messages, and tools", () => {
  const input = createTestInput({ tools: [echoTool] });
  const req = buildModelRequest(input);

  expect(req.system).toContain("Test system");
  expect(req.system).toContain("You are the Rowan runtime");
  expect(req.messages.length).toBeGreaterThanOrEqual(1);
  expect(req.tools).toHaveLength(1);
  expect(req.tools![0].name).toBe("echo");
});

test("buildModelRequest includes skills in system prompt when present", () => {
  const input = createTestInput({
    skills: [{ id: "writer", path: "/skills/writer/SKILL.md", content: "Write concise plans.", toolNames: ["echo"] }],
  });
  const req = buildModelRequest(input);

  expect(req.system).toContain("Loaded skills");
  expect(req.system).toContain("writer");
});

test("buildModelRequest omits tools when empty", () => {
  const input = createTestInput({ tools: [] });
  const req = buildModelRequest(input);

  expect(req.tools).toBeUndefined();
});

test("buildModelRequest includes toolResults as a user message", () => {
  const input = createTestInput();
  const toolResults: ToolResult[] = [{
    toolCallId: "call_1",
    toolName: "echo",
    ok: true,
    content: "evidence",
  }];
  const req = buildModelRequest(input, { toolResults });

  const lastMsg = req.messages.at(-1);
  expect(lastMsg?.role).toBe("user");
  expect(lastMsg?.content).toContain("Previous tool results");
  expect(lastMsg?.content).toContain("evidence");
});

// ---------------------------------------------------------------------------
// buildPhaseContent
// ---------------------------------------------------------------------------

test("buildPhaseContent instructions section", () => {
  const input = createTestInput();
  const content = buildPhaseContent(input, [
    { type: "instructions", lines: ["Phase: chat", "Do something."] },
  ]);

  expect(content).toBe("Phase: chat\nDo something.");
});

test("buildPhaseContent userRequest section", () => {
  const input = createTestInput({ input: "What is 2+2?" });
  const content = buildPhaseContent(input, [{ type: "userRequest" }]);

  expect(content).toContain("Current user request:");
  expect(content).toContain('"What is 2+2?"');
});

test("buildPhaseContent task section extracts from yield", () => {
  const task = createTestTask();
  const input = createTestInput({ yield: { task } });
  const content = buildPhaseContent(input, [{ type: "task" }]);

  expect(content).toContain("Task:");
  expect(content).toContain("Echo task");
});

test("buildPhaseContent tools section", () => {
  const input = createTestInput({ tools: [echoTool] });
  const content = buildPhaseContent(input, [{ type: "tools" }]);

  expect(content).toContain("Available tools");
  expect(content).toContain("echo");
  expect(content).toContain("Returns the input message.");
});

test("buildPhaseContent taskOutput section", () => {
  const toolResults = [{ toolCallId: "call_1", toolName: "echo", ok: true, content: "result" }];
  const input = createTestInput({ yield: { task: createTestTask(), toolResults } });
  const content = buildPhaseContent(input, [{ type: "taskOutput" }]);

  expect(content).toContain("Task output:");
  expect(content).toContain("result");
});

test("buildPhaseContent joins multiple sections with blank lines", () => {
  const input = createTestInput({ input: "Hello" });
  const content = buildPhaseContent(input, [
    { type: "instructions", lines: ["Phase: test"] },
    { type: "userRequest" },
  ]);

  expect(content).toBe("Phase: test\n\nCurrent user request:\n\"Hello\"");
});

// ---------------------------------------------------------------------------
// Phase buildPrompt integration
// ---------------------------------------------------------------------------

test("chat phase buildPrompt returns LlmRequest with phase content", () => {
  const input = createTestInput({ phase: "chat", input: "What is 2 + 2?" });
  const req = buildRequest({ context: input });

  expect(req.system).toContain("Test system");
  expect(req.messages.length).toBeGreaterThanOrEqual(2);
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.role).toBe("user");
  expect(phaseMsg?.content).toContain("Phase: chat");
  expect(phaseMsg?.content).toContain('"What is 2 + 2?"');
});

test("plan phase buildPrompt includes tools and skills", () => {
  const input = createTestInput({
    phase: "plan",
    input: "Plan with echo.",
    tools: [echoTool],
    skills: [{ id: "writer", path: "/skills/writer/SKILL.md", content: "Write plans.", toolNames: ["echo"] }],
  });
  const req = buildRequest({ context: input });

  expect(req.tools).toHaveLength(1);
  expect(req.system).toContain("writer");
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: plan");
  expect(phaseMsg?.content).toContain("echo");
});

test("execute phase buildPrompt includes toolResults", () => {
  const task = createTestTask();
  const input = createTestInput({
    phase: "execute",
    input: "Use echo.",
    tools: [echoTool],
    yield: { task },
  });
  const toolResults: ToolResult[] = [{
    toolCallId: "call_prev",
    toolName: "echo",
    ok: true,
    content: "previous evidence",
  }];
  const req = buildRequest({ context: input, toolResults });

  expect(req.tools).toHaveLength(1);
  const toolResultsMsg = req.messages.find(m => typeof m.content === "string" && m.content.includes("Previous tool results"));
  expect(toolResultsMsg).toBeDefined();
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: execute");
});

test("verify phase buildPrompt includes task and taskOutput sections", () => {
  const task = createTestTask();
  const input = createTestInput({
    phase: "verify",
    input: "Verify echo.",
    yield: { task, toolResults: [{ toolCallId: "c1", toolName: "echo", ok: true, content: "evidence" }] },
  });
  const req = buildRequest({ context: input });

  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: verify");
  expect(phaseMsg?.content).toContain("Task:");
  expect(phaseMsg?.content).toContain("Task output:");
});

test("prompt builder excludes execution-scoped messages from conversation", () => {
  const state = createAgentState({ systemPrompt: "Test system", input: "Use echo." });
  state.messages.push(
    createMessage("assistant", "{\"route\":\"task\",\"message\":\"Creating.\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
    createMessage("tool", "{\"ok\":true,\"content\":\"tool evidence\"}", {
      toolName: "echo",
    }),
  );

  const testInput: PhaseInput = {
    phase: "chat",
    systemPrompt: state.systemPrompt,
    messages: state.messages,
    tools: [],
    skills: [],
  };

  const req = buildModelRequest(testInput);
  const allContent = req.messages.map(m => m.content).join("\n");

  expect(allContent).toContain("Use echo.");
  expect(allContent).not.toContain("tool evidence");
  expect(allContent).not.toContain("Creating.");
});
