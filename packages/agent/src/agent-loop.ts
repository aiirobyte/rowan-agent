import Schema from "typebox/schema";
import {
  createDirectOutcome,
  createFailedOutcome,
  createOutcome,
  parseTask,
  parseTaskRoutingDecision,
  parseVerificationResult,
} from "./task";
import { scheduleTaskRouting } from "./scheduler";
import type {
  AgentEvent,
  AgentLoopInput,
  AgentMessage,
  ErrorInfo,
  LlmPhase,
  ModelStreamEvent,
  ModelTraceMessage,
  Outcome,
  Session,
  SessionSnapshot,
  Task,
  TaskRoutingDecision,
  Tool,
  ToolCall,
  ToolResult,
  VerificationResult,
} from "./types";
import { createId, createMessage, nowIso, Validators } from "./types";

type AgentLoopRuntime = AgentLoopInput & {
  traceMessages: AgentMessage[];
};

async function emit(input: AgentLoopRuntime, event: AgentEvent): Promise<void> {
  input.session.log.push(event);
  input.session.updatedAt = event.ts;
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

function snapshotSession(session: Session): SessionSnapshot {
  return {
    id: session.id,
    systemPrompt: session.systemPrompt,
    userInput: session.userInput,
    skills: session.skills,
  };
}

function snapshotMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    ...(message.metadata ? { metadata: { ...message.metadata } } : {}),
  };
}

function snapshotMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(snapshotMessage);
}

async function emitMessageStart(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "message_start",
    content: snapshotMessages(input.traceMessages),
    ts: nowIso(),
  });
}

async function appendTraceMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.traceMessages.push(message);
  await emit(input, {
    type: "message_delta",
    delta: snapshotMessage(message),
    content: snapshotMessages(input.traceMessages),
    ts: nowIso(),
  });
}

async function appendTraceMessages(input: AgentLoopRuntime, messages: AgentMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  input.traceMessages.push(...messages);
  await emit(input, {
    type: "message_delta",
    delta: messages.length === 1 ? snapshotMessage(messages[0]) : snapshotMessages(messages),
    content: snapshotMessages(input.traceMessages),
    ts: nowIso(),
  });
}

async function appendSessionMessage(input: AgentLoopRuntime, message: AgentMessage): Promise<void> {
  input.session.messages.push(message);
  await appendTraceMessage(input, message);
}

async function emitMessageEnd(input: AgentLoopRuntime): Promise<void> {
  await emit(input, {
    type: "message_end",
    content: snapshotMessages(input.traceMessages),
    ts: nowIso(),
  });
}

async function collectTextAndStructured(input: {
  loop: AgentLoopRuntime;
  events: AsyncIterable<ModelStreamEvent>;
  metadataPhase: LlmPhase;
  recordText?: boolean;
}): Promise<{ text: string; structured?: unknown; toolCalls: ToolCall[] }> {
  const toolCalls: ToolCall[] = [];
  let text = "";
  let flushedText = "";
  let structured: unknown;
  const createTraceMessage = (message: ModelTraceMessage): AgentMessage =>
    createMessage(message.role, message.content, {
      ...message.metadata,
      phase: input.metadataPhase,
    });
  const flushText = async () => {
    if (text.length === 0) {
      return;
    }

    flushedText += text;
    if (input.recordText === false) {
      text = "";
      return;
    }
    await appendSessionMessage(
      input.loop,
      createMessage("assistant", text, { kind: "model_message", phase: input.metadataPhase }),
    );
    text = "";
  };

  for await (const event of input.events) {
    assertNotAborted(input.loop.signal);

    if (event.type === "trace_messages") {
      await appendTraceMessages(input.loop, event.messages.map(createTraceMessage));
    }

    if (event.type === "model_call") {
      await emit(input.loop, {
        type: "model_call",
        phase: event.phase,
        model: event.model,
        usage: event.usage,
        ts: nowIso(),
      });
    }

    if (event.type === "text_delta") {
      text += event.text;
    }

    if (event.type === "structured_output") {
      await flushText();
      structured = event.content;
    }

    if (event.type === "tool_call") {
      await flushText();
      const toolCall = Validators.toolCall.Parse(event.toolCall);
      toolCalls.push(toolCall);
      await emit(input.loop, {
        type: "tool_call_requested",
        toolCall,
        ts: nowIso(),
      });
    }

    if (event.type === "done") {
      await flushText();
    }
  }

  await flushText();

  return { text: flushedText, structured, toolCalls };
}

async function planTask(input: AgentLoopRuntime): Promise<{ task: Task; text: string }> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(input.model, { phase: "plan", session: input.session }, { signal: input.signal }),
    metadataPhase: "plan",
  });

  if (!collected.structured) {
    throw new Error("Planner did not produce a structured task.");
  }

  return { task: parseTask(collected.structured), text: collected.text };
}

async function routeRequest(input: AgentLoopRuntime): Promise<TaskRoutingDecision & { text: string }> {
  const collected = await collectTextAndStructured({
    loop: input,
    events: input.stream(input.model, { phase: "route", session: input.session }, { signal: input.signal }),
    metadataPhase: "route",
    recordText: false,
  });

  if (!collected.structured) {
    throw new Error("Router did not produce a structured task routing decision.");
  }

  const decision = scheduleTaskRouting({
    userInput: input.session.userInput,
    tools: input.tools,
    decision: parseTaskRoutingDecision(collected.structured),
  });
  await appendSessionMessage(
    input,
    createMessage("assistant", JSON.stringify(decision), { kind: "routing_decision", phase: "route" }),
  );
  return { ...decision, text: decision.message };
}

function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

async function executeToolCall(input: {
  loop: AgentLoopRuntime;
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
      ts: nowIso(),
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
      ts: nowIso(),
    });
    return result;
  }

  let decision: Awaited<ReturnType<NonNullable<AgentLoopInput["beforeToolCall"]>>> | undefined;
  if (input.loop.beforeToolCall) {
    await emit(input.loop, {
      type: "tool_call_approval_requested",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      ts: nowIso(),
    });
    decision = await input.loop.beforeToolCall({ task: input.task, tool, args });
    await emit(input.loop, {
      type: "tool_call_approval_result",
      taskId: input.task.id,
      toolName: tool.name,
      args,
      decision: decision ?? { allow: true },
      ts: nowIso(),
    });
  }

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
      ts: nowIso(),
    });
    return result;
  }

  await emit(input.loop, {
    type: "tool_call_start",
    toolName: tool.name,
    args,
    ts: nowIso(),
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
    let result = normalized;
    if (input.loop.afterToolCall) {
      await emit(input.loop, {
        type: "tool_result_review_requested",
        taskId: input.task.id,
        toolName: tool.name,
        result: normalized,
        ts: nowIso(),
      });
      result = await input.loop.afterToolCall({ task: input.task, tool, result: normalized });
      await emit(input.loop, {
        type: "tool_result_review_result",
        taskId: input.task.id,
        toolName: tool.name,
        result,
        ts: nowIso(),
      });
    }

    await emit(input.loop, {
      type: "tool_call_end",
      toolName: tool.name,
      result,
      ts: nowIso(),
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
      ts: nowIso(),
    });
    return result;
  }
}

async function executeTask(input: AgentLoopRuntime, task: Task, toolResults: ToolResult[]): Promise<void> {
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
    await appendSessionMessage(
      input,
      createMessage("tool", JSON.stringify(result), {
        toolCallId: result.toolCallId,
        toolName: result.toolName,
      }),
    );
  }
}

async function verifyTask(
  input: AgentLoopRuntime,
  task: Task,
  toolResults: ToolResult[],
): Promise<VerificationResult> {
  await emit(input, {
    type: "verification_start",
    taskId: task.id,
    ts: nowIso(),
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
    ts: nowIso(),
  });

  return result;
}

export async function runAgentLoop(input: AgentLoopInput): Promise<Outcome> {
  const runtime: AgentLoopRuntime = {
    ...input,
    traceMessages: snapshotMessages(input.session.messages),
  };
  const maxAttempts = input.maxAttempts ?? 2;
  let messageLogEnded = false;
  const endMessageLog = async () => {
    if (!messageLogEnded) {
      await emitMessageEnd(runtime);
      messageLogEnded = true;
    }
  };

  try {
    assertNotAborted(runtime.signal);
    await emit(runtime, {
      type: "session_created",
      session: snapshotSession(runtime.session),
      ts: nowIso(),
    });
    await emit(runtime, {
      type: "session_start",
      sessionId: runtime.session.id,
      ts: nowIso(),
    });
    await emitMessageStart(runtime);

    const routed = await routeRequest(runtime);
    if (!routed.needsTask) {
      const outcome = createDirectOutcome(routed.message);
      await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
      await endMessageLog();
      await emit(runtime, {
        type: "session_end",
        sessionId: runtime.session.id,
        ts: nowIso(),
      });
      return outcome;
    }

    const planned = await planTask(runtime);
    const task = planned.task;
    if (planned.text.length === 0) {
      await appendSessionMessage(
        runtime,
        createMessage("assistant", `Planned task: ${task.title}`, {
          kind: "model_message",
          taskId: task.id,
        }),
      );
    }

    await emit(runtime, {
      type: "task_created",
      task,
      ts: nowIso(),
    });

    const toolResults: ToolResult[] = [];
    let lastVerification: VerificationResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      assertNotAborted(runtime.signal);
      task.status = "running";
      task.attempts = attempt;

      await emit(runtime, {
        type: "task_attempt_start",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      await executeTask(runtime, task, toolResults);

      await emit(runtime, {
        type: "task_attempt_end",
        taskId: task.id,
        attempt,
        ts: nowIso(),
      });

      lastVerification = await verifyTask(runtime, task, toolResults);
      if (lastVerification.passed) {
        task.status = "passed";
        const outcome = createOutcome(task, lastVerification);
        await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
        await endMessageLog();
        await emit(runtime, {
          type: "session_end",
          sessionId: runtime.session.id,
          ts: nowIso(),
        });
        return outcome;
      }
    }

    task.status = "failed";
    const outcome = createFailedOutcome(task, lastVerification);
    await emit(runtime, { type: "outcome", outcome, ts: nowIso() });
    await endMessageLog();
    await emit(runtime, {
      type: "session_end",
      sessionId: runtime.session.id,
      ts: nowIso(),
    });
    return outcome;
  } catch (error) {
    const errorInfo = makeError(
      "agent_loop_failed",
      error instanceof Error ? error.message : "Agent loop failed.",
    );
    await endMessageLog();
    await emit(runtime, { type: "error", error: errorInfo, ts: nowIso() });
    throw error;
  }
}
