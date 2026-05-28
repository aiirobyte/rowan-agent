import { expect, test } from "bun:test";
import Type from "typebox";
import { createPromptBuilder } from "../../../src/harness/context/prompt-builder";
import { buildMessages, buildPrompt, createId, createMessage, createAgentState } from "@rowan-agent/agent";
import type { Tool } from "@rowan-agent/agent";
import type { PhaseInput } from "@rowan-agent/agent";

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

test("generic prompt builder delegates phase content to registered phase builders", () => {
  const promptBuilder = createPromptBuilder([
    {
      phase: "chat",
      conversationLimit: 1,
      build({ input, tools }) {
        return `Custom ${input.phase} prompt with ${tools.map((tool) => tool.name).join(",")}`;
      },
    },
  ]);

  const testInput = createTestInput({ phase: "chat" });
  const prompt = promptBuilder.buildPrompt({
    context: testInput,
    tools: [echoTool],
  });

  expect(prompt.phasePromptMessage).toEqual({
    role: "user",
    content: "Custom chat prompt with echo",
  });
  expect(prompt.messages.at(-1)).toEqual(prompt.phasePromptMessage);
});

test("chat prompt defaults to direct answers unless another phase is needed", () => {
  const testInput = createTestInput({ phase: "chat", input: "What is 2 + 2?" });

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(combined).toContain("Phase: chat");
  expect(combined).toContain("Route only the current user request below.");
  expect(combined).toContain("Current user request:");
  expect(combined).toContain("\"What is 2 + 2?\"");
  expect(combined).toContain("route");
  expect(combined).toContain("stop");
  expect(combined).toContain("Do not call tools in this phase");
  expect(combined).toContain("echo");
});

test("plan prompt includes phase, JSON-only contract, tools, and skills", () => {
  const testInput = createTestInput({
    phase: "plan",
    input: "Plan with echo.",
    skills: [
      {
        id: "writer",
        path: "/skills/writer/SKILL.md",
        content: "Write concise task plans.",
        toolNames: ["echo"],
      },
    ],
  });

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "user", content: "Plan with echo." })]));
  expect(combined).toContain("Phase: plan");
  expect(combined).toContain("Create the task for the current user request below.");
  expect(combined).toContain("Current user request:");
  expect(combined).toContain("\"Plan with echo.\"");
  expect(combined).toContain("JSON-only contract");
  expect(combined).toContain("route");
  expect(combined).toContain("execute");
  expect(combined).toContain("Plan with echo.");
  expect(combined).toContain("echo");
  expect(combined).toContain("Returns the input message.");
});

test("prompt builder exposes the generated phase prompt message", () => {
  const testInput = createTestInput({ phase: "plan", input: "Plan with echo." });

  const prompt = buildPrompt({
    context: testInput,
    tools: [echoTool],
  });

  expect(prompt.messages).toHaveLength(3);
  const phaseMessage = prompt.messages.at(-1);
  expect(phaseMessage).toEqual(
    expect.objectContaining({
      role: "user",
      content: expect.stringContaining("Phase: plan"),
    }),
  );
  expect(prompt.phasePromptMessage).toEqual(phaseMessage!);
  expect(prompt).not.toHaveProperty("traceMessages");
});

test("execute prompt includes phase, JSON-only contract, task, allowed tools, and tool results", () => {
  const task = createTestTask();
  const testInput = createTestInput({
    phase: "execute",
    input: "Use echo.",
    yield: {
      task,
      toolResults: [
        {
          toolCallId: "call_previous",
          toolName: "echo",
          ok: true,
          content: "previous evidence",
        },
      ],
    },
  });

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: execute");
  expect(combined).toContain("JSON-only contract");
  expect(combined).toContain("route");
  expect(combined).toContain("toolCalls");
  expect(combined).toContain("Task");
  expect(combined).toContain("echo");
});

test("prompt builder excludes execution-scoped messages from later prompts", () => {
  const state = createAgentState({ systemPrompt: "Test system", input: "Use echo." });
  state.messages.push(
    createMessage("assistant", "{\"route\":\"task\",\"message\":\"Creating a task.\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
    createMessage("assistant", "{\"message\":\"Planning.\",\"task\":{\"title\":\"Echo\"}}", {
      kind: "model_message",
      phase: "plan",
    }),
    createMessage("assistant", "{\"message\":\"Answer text.\",\"toolCalls\":[]}", {
      kind: "model_message",
      phase: "execute",
    }),
    createMessage("tool", "{\"ok\":true,\"content\":\"tool evidence\"}", {
      toolName: "echo",
    }),
  );
  const task = createTestTask();

  const testInput: PhaseInput = {
    phase: "verify",
    systemPrompt: state.systemPrompt,
    messages: state.messages,
    tools: [],
    skills: state.skills,
    yield: {
      task,
      toolResults: [],
    },
  };

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Use echo.");
  expect(combined).not.toContain("tool evidence");
  expect(combined).not.toContain("\"route\":\"task\"");
  expect(combined).not.toContain("\"title\":\"Echo\"");
  expect(combined).not.toContain("\"toolCalls\":[]");
  expect(combined).not.toContain("Answer text.");
});

test("prompt builder does not replay recorded phase prompts as conversation", () => {
  const state = createAgentState({ systemPrompt: "Test system", input: "Use echo." });
  state.messages.push(
    createMessage("user", "Phase: chat\n\nInternal routing prompt.", {
      kind: "phase_prompt",
      phase: "chat",
    }),
    createMessage("assistant", "{\"route\":\"task\",\"message\":\"Creating a task.\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
  );

  const testInput: PhaseInput = {
    phase: "plan",
    systemPrompt: state.systemPrompt,
    messages: state.messages,
    tools: [],
    skills: state.skills,
  };

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: plan");
  expect(combined).not.toContain("\"route\":\"task\"");
  expect(combined).not.toContain("Internal routing prompt.");
});

test("verify prompt includes phase, lightweight judgement contract, task, criteria, and task output", () => {
  const task = createTestTask();
  const toolResults = [
    {
      toolCallId: "call_echo",
      toolName: "echo",
      ok: true,
      content: "echo evidence",
    },
  ];

  const testInput: PhaseInput = {
    phase: "verify",
    systemPrompt: "Test system",
    messages: [createMessage("user", "Verify echo.", { scope: "conversation" })],
    tools: [],
    skills: [],
    yield: {
      task,
      toolResults,
    },
  };

  const messages = buildMessages({
    context: testInput,
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: verify");
  expect(combined).toContain("JSON-only contract");
  expect(combined).toContain("route");
  expect(combined).toContain("stop");
  expect(combined).toContain("execute");
  expect(combined).toContain("Do not return a task, plan, toolCalls");
  expect(combined).toContain("Task output");
  expect(combined).toContain("\"toolResults\"");
});
