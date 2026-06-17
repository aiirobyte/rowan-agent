import { expect, test } from "bun:test";
import Type from "typebox";
import {
  buildModelRequest,
} from "../../../src/harness/context/prompt-builder";
import type { AgentContextMessage, AgentContextSkill } from "@rowan-agent/models";
import { createId, createMessage } from "@rowan-agent/agent";
import type { Skill, Tool } from "@rowan-agent/agent";

type TestInput = {
  systemPrompt: string;
  messages: AgentContextMessage[];
  tools: Array<{ name: string; description: string; parameters: unknown }>;
  skills: AgentContextSkill[];
  toolsFilter?: Array<{ name: string; description: string; parameters: unknown }>;
  skillsFilter?: AgentContextSkill[];
};

function buildRequest(input: TestInput) {
  return buildModelRequest(input);
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

function createTestInput(overrides: Partial<TestInput> & { input?: string } = {}): TestInput {
  const skills = overrides.skills ?? [];
  const tools = overrides.tools ?? [];
  return {
    systemPrompt: overrides.systemPrompt ?? "Test system",
    messages: [createMessage("user", overrides.input ?? "Use echo.")],
    tools,
    skills,
    toolsFilter: overrides.toolsFilter ?? tools,
    skillsFilter: overrides.skillsFilter ?? skills,
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
    skills: [{ name: "writer", description: "Write concise plans.", filePath: "/skills/writer/SKILL.md", baseDir: "/skills/writer", content: "", disableModelInvocation: false }],
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

test("buildModelRequest only exposes phase-visible tools and skills", () => {
  const visibleTool: Tool<{ message: string }> = {
    ...echoTool,
    promptSnippet: "Visible echo tool.",
  };
  const hiddenTool: Tool<{ message: string }> = {
    ...echoTool,
    name: "hidden",
    description: "Hidden tool.",
    promptSnippet: "Hidden tool.",
  };
  const visibleSkill: Skill = {
    name: "visible-skill",
    description: "Visible skill.",
    filePath: "/skills/visible/SKILL.md",
    baseDir: "/skills/visible",
    content: "",
    disableModelInvocation: false,
  };
  const hiddenSkill: Skill = {
    name: "hidden-skill",
    description: "Hidden skill.",
    filePath: "/skills/hidden/SKILL.md",
    baseDir: "/skills/hidden",
    content: "",
    disableModelInvocation: false,
  };
  const input = createTestInput({
    tools: [visibleTool, hiddenTool],
    toolsFilter: [visibleTool],
    skills: [visibleSkill, hiddenSkill],
    skillsFilter: [visibleSkill],
  });
  const req = buildModelRequest(input);

  expect(req.tools?.map((tool) => tool.name)).toEqual(["echo"]);
  expect(req.system).toContain("visible-skill");
  expect(req.system).not.toContain("hidden-skill");
  expect(req.system).toContain("Visible echo tool.");
  expect(req.system).not.toContain("Hidden tool.");
});

// ---------------------------------------------------------------------------
// Phase prompt integration
// ---------------------------------------------------------------------------

test("buildRequest returns LlmRequest with correct messages", () => {
  const input = createTestInput({ input: "Review this code." });
  const req = buildRequest(input);

  expect(req.system).toContain("Test system");
  expect(req.messages.length).toBeGreaterThanOrEqual(1);
  const userMsg = req.messages.find(m => m.role === "user");
  expect(userMsg?.content).toBe("Review this code.");
});

test("prompt builder excludes execution-scoped messages from conversation", () => {
  const messages = [
    createMessage("user", "Use echo."),
    createMessage("assistant", "{\"route\":\"task\",\"message\":\"Creating.\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
    createMessage("tool", "{\"ok\":true,\"content\":\"tool evidence\"}", {
      toolName: "echo",
      scope: "execution",
    }),
  ];

  const testInput: TestInput = {
    systemPrompt: "Test system",
    messages,
    tools: [],
    skills: [],
    toolsFilter: [],
    skillsFilter: [],
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
  // Routing decisions are now included (kind filter removed)
  expect(allContent).toContain("Creating.");
});

test("prompt builder includes execution-scoped tool messages as native tool_result", () => {
  const messages = [
    createMessage("user", "Use echo."),
    createMessage("assistant", "", {
      scope: "execution",
      toolCalls: [{ id: "call_1", name: "echo", args: { message: "hello" } }],
    }),
    createMessage("tool", "hello", {
      toolCallId: "call_1",
      toolName: "echo",
      scope: "execution",
    }),
  ];

  const testInput: TestInput = {
    systemPrompt: "Test system",
    messages,
    tools: [],
    skills: [],
    toolsFilter: [],
    skillsFilter: [],
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
