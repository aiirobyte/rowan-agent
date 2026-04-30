import Schema from "typebox/schema";
import {
  createFailedOutcome,
  createOutcome,
  parseTask,
  parseVerificationResult,
} from "./task";
import type {
  AgentEvent,
  AgentLoopInput,
  AgentMessage,
  ErrorInfo,
  ModelStreamEvent,
  Outcome,
  Session,
  Task,
  Tool,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "./types";
import { createId, createMessage, nowIso, Validators } from "./types";

async function emit(input: AgentLoopInput, event: AgentEvent): Promise<void> {
  input.session.log.push(event);
  input.session.updatedAt = event.timestamp;
  await input.emit?.(event);
}

function makeError(code: string, message: string, details?: Record<string, unknown>): ErrorInfo {
  return { code, message, retryable: false, ...(details ? { details } : {}) };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent run aborted.");
  }
}

async function collectTextAndStructured(input: {
  loop: AgentLoopInput;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: string;
}): Promise<{ text: string; structured?: unknown; toolCalls: ToolCall[] }> {
  const message = createMessage("assistant", "", { phase: input.metadataPhase });
  const toolCalls: ToolCall[] = [];
  let structured: unknown;

  await emit(input.loop, {
    type: "message_start",
    messageId: message.id,
    timestamp: nowIso(),
  });

  for await (const event of input.events) {
    assertNotAborted(input.loop.signal);

    if (event.type === "text_delta") {
      message.content += event.text;
      await emit(input.loop, {
        type: "message_delta",
        messageId: message.id,
        text: event.text,
        timestamp: nowIso(),
      });
    }

    if (event.type === "structured_output") {
      structured = event.value;
    }

    if (event.type === "tool_call") {
      toolCalls.push(Validators.toolCall.Parse(event.toolCall));
    }
  }

  if (message.content.length > 0) {
    input.loop.session.messages.push(message);
  }

  await emit(input.loop, {
    type: "message_end",
    message,
    timestamp: nowIso(),
  });

  return { text: message.content, structured, toolCalls };
}

async function planTask(input: AgentLoopInput): Promise<Task> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(input.model, { phase: "plan", session: input.session }, { signal: input.signal }),
    metadataPhase: "plan",
  });

  if (!collected.structured) {
    throw new Error("Planner did not produce a structured task.");
  }

  return parseTask(collected.structured);
}

function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

async function executeToolCall(input: {
  loop: AgentLoopInput;
  task: Task;
  toolCall: ToolCall;
}): Promise<ToolResult> {
  const tool = findTool(input.loop.tools, input.toolCall.name);
  if (!tool) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: `Unknown tool: ${input.toolCall.name}`,
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: input.toolCall.name,
      result,
      timestamp: nowIso(),
    });
    return result;
  }

  let args: unknown;
  try {
    args = Schema.Compile(tool.parameters).Parse(input.toolCall.args);
  } catch (error) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : "Invalid tool arguments.",
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: input.toolCall.name,
      result,
      timestamp: nowIso(),
    });
    return result;
  }

  const decision = await input.loop.beforeToolCall?.({ task: input.task, tool, args });
  if (decision && !decision.allow) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: tool.name,
      ok: false,
      content: null,
      error: decision.reason,
    };
    await emit(input.loop, {
      type: "tool_call_blocked",
      toolName: tool.name,
      reason: decision.reason,
      timestamp: nowIso(),
    });
    return result;
  }

  await emit(input.loop, {
    type: "tool_call_start",
    toolName: tool.name,
    args,
    timestamp: nowIso(),
  });

  try {
    const rawResult = await tool.execute(
      args,
      { session: input.loop.session, task: input.task, toolCallId: input.toolCall.id },
      input.loop.signal,
    );
    const normalized = Validators.toolResult.Parse({
      ...rawResult,
      toolCallId: input.toolCall.id,
      toolName: tool.name,
    });
    const result = input.loop.afterToolCall
      ? await input.loop.afterToolCall({ task: input.task, tool, result: normalized })
      : normalized;

    await emit(input.loop, {
      type: "tool_call_end",
      toolName: tool.name,
      result,
      timestamp: nowIso(),
    });
    return result;
  } catch (error) {
    const result: ToolResult = {
      toolCallId: input.toolCall.id,
      toolName: tool.name,
      ok: false,
      content: null,
      error: error instanceof Error ? error.message : "Tool execution failed.",
    };
    await emit(input.loop, {
      type: "tool_call_end",
      toolName: tool.name,
      result,
      timestamp: nowIso(),
    });
    return result;
  }
}

async function executeTask(input: AgentLoopInput, task: Task, toolResults: ToolResult[]): Promise<void> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(
      input.model,
      { phase: "execute", session: input.session, task, toolResults },
      { signal: input.signal },
    ),
    metadataPhase: "execute",
  });

  for (const toolCall of collected.toolCalls) {
    const result = await executeToolCall({ loop: input, task, toolCall });
    toolResults.push(result);
    input.session.messages.push(
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
      }),
    );
  }
}

async function verifyTask(
  input: AgentLoopInput,
  task: Task,
  toolResults: ToolResult[],
): Promise<VerificationResult> {
  await emit(input, {
    type: "verification_start",
    taskId: task.id,
    timestamp: nowIso(),
  });

  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(
      input.model,
      {
        phase: "verify",
        session: input.session,
        task,
        toolResults,
        criteria: task.acceptanceCriteria,
      },
      { signal: input.signal },
    ),
    metadataPhase: "verify",
  });

  const result = collected.structured
    ? parseVerificationResult(collected.structured)
    : {
        passed: false,
        message: "Verifier did not produce structured output.",
        evidence: [],
        failedCriteria: task.acceptanceCriteria.map((criterion) => criterion.id),
      };

  await emit(input, {
    type: "verification_end",
    taskId: task.id,
    result,
    timestamp: nowIso(),
  });

  return result;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<Outcome> {
  const maxAttempts = input.maxAttempts ?? 2;

  try {
    assertNotAborted(input.signal);
    await emit(input, {
      type: "session_start",
      sessionId: input.session.id,
      timestamp: nowIso(),
    });

    const task = await planTask(input);
    input.session.messages.push(
      createMessage("assistant", `Planned task: ${task.title}`, {
        taskId: task.id,
      }),
    );

    await emit(input, {
      type: "task_created",
      task,
      timestamp: nowIso(),
    });

    const toolResults: ToolResult[] = [];
    let lastVerification: VerificationResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      assertNotAborted(input.signal);
      task.status = "running";
      task.attempts = attempt;

      await emit(input, {
        type: "task_attempt_start",
        taskId: task.id,
        attempt,
        timestamp: nowIso(),
      });

      await executeTask(input, task, toolResults);

      await emit(input, {
        type: "task_attempt_end",
        taskId: task.id,
        attempt,
        timestamp: nowIso(),
      });

      lastVerification = await verifyTask(input, task, toolResults);
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await emit(input, { type: "outcome", outcome, timestamp: nowIso() });
        await emit(input, {
          type: "session_end",
          sessionId: input.session.id,
          timestamp: nowIso(),
        });
        return outcome;
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    await emit(input, { type: "outcome", outcome, timestamp: nowIso() });
    await emit(input, {
      type: "session_end",
      sessionId: input.session.id,
      timestamp: nowIso(),
    });
    return outcome;
  } catch (error) {
    const errorInfo = makeError(
      "agent_loop_failed",
      error instanceof Error ? error.message : "Agent loop failed.",
    );
    await emit(input, { type: "error", error: errorInfo, timestamp: nowIso() });
    throw error;
  }
}
