import { expect, test } from "bun:test";
import Type from "typebox";
import {
  buildModelRequest,
} from "../../../src/harness/context/prompt-builder";
import {
  createBuiltinPhaseRegistry,
} from "../../../src/extensions";
import {
  resolvePhaseEntry,
} from "../../../src/loop/phases";
import { createId, createMessage, createAgentState } from "@rowan-agent/agent";
import type { PhaseInput, Tool } from "@rowan-agent/agent";

const builtinPhaseRegistry = createBuiltinPhaseRegistry();

function buildRequest(input: {
  context: PhaseInput;
}) {
  const phase = resolvePhaseEntry(builtinPhaseRegistry, input.context.phase);
  if (!phase.buildPrompt) {
    throw new Error(`Missing buildPrompt for phase "${input.context.phase}".`);
  }
  return phase.buildPrompt(input.context);
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
  expect(req.system).toContain("Available tools:");
  expect(req.messages.length).toBeGreaterThanOrEqual(1);
  expect(req.tools).toHaveLength(1);
  expect(req.tools![0].name).toBe("echo");
});

test("buildModelRequest includes skills in system prompt when present", () => {
  const input = createTestInput({
    skills: [{ name: "writer", description: "Write concise plans.", filePath: "/skills/writer/SKILL.md", baseDir: "/skills/writer", disableModelInvocation: false }],
  });
  const req = buildModelRequest(input);

  expect(req.system).toContain("<available_skills>");
  expect(req.system).toContain("writer");
});

test("buildModelRequest omits tools when empty", () => {
  const input = createTestInput({ tools: [] });
  const req = buildModelRequest(input);

  expect(req.tools).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Phase buildPrompt integration
// ---------------------------------------------------------------------------

test("chat phase buildPrompt returns LlmRequest with phase instructions", () => {
  const input = createTestInput({ phase: "chat", input: "What is 2 + 2?" });
  const req = buildRequest({ context: input });

  expect(req.system).toContain("Test system");
  expect(req.messages.length).toBeGreaterThanOrEqual(2);
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.role).toBe("user");
  expect(phaseMsg?.content).toContain("Phase: chat");
});

test("plan phase buildPrompt includes instructions", () => {
  const input = createTestInput({
    phase: "plan",
    input: "Plan with echo.",
    tools: [echoTool],
    skills: [{ name: "writer", description: "Write plans.", filePath: "/skills/writer/SKILL.md", baseDir: "/skills/writer", disableModelInvocation: false }],
  });
  const req = buildRequest({ context: input });

  expect(req.tools).toHaveLength(1);
  expect(req.system).toContain("writer");
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: plan");
});

test("execute phase buildPrompt includes instructions", () => {
  const task = createTestTask();
  const input = createTestInput({
    phase: "execute",
    input: "Use echo.",
    tools: [echoTool],
    yield: { task },
  });
  const req = buildRequest({ context: input });

  expect(req.tools).toHaveLength(1);
  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: execute");
});

test("verify phase buildPrompt includes instructions", () => {
  const task = createTestTask();
  const input = createTestInput({
    phase: "verify",
    input: "Verify echo.",
    yield: { task },
  });
  const req = buildRequest({ context: input });

  const phaseMsg = req.messages.at(-1);
  expect(phaseMsg?.content).toContain("Phase: verify");
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
      scope: "execution",
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
  const extractText = (m: { content: string | Array<{ type: string; text?: string; content?: string }> }) => {
    if (typeof m.content === "string") return m.content;
    return m.content.map(b => b.type === "text" ? (b.text ?? "") : b.type === "tool_result" ? (b.content ?? "") : "").join(" ");
  };
  const allContent = req.messages.map(extractText).join("\n");

  expect(allContent).toContain("Use echo.");
  // Execution-scoped tool messages are now included for native tool_call format
  expect(allContent).toContain("tool evidence");
  // Routing decisions (non-tool execution messages) are still excluded
  expect(allContent).not.toContain("Creating.");
});

test("prompt builder includes execution-scoped tool messages as native tool_result", () => {
  const state = createAgentState({ systemPrompt: "Test system", input: "Use echo." });
  state.messages.push(
    createMessage("assistant", "", {
      scope: "execution",
      toolCalls: [{ id: "call_1", name: "echo", args: { message: "hello" } }],
    }),
    createMessage("tool", "hello", {
      toolCallId: "call_1",
      toolName: "echo",
      scope: "execution",
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
  // Should have: user msg, assistant msg with tool_use, tool msg with tool_result
  expect(req.messages.length).toBeGreaterThanOrEqual(3);

  // Check assistant message has tool_use content blocks
  const assistantMsg = req.messages.find(m => m.role === "assistant");
  expect(assistantMsg).toBeDefined();
  if (Array.isArray(assistantMsg?.content)) {
    const toolUse = assistantMsg.content.find(b => b.type === "tool_use");
    expect(toolUse).toBeDefined();
    if (toolUse?.type === "tool_use") {
      expect(toolUse.id).toBe("call_1");
      expect(toolUse.name).toBe("echo");
    }
  }

  // Check tool message has tool_result content blocks
  const toolMsg = req.messages.find(m => m.role === "tool");
  expect(toolMsg).toBeDefined();
  if (Array.isArray(toolMsg?.content)) {
    const toolResult = toolMsg.content.find(b => b.type === "tool_result");
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.toolUseId).toBe("call_1");
      expect(toolResult.content).toBe("hello");
    }
  }
});
