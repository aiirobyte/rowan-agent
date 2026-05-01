import { expect, test } from "bun:test";
import Type from "typebox";
import { buildOpenAICompatibleMessages, buildOpenAICompatiblePrompt } from "../src/prompt-builder";
import { createDefaultCriteria } from "@rowan-agent/agent/task";
import { createId } from "@rowan-agent/agent/types";
import { createSession } from "@rowan-agent/agent/session";
import type { Task, Tool } from "@rowan-agent/agent/types";

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

function createTestTask(): Task {
  return {
    id: createId("task"),
    title: "Echo task",
    instruction: "Use echo to answer.",
    acceptanceCriteria: createDefaultCriteria("Must include echo evidence."),
    toolNames: ["echo"],
    skillIds: ["writer"],
    status: "pending",
    attempts: 0,
  };
}

test("plan prompt includes phase, JSON-only contract, tools, and skills", () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "Plan with echo.",
    skills: [
      {
        id: "writer",
        path: "/skills/writer/SKILL.md",
        content: "Write concise task plans.",
        toolNames: ["echo"],
      },
    ],
  });

  const messages = buildOpenAICompatibleMessages({
    context: { phase: "plan", session },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "user", content: "Plan with echo." })]));
  expect(combined).toContain("Phase: plan");
  expect(combined).toContain("only one valid JSON object");
  expect(combined).toContain('{ "message": string, "task": Task }');
  expect(combined).toContain("preserved as plain string message content");
  expect(combined).toContain("Plan with echo.");
  expect(combined).toContain("echo");
  expect(combined).toContain("Returns the input message.");
  expect(combined).toContain("writer");
  expect(combined).toContain("Write concise task plans.");
  expect(combined).not.toContain("Conversation messages:");
});

test("prompt builder exposes trace messages from the prompt construction boundary", () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "Plan with echo.",
  });

  const prompt = buildOpenAICompatiblePrompt({
    context: { phase: "plan", session },
    tools: [echoTool],
  });

  expect(prompt.messages).toHaveLength(3);
  expect(prompt.traceMessages).toEqual([
    expect.objectContaining({
      role: "user",
      content: expect.stringContaining("Phase: plan"),
      metadata: expect.objectContaining({
        kind: "model_prompt",
        phase: "plan",
        source: "prompt_builder",
      }),
    }),
  ]);
  const phaseMessage = prompt.messages.at(-1);
  expect(phaseMessage).toBeDefined();
  expect(prompt.traceMessages[0]?.content).toBe(phaseMessage?.content ?? "");
});

test("execute prompt includes phase, JSON-only contract, task, allowed tools, and tool results", () => {
  const session = createSession({ systemPrompt: "Test system", userInput: "Use echo." });
  const task = createTestTask();

  const messages = buildOpenAICompatibleMessages({
    context: {
      phase: "execute",
      session,
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
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: execute");
  expect(combined).toContain("JSON-only contract");
  expect(combined).toContain('{ "message": string, "toolCalls": ToolCall[] }');
  expect(combined).toContain("must be preserved before tool calls are recorded");
  expect(combined).toContain(task.id);
  expect(combined).toContain("Allowed tools");
  expect(combined).toContain("echo");
  expect(combined).toContain("previous evidence");
  expect(combined).not.toContain("Conversation messages:");
  expect(combined).not.toContain("Use the conversation messages already included in this request as context.");
});

test("verify prompt includes phase, JSON-only contract, task, criteria, and tool results", () => {
  const session = createSession({ systemPrompt: "Test system", userInput: "Verify echo." });
  const task = createTestTask();

  const messages = buildOpenAICompatibleMessages({
    context: {
      phase: "verify",
      session,
      task,
      criteria: task.acceptanceCriteria,
      toolResults: [
        {
          toolCallId: "call_echo",
          toolName: "echo",
          ok: true,
          content: "echo evidence",
        },
      ],
    },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: verify");
  expect(combined).toContain("JSON-only contract");
  expect(combined).toContain("VerificationResult");
  expect(combined).toContain("message must be preserved before the verification result is recorded");
  expect(combined).toContain(task.id);
  expect(combined).toContain("Acceptance criteria");
  expect(combined).toContain(task.acceptanceCriteria[0]?.description);
  expect(combined).toContain("echo evidence");
  expect(combined).not.toContain("Conversation messages:");
});
