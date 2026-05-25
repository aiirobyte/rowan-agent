import { expect, test } from "bun:test";
import Type from "typebox";
import { createPromptBuilder } from "../../../src/harness/context/prompt-builder";
import { buildMessages, buildPrompt } from "../../../src/loop/phases/prompt-builder";
import { createDefaultCriteria, type Task } from "@rowan-agent/agent";
import { createId, createMessage, createSession } from "@rowan-agent/agent";
import type { Tool } from "@rowan-agent/agent";

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

test("generic prompt builder delegates phase content to registered phase builders", () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "Use echo.",
  });
  const promptBuilder = createPromptBuilder([
    {
      phase: "chat",
      conversationLimit: 1,
      build({ context, tools }) {
        return `Custom ${context.phase} prompt with ${tools.map((tool) => tool.name).join(",")}`;
      },
    },
  ]);

  const prompt = promptBuilder.buildPrompt({
    context: { phase: "chat", state: session },
    tools: [echoTool],
  });

  expect(prompt.phasePromptMessage).toEqual({
    role: "user",
    content: "Custom chat prompt with echo",
  });
  expect(prompt.messages.at(-1)).toEqual(prompt.phasePromptMessage);
});

test("chat prompt defaults to direct answers unless another phase is needed", () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "What is 2 + 2?",
  });

  const messages = buildMessages({
    context: { phase: "chat", state: session },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(combined).toContain("Phase: chat");
  expect(combined).toContain("Route only the current user request below.");
  expect(combined).toContain("Current user request:");
  expect(combined).toContain("\"What is 2 + 2?\"");
  expect(combined).toContain('{ "message": string, "route": "direct" | string }');
  expect(combined).toContain("Use route=\"direct\" when you can fully answer");
  expect(combined).toContain("Use another route only when it matches one of the available phase ids");
  expect(combined).toContain("current workspace, repository, files, tools, or commands");
  expect(combined).toContain("message must be the complete final user-visible answer");
  expect(combined).toContain("Agent state initial input");
  expect(combined).toContain("Agent state task");
  expect(combined).toContain("Agent state goal");
  expect(combined).toContain("Runtime thread depth");
  expect(combined).toContain("Available phases");
  expect(combined).toContain("Do not call tools in this phase");
  expect(combined).toContain("echo");
});

test("plan prompt includes phase, JSON-only contract, tools, and skills", () => {
  const session = createSession({
    systemPrompt: "Test system",
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
    context: { phase: "plan", state: session },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(messages).toHaveLength(3);
  expect(messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "user", content: "Plan with echo." })]));
  expect(combined).toContain("Phase: plan");
  expect(combined).toContain("Create the task for the current user request below.");
  expect(combined).toContain("Current user request:");
  expect(combined).toContain("\"Plan with echo.\"");
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

test("prompt builder exposes the generated phase prompt message", () => {
  const session = createSession({
    systemPrompt: "Test system",
    input: "Plan with echo.",
  });

  const prompt = buildPrompt({
    context: { phase: "plan", state: session },
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
  const session = createSession({ systemPrompt: "Test system", input: "Use echo." });
  const task = createTestTask();

  const messages = buildMessages({
    context: {
      phase: "execute",
      state: session,
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

test("prompt builder excludes execution-scoped messages from later prompts", () => {
  const session = createSession({ systemPrompt: "Test system", input: "Use echo." });
  session.messages.push(
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

  const messages = buildMessages({
    context: {
      phase: "verify",
      state: session,
      task,
      criteria: task.acceptanceCriteria,
      taskOutput: { kind: "tools", toolResults: [] },
    },
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
  const session = createSession({ systemPrompt: "Test system", input: "Use echo." });
  session.messages.push(
    createMessage("user", "Phase: chat\n\nInternal routing prompt.", {
      kind: "phase_prompt",
      phase: "chat",
    }),
    createMessage("assistant", "{\"route\":\"task\",\"message\":\"Creating a task.\"}", {
      kind: "routing_decision",
      phase: "chat",
    }),
  );

  const messages = buildMessages({
    context: { phase: "plan", state: session },
    tools: [echoTool],
  });
  const combined = messages.map((message) => message.content).join("\n");

  expect(combined).toContain("Phase: plan");
  expect(combined).not.toContain("\"route\":\"task\"");
  expect(combined).not.toContain("Internal routing prompt.");
});

test("verify prompt includes phase, lightweight judgement contract, task, criteria, and task output", () => {
  const session = createSession({ systemPrompt: "Test system", input: "Verify echo." });
  const task = createTestTask();
  const toolResults = [
    {
      toolCallId: "call_echo",
      toolName: "echo",
      ok: true,
      content: "echo evidence",
    },
  ];

  const messages = buildMessages({
    context: {
      phase: "verify",
      state: session,
      task,
      criteria: task.acceptanceCriteria,
      taskOutput: { kind: "tools", toolResults },
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
  expect(combined).toContain(task.acceptanceCriteria[0]);
  expect(combined).toContain("echo evidence");
  expect(combined).toContain("\"toolResults\"");
  expect(combined).not.toContain("Conversation messages:");
});
