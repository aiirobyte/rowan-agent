import { expect, test } from "bun:test";
import Type from "typebox";
import { buildOpenAICompatibleMessages, buildOpenAICompatiblePrompt } from "../src/prompt-builder";
import { createDefaultCriteria } from "@rowan-agent/agent/task";
import { createId, createMessage } from "@rowan-agent/agent/types";
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

test("route prompt defaults to direct answers unless tools are needed", () => {
  const session = createSession({
    systemPrompt: "Test system",
    userInput: "What is 2 + 2?",
  });

  const messages = buildOpenAICompatibleMessages({
    context: { phase: "route", session },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(combined).toContain("Phase: route");
  expect(combined).toContain('{ "message": string, "needsTask": boolean }');
  expect(combined).toContain("Default to answering the user directly with needsTask=false.");
  expect(combined).toContain("normal chat, greetings, explanations, calculations");
  expect(combined).toContain("workspace access");
  expect(combined).toContain("needsTask must be true");
  expect(combined).toContain("factual question about the current workspace");
  expect(combined).toContain("cannot know without inspecting the workspace");
  expect(combined).toContain("message must be the complete final user-visible answer");
  expect(combined).toContain("only when satisfying the request requires tools");
  expect(combined).toContain("Do not call tools in this phase");
  expect(combined).toContain("forbidden message values");
  expect(combined).toContain("\"routed\"");
  expect(combined).toContain("你好！有什么我可以帮你？");
  expect(combined).toContain("2 + 2 = 4.");
  expect(combined).toContain("我的workspace程序是js语言写的吗");
  expect(combined).toContain("echo");
});

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
        source: "context",
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
  expect(combined).toContain("Do not return a task, plan, verificationResult");
  expect(combined).toContain("call one or more allowed tools now");
  expect(combined).toContain(task.id);
  expect(combined).toContain("Allowed tools");
  expect(combined).toContain("File and command tool paths are relative to the workspace");
  expect(combined).toContain("echo");
  expect(combined).toContain("previous evidence");
  expect(combined).not.toContain("Conversation messages:");
  expect(combined).not.toContain("Use the conversation messages already included in this request as context.");
});

test("prompt builder excludes internal assistant phase JSON from later prompts", () => {
  const session = createSession({ systemPrompt: "Test system", userInput: "Use echo." });
  session.messages.push(
    createMessage("assistant", "{\"needsTask\":true,\"message\":\"Creating a task.\"}", {
      kind: "routing_decision",
      phase: "route",
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

  const messages = buildOpenAICompatibleMessages({
    context: {
      phase: "verify",
      session,
      task,
      criteria: task.acceptanceCriteria,
      toolResults: [],
    },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Use echo.");
  expect(combined).toContain("tool evidence");
  expect(combined).not.toContain("needsTask");
  expect(combined).not.toContain("\"title\":\"Echo\"");
  expect(combined).not.toContain("\"toolCalls\":[]");
  expect(combined).not.toContain("Answer text.");
});

test("verify prompt includes phase, lightweight judgement contract, task, criteria, and task output", () => {
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
  expect(combined).toContain("Analyze the task output and return only a JSON judgement");
  expect(combined).toContain("`passed` is a boolean");
  expect(combined).toContain("`message` is the final user-visible task answer");
  expect(combined).toContain("even if the answer is negative");
  expect(combined).toContain("Return no extra keys beyond passed and message");
  expect(combined).toContain("Do not return a task, plan, toolCalls");
  expect(combined).toContain("return passed=false and explain what is missing");
  expect(combined).toContain(task.id);
  expect(combined).toContain("Acceptance criteria");
  expect(combined).toContain("Task output");
  expect(combined).toContain(task.acceptanceCriteria[0]?.description);
  expect(combined).toContain("echo evidence");
  expect(combined).not.toContain("Conversation messages:");
});
