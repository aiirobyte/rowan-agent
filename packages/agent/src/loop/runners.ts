import type {
  AgentMessage,
  AgentContext,
  Outcome,
  Tool,
  ToolCall,
  ToolResult,
} from "../types";
import { createMessage } from "../types";
import { createId, createTimestamp } from "../utils";
import type { ExecutionState, AgentConfig, InputRequestPrompt, MessageDeltaNotification } from "./types";

// Execution types (loop-level)
import type {
  PhaseMessageManager,
  PhaseToolExecutionManager,
  ModelInvokeOutput,
  PhaseExecution,
  PhaseContextSnapshot,
} from "./execution";
import { invokeModel } from "./stream-collector";
import type { PhaseOutput, PhaseContext } from "../harness/phases/types";
import { createExtensionAPI } from "../extensions/api";

// Phase system types
import type {
  Phase,
  PhaseRegistry,
} from "../harness/phases";
import { readPhaseContent } from "../harness/phases";

import { executeRuntimeToolCall, createRouteTool, extractRouteCall, PhaseRouteTool } from "../harness/tools";
import type { RouteToolArgs } from "../harness/tools";
import { buildModelRequest } from "../harness/context/prompt-builder";
import { LoopGuard } from "./errors";
import { createOutcome } from "./outcomes";
import { snapshotMessages } from "./state";
import { compactMessages, needsCompaction } from "../harness/context/compaction";
import { buildPhaseDirectiveMessage } from "../harness/context/resource-formatter";
import type { LlmContentPart } from "@rowan-agent/models";

// ============================================================================
// Phase State Utilities
// ============================================================================

/** Execute phase run and handle void/empty-message by auto-assembling PhaseOutput. */
function resolvePhaseOutput(result: PhaseOutput | void): PhaseOutput {
  return result
    ? { ...result }
    : { message: "Phase completed.", route: "stop" };
}

/** Remove a phase's context message from the conversation by id. */
function removePhaseMessage(messages: AgentMessage[], msgId: string | undefined): void {
  if (!msgId) return;
  const idx = messages.findIndex(m => m.id === msgId);
  if (idx !== -1) messages.splice(idx, 1);
}

function findLatestUserInputMessage(messages: AgentMessage[]): AgentMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const kind = message.metadata?.kind;
    if (message.role === "user" && kind !== "phase_prompt" && kind !== "phase_input") {
      return message;
    }
  }
  return undefined;
}

function moveMessageBefore(messages: AgentMessage[], messageId: string, targetId: string): void {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  if (messageIndex === -1 || targetIndex === -1 || messageIndex < targetIndex) return;
  const [message] = messages.splice(messageIndex, 1);
  if (message) messages.splice(targetIndex, 0, message);
}

/** Normalize payload: parse JSON strings to objects for consistent downstream handling. */
function normalizePayload(payload: unknown): unknown {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      // Keep as string if not valid JSON
    }
  }
  return payload;
}

/** Apply the first decision target's fields to the output. */
function applyFirstDecision(route: RouteToolArgs, output: PhaseOutput): void {
  const first = route.decision[0];
  if (!first) return;
  output.route = first.phase;
  if (first.reason) output.routeReason = first.reason;
  if (first.payload !== undefined) output.payload = normalizePayload(first.payload);
}

/** Inject phase content as a user context message.
 *
 * The message is added directly to the transcript so it is model-visible but
 * does not pretend to be the result of a provider tool call. The optional
 * mirror receives the same message object for phase-local request snapshots.
 */
function injectPhaseContent(
  phase: Phase,
  output: { instruction?: string; results: Array<{ name: string; output?: unknown }> },
  messages: AgentMessage[],
  mirror?: AgentMessage[],
): string | undefined {
  try {
    const phaseContent = phase.filePath
      ? readPhaseContent(phase)
      : (phase.content ?? phase.description ?? "");
    const content = buildPhaseDirectiveMessage(
      { name: phase.name, content: phaseContent },
      output,
    );
    const message = createMessage("user", content, {
      kind: "phase_prompt",
      phase: phase.name,
    });
    messages.push(message);
    if (mirror && mirror !== messages) mirror.push(message);
    return message.id;
  } catch {
    return undefined;
  }
}

/**
 * Build instance IDs for parallel targets.
 * Unique phases get plain id; duplicates get #1, #2, ...
 * e.g. ["research", "analyze", "research"] → ["research#1", "analyze", "research#2"]
 */
function buildInstanceIds(phases: string[]): string[] {
  const counts = new Map<string, number>();
  for (const p of phases) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const hasDupes = [...counts.values()].some(c => c > 1);
  if (!hasDupes) return phases;

  const idx = new Map<string, number>();
  return phases.map(p => {
    const n = (idx.get(p) ?? 0) + 1;
    idx.set(p, n);
    return `${p}#${n}`;
  });
}

// ============================================================================
// Result Creation
// ============================================================================

type LoopResult = {
  messages: AgentMessage[];
  outcome: Outcome;
  metrics: import("./types").LoopMetrics;
};

function createRunResult(
  config: AgentConfig,
  state: ExecutionState,
  outcome: Outcome,
): LoopResult {
  return {
    messages: snapshotMessages(config.context.messages),
    outcome,
    metrics: state.metrics,
  };
}

// ============================================================================
// Run Completion
// ============================================================================

async function completeRun(
  config: AgentConfig,
  state: ExecutionState,
  outcome: Outcome,
): Promise<LoopResult> {
  if (outcome.display) {
    const messages = createMessageManager(config.context, config.onMessage, config.onMessageDelta);
    const messageId = messages.start("assistant", outcome.message, { outcomeId: outcome.id });
    await messages.end(messageId);
  }

  // Finalize metrics
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  await config.onOutcome?.(outcome);

  return createRunResult(config, state, outcome);
}

function createTerminalOutcome(
  phase: Phase,
  output: PhaseOutput,
  transcript: AgentMessage[],
): Outcome {
  return phase.run || phase.factory
    ? createOutcome.phase(output, transcript)
    : createOutcome.default(output, transcript);
}

// ============================================================================
// Tools Factory
// ============================================================================

function buildToolsWithRouting(
  config: AgentConfig,
  availablePhases: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[],
) {
  const tools = [...config.context.tools];
  if (availablePhases.length > 0) {
    tools.push(createRouteTool(availablePhases));
  }
  return tools;
}

function createMessageManager(
  context: AgentContext,
  onMessage?: (message: AgentMessage) => Promise<void>,
  onMessageDelta?: (event: MessageDeltaNotification) => void,
): PhaseMessageManager {
  const activeMessages = new Map<string, { message: AgentMessage; emitted: boolean }>();
  const emitStart = (active: { message: AgentMessage; emitted: boolean }) => {
    if (active.emitted) return;
    active.emitted = true;
  };
  return {
    visible: () => [...context.messages],
    reserve(role, metadata) {
      const msg = createMessage(role, role === "assistant" ? "" : [], metadata);
      activeMessages.set(msg.id, { message: msg, emitted: false });
      return msg.id;
    },
    start(role, content, metadata) {
      const messageId = this.reserve(role, metadata);
      const active = activeMessages.get(messageId)!;
      active.message.content = content;
      emitStart(active);
      return messageId;
    },
    async update(messageId, delta) {
      const active = activeMessages.get(messageId);
      if (!active) return;
      emitStart(active);
      const offset = typeof active.message.content === "string"
        ? active.message.content.length
        : active.message.content.reduce(
          (length, part) => length + (part.type === "text" ? part.text.length : 0),
          0,
        );
      active.message.content = typeof active.message.content === "string"
        ? active.message.content + delta
        : [...active.message.content, { type: "text", text: delta }];
      onMessageDelta?.({ messageId, offset, text: delta });
    },
    replaceContent(messageId, content) {
      const active = activeMessages.get(messageId);
      if (!active) return;
      active.message.content = content;
    },
    async end(messageId) {
      const active = activeMessages.get(messageId);
      if (!active) return;
      if (!active.emitted && (active.message.content === "" || active.message.content.length === 0)) {
        activeMessages.delete(messageId);
        return;
      }
      emitStart(active);
      activeMessages.delete(messageId);
      context.messages.push(active.message);
      await onMessage?.(active.message);
    },
    discard(messageId) {
      activeMessages.delete(messageId);
    },
  };
}

function createToolExecutionManager(): PhaseToolExecutionManager {
  return {
    async start() {},
    async end() {},
  };
}

function createToolResultContent(result: ToolResult): LlmContentPart[] {
  return [
    {
      type: "tool_result",
      toolUseId: result.toolCallId,
      content: JSON.stringify(result),
      isError: !result.ok,
    },
  ];
}

function createRouteToolResultContent(toolCall: ToolCall): LlmContentPart[] {
  return [
    {
      type: "tool_result",
      toolUseId: toolCall.id,
      content: '{"ok": true}',
    },
  ];
}

async function executePhaseWithModel(ctx: PhaseRuntime): Promise<PhaseOutput> {
  const executableToolNames = new Set(
    ctx.context.tools
      .filter((tool) => tool.name !== PhaseRouteTool)
      .map((tool) => tool.name),
  );
  let output: PhaseOutput = {
    message: "",
    route: "stop",
    phase: ctx.phase.name,
    toolCalls: [],
  };

  while (true) {
    // Pass PhaseContext with fresh messages to invokeModel
    const roundContext: PhaseContext = {
      ...ctx.context,
      messages: ctx.messageManager.visible(),
    };
    const collected = await ctx.execution.invokeModel(roundContext);

    output = {
      message: collected.text,
      route: "stop",
      phase: ctx.phase.name,
      toolCalls: collected.toolCalls,
    };

    for (const toolCall of collected.toolCalls) {
      if (toolCall.name !== PhaseRouteTool) continue;
      const messageId = ctx.messageManager.start("tool", createRouteToolResultContent(toolCall), {
        phase: ctx.phase.name,
      });
      await ctx.messageManager.end(messageId);
    }

    const executableToolCalls = collected.toolCalls.filter((toolCall) =>
      executableToolNames.has(toolCall.name),
    );
    if (executableToolCalls.length === 0) {
      return output;
    }

    const results = await ctx.execution.executeTools(roundContext, executableToolCalls);
    for (const result of results) {
      const messageId = ctx.messageManager.start("tool", createToolResultContent(result), {
        phase: ctx.phase.name,
      });
      await ctx.messageManager.end(messageId);
    }
  }
}

async function runTurn<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}

// ============================================================================
// Unified Phase Loop
// ============================================================================

export async function startPhaseLoop(
  config: AgentConfig,
  state: ExecutionState,
): Promise<LoopResult> {
  const registry = config.context.phases;
  if (!registry) {
    throw new Error("AgentContext.phases is required. Supply a phase registry to the execution context.");
  }
  if (!registry.entryPhaseId) {
    throw new Error("AgentContext.phases.entryPhaseId is required. Supply an entry phase to the execution context.");
  }

  return runPhaseLoop(config, state, registry);
}

// ============================================================================
// Unified Phase Execution
// ============================================================================

async function runPhaseLoop(
  config: AgentConfig,
  state: ExecutionState,
  registry: PhaseRegistry,
): Promise<LoopResult> {
  const resumingSuspendedRun = state.status === "suspended" && Boolean(state.currentPhase);
  let currentPhaseId = resumingSuspendedRun ? state.currentPhase : registry.entryPhaseId!;
  let isContinuing = resumingSuspendedRun
    ? state.continuation?.isContinuing ?? true
    : false;
  if (resumingSuspendedRun) {
    state.status = "running";
  }
  let previousPayload: unknown = resumingSuspendedRun ? state.continuation?.previousPayload : undefined;
  let previousPhaseMsgId: string | undefined = resumingSuspendedRun
    ? state.continuation?.previousPhaseMessageId
    : undefined;
  let previousPhaseInputMsgId: string | undefined;
  let previousResults: Array<{ name: string; output?: unknown }> = resumingSuspendedRun
    ? state.continuation?.previousResults?.map((result) => ({ ...result })) ?? []
    : [];
  let pendingInstruction: string | undefined = resumingSuspendedRun
    ? state.continuation?.pendingInstruction
    : undefined;

  while (currentPhaseId) {
    // Build available phases list for route tool from the explicit registry.
    const availablePhases: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[] = [];
    for (const [, phase] of registry.phases) {
      availablePhases.push({ name: phase.name, description: phase.description, tools: phase.tools, skills: phase.skills, input: phase.input, isolated: phase.isolated });
    }

    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
      previousPhaseMsgId = undefined;
      previousPhaseInputMsgId = undefined;
      return completeRun(config, state, createOutcome.aborted());
    }

    state.metrics.iterations++;

    // Auto-compact when transcript grows too long
    if (needsCompaction(config.context.messages)) {
      const compacted = compactMessages(config.context.messages);
      if (compacted.compacted) {
        config.context.messages = compacted.messages;
        state.metrics.compactionCount++;
      }
    }

    const phase = registry.phases.get(currentPhaseId);
    if (!phase) {
      throw new Error(`Phase "${currentPhaseId}" not found`);
    }

    state.currentPhase = currentPhaseId;

    const allTools = buildToolsWithRouting(config, availablePhases);

    const messageManager = createMessageManager(config.context, config.onMessage, config.onMessageDelta);
    const toolExecutionManager = createToolExecutionManager();

    const execution = createPhaseExecution(config, state, phase, messageManager, toolExecutionManager, registry);

    // Build PhaseContext for this phase
    // phase-filtered tools/skills; route tool always included
    const phaseTools = phase.tools
      ? allTools.filter(t => t.name === PhaseRouteTool || phase.tools!.includes(t.name))
      : allTools;
    const phaseSkills = phase.skills
      ? config.context.skills.filter(s => phase.skills!.includes(s.name))
      : config.context.skills;

    let phaseContext: PhaseContext = {
      systemPrompt: config.context.systemPrompt,
      messages: messageManager.visible(),
      tools: phaseTools,
      skills: phaseSkills,
      invocation: {
        mode: "serial",
        instanceId: currentPhaseId,
      },
      execution: config.execution!,
      state: {
        current: currentPhaseId,
        available: Array.from(registry.phases.keys()),
        iterations: state.metrics.iterations,
        payload: previousPayload,
      },
    };

    const enteringNewPhase = !isContinuing;
    isContinuing = false;

    // beforePhase hook
    if (config.beforePhase) {
      const extBefore = await config.beforePhase(currentPhaseId, phaseContext);
      if (extBefore.abort) {
        removePhaseMessage(config.context.messages, previousPhaseMsgId);
        removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
        previousPhaseMsgId = undefined;
        previousPhaseInputMsgId = undefined;
        return completeRun(config, state, extBefore.abort);
      }
      if (extBefore.skip) {
        removePhaseMessage(config.context.messages, previousPhaseMsgId);
        removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
        previousPhaseMsgId = undefined;
        previousPhaseInputMsgId = undefined;
        if (extBefore.skip.route === "stop") {
          return completeRun(config, state, {
            id: "skip",
            message: extBefore.skip.message || "Skipped.",
          });
        }
        currentPhaseId = extBefore.skip.route;
        continue;
      }
      if (extBefore.input) {
        phaseContext = extBefore.input;
      }
    }

    // Inject phase content as user context when entering a new phase. A
    // A Run resumed from durable state has no ephemeral Phase
    // message in its restored transcript, so it also needs one on its first
    // resumed iteration.
    const phaseMessageIsPresent = previousPhaseMsgId !== undefined
      && config.context.messages.some((message) => message.id === previousPhaseMsgId);
    if (enteringNewPhase || !phaseMessageIsPresent) {
      // Keep the active Phase prompt across waitForInput continuations, but
      // replace it when routing to a different Phase or restoring a missing
      // ephemeral prompt.
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      removePhaseMessage(phaseContext.messages, previousPhaseMsgId);
      removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
      removePhaseMessage(phaseContext.messages, previousPhaseInputMsgId);
      previousPhaseMsgId = undefined;
      previousPhaseInputMsgId = undefined;
      const latestUserInputMessage = findLatestUserInputMessage(config.context.messages);
      const lastMessageBeforePhase = config.context.messages.at(-1);
      previousPhaseMsgId = injectPhaseContent(
        phase,
        { results: previousResults, instruction: pendingInstruction },
        config.context.messages,
        phaseContext.messages,
      );
      if (previousPhaseMsgId) {
        if (lastMessageBeforePhase?.role === "user") {
          moveMessageBefore(config.context.messages, previousPhaseMsgId, lastMessageBeforePhase.id);
          moveMessageBefore(phaseContext.messages, previousPhaseMsgId, lastMessageBeforePhase.id);
        } else if (latestUserInputMessage) {
          const phaseInputMessage = createMessage("user", latestUserInputMessage.content, {
            kind: "phase_input",
            phase: phase.name,
          });
          config.context.messages.push(phaseInputMessage);
          phaseContext.messages.push(phaseInputMessage);
          previousPhaseInputMsgId = phaseInputMessage.id;
        }
      }
      previousResults = [];
      pendingInstruction = undefined;
    }

    // Execute phase
    const runtime: PhaseRuntime = { phase, config, state, execution, messageManager, registry: registry, context: phaseContext };
    let output = await executePhase(runtime);

    // Extract route from tool calls
    let routeDecision: RouteToolArgs | undefined;
    if (output.toolCalls && output.toolCalls.length > 0) {
      routeDecision = extractRouteCall(output.toolCalls);
      if (routeDecision) {
        applyFirstDecision(routeDecision, output);
      }
    }

    // afterPhase hook
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        removePhaseMessage(config.context.messages, previousPhaseMsgId);
        removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
        previousPhaseMsgId = undefined;
        previousPhaseInputMsgId = undefined;
        return completeRun(config, state, extAfter.abort);
      }
      if (extAfter.retry && (phase.run || phase.factory)) {
        output = await executePhase(runtime);
        routeDecision = output.toolCalls ? extractRouteCall(output.toolCalls) : undefined;
        if (routeDecision) applyFirstDecision(routeDecision, output);
      }
      if (extAfter.output) {
        output = extAfter.output;
      }
    }

    const routeToolAvailable = phaseContext.tools.some(tool => tool.name === PhaseRouteTool);
    const routeRequired = !phase.target && !phase.run && !phase.factory && routeToolAvailable && registry.phases.size > 1;
    if (routeRequired && !routeDecision) {
      if (config.waitForInput) {
        const preAbort = LoopGuard.checkAbort(config.signal);
        if (preAbort.stopReason !== "none") {
          removePhaseMessage(config.context.messages, previousPhaseMsgId);
          removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
          previousPhaseMsgId = undefined;
          previousPhaseInputMsgId = undefined;
          return completeRun(config, state, createOutcome.aborted());
        }
        const requestedAt = createTimestamp();
        const inputRequest: InputRequestPrompt = {
          phase: currentPhaseId,
          prompt: output.message,
          requestedAt,
        };
        state.status = "suspended";
        state.continuation = {
          isContinuing,
          previousPayload,
          previousResults: previousResults.map((result) => ({ ...result })),
          pendingInstruction,
          previousPhaseMessageId: previousPhaseMsgId,
        };
        const userMessages = await config.waitForInput(state, inputRequest);
        state.status = "running";
        const abortResult = LoopGuard.checkAbort(config.signal);
        if (abortResult.stopReason !== "none") {
          removePhaseMessage(config.context.messages, previousPhaseMsgId);
          removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
          previousPhaseMsgId = undefined;
          previousPhaseInputMsgId = undefined;
          return completeRun(config, state, createOutcome.aborted());
        }
        for (const message of userMessages) {
          config.context.messages.push(message);
        }
        isContinuing = true;
        continue;
      }
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
      previousPhaseMsgId = undefined;
      previousPhaseInputMsgId = undefined;
      return completeRun(config, state, createOutcome.default(output, config.context.messages));
    }

    // Handle "continue" — re-execute current phase
    if (output.route === "continue") {
      isContinuing = true;
      continue;
    }

    // Parallel dispatch: when route tool returns multiple targets, execute all concurrently.
    // Each target gets its own PhaseContext (isolated=true → fresh, otherwise fork of current).
    // After all complete, results are stashed as previousResults for the next iteration's
    // phase entry injection (so the entry phase sees them inside its user context message).
    if (routeDecision && routeDecision.decision.length > 1) {
      const contextSnapshot = snapshotMessages(config.context.messages);
      const parallelTasks = new Map<string, { promise: Promise<ParallelResult>; phaseId: string }>();

      // Build instance IDs: unique phases get plain id, duplicates get #1, #2, ...
      const instanceIds = buildInstanceIds(routeDecision.decision.map(t => t.phase));
      const groupId = createId("phase-group");
      const count = routeDecision.decision.length;

      // Launch all targets concurrently — each as an independent execution
      for (let i = 0; i < routeDecision.decision.length; i++) {
        const target = routeDecision.decision[i];
        const pt = registry.phases.get(target.phase);
        if (!pt) continue;

        const instanceId = instanceIds[i];
        // isolated=true → empty context; otherwise fork current messages
        const context = pt.isolated ? [] : contextSnapshot;
        const payload = target.payload !== undefined ? normalizePayload(target.payload) : undefined;

        const promise = executeParallelPhase(
          config,
          state,
          registry,
          pt,
          payload,
          context,
          availablePhases,
          instanceId,
          groupId,
          i,
          count,
          currentPhaseId,
        );
        parallelTasks.set(instanceId, { promise, phaseId: target.phase });
      }

      // Wait for all parallel phases to complete
      const successfulResults = await waitForBackgroundTasks(parallelTasks);

      // Stash merged results + instruction; the next iteration's entry injection will
      // assemble them into the entry phase's context message (under <prev_phase_outputs>).
      previousResults = successfulResults.map(r => ({ name: r.instanceId, output: r.payload }));
      pendingInstruction = routeDecision.instruction;

      // Determine entry phase: original phase's target > registry entry.
      // In parallel mode, the original phase's target field determines where to go after
      // all parallel phases complete. If "stop", end the run.
      const entryPhaseId = phase.target ?? registry.entryPhaseId!;
      if (entryPhaseId === "stop") {
        removePhaseMessage(config.context.messages, previousPhaseMsgId);
        removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
        previousPhaseMsgId = undefined;
        previousPhaseInputMsgId = undefined;
        return completeRun(config, state, createTerminalOutcome(phase, output, config.context.messages));
      }
      currentPhaseId = entryPhaseId;
      previousPayload = undefined; // payloads stashed in previousResults instead
      continue;
    }

    // Resolve next phase: target > route > stop
    let nextRoute: string;
    if (phase.target) {
      nextRoute = phase.target;
    } else if (output.route) {
      nextRoute = output.route;
    } else {
      nextRoute = "stop";
    }

    // Handle stop — end execution
    if (nextRoute === "stop") {
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
      previousPhaseMsgId = undefined;
      previousPhaseInputMsgId = undefined;
      return completeRun(config, state, createTerminalOutcome(phase, output, config.context.messages));
    }

    // Validate route target exists
    const targetPhaseId = nextRoute;
    if (!registry.phases.has(targetPhaseId)) {
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      removePhaseMessage(config.context.messages, previousPhaseInputMsgId);
      previousPhaseMsgId = undefined;
      previousPhaseInputMsgId = undefined;
      return completeRun(config, state, createOutcome.phaseNotFound(output));
    }

    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: targetPhaseId,
      ts: createTimestamp(),
    });

    // Pass payload to next phase (also surfaced as previousResults for entry injection)
    previousPayload = output.payload;
    previousResults = output.payload !== undefined ? [{ name: phase.name, output: output.payload }] : [];

    currentPhaseId = targetPhaseId;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
}

// ============================================================================
// Retry Logic
// ============================================================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  // Check for rate limit / overloaded / server error patterns
  if (message.includes("rate limit") || message.includes("429")) return true;
  if (message.includes("overloaded") || message.includes("529")) return true;
  if (message.includes("server error") || message.includes("500")) return true;
  if (message.includes("bad gateway") || message.includes("502")) return true;
  if (message.includes("service unavailable") || message.includes("503")) return true;
  if (message.includes("gateway timeout") || message.includes("504")) return true;
  if (message.includes("econnreset") || message.includes("econnrefused")) return true;
  // Check for invalid model schema or empty response errors (retryable)
  if ("code" in error) {
    const code = (error as { code: string }).code;
    if (code === "invalid_model_schema" || code === "empty_response") return true;
  }
  // Do NOT retry user-configured timeouts — those are intentional limits
  return false;
}

function getRetryDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(jitter, maxMs);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }
      if (options.signal?.aborted) {
        throw error;
      }
      const delayMs = getRetryDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.(attempt, error, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (options.signal?.aborted) {
        throw lastError;
      }
    }
  }
  throw lastError;
}

// ============================================================================
// Phase Execution
// ============================================================================

/** Runtime state for phase execution. */
interface PhaseRuntime {
  phase: Phase;
  config: AgentConfig;
  state: ExecutionState;
  execution: PhaseExecution;
  messageManager: PhaseMessageManager;
  registry: PhaseRegistry;
  context: PhaseContext;
}

/** Execute phase code — factory (ExtensionAPI) or run (PhaseContext) or LLM-driven. */
async function executePhase(ctx: PhaseRuntime): Promise<PhaseOutput> {
  const { phase, config, execution, registry, context } = ctx;

  if (phase.factory) {
      const api = createExtensionAPI(undefined, {
      registerPhase: () => {},
      registerProvider: () => {},
      unregisterProvider: () => {},
      registerTool: () => {},
      context: {
        cwd: process.cwd(),
        signal: config.signal,
        isIdle: () => false,
        abort: () => config.signal?.dispatchEvent(new Event("abort")),
        exec: async () => ({ exitCode: 1, stdout: "", stderr: "not available in phase context" }),
        getSystemPrompt: () => config.context.systemPrompt,
        setSystemPrompt: () => {},
        getMessages: () => context.messages as Array<{ role: string; content: string }>,
        addMessage: (role, content) => { config.context.messages.push(createMessage(role, content)); },
        getAvailableTools: () => config.context.tools.map(t => ({ name: t.name, description: t.description })),
        getAvailableSkills: () => config.context.skills.map(s => ({ name: s.name, description: s.description })),
        getPhaseContent: (id) => registry.phases.get(id)?.content ?? "",
        getAvailablePhases: () => Array.from(registry.phases.keys()),
      },
      phase: context,
    });
    await phase.factory(api);
    return {
      message: api.phase.getMessage() ?? `${phase.name} phase completed.`,
      route: api.phase.getNextPhase() || "stop",
      phase: phase.name,
      payload: api.phase.getPayload(),
    };
  }

  if (phase.run) {
    const output = resolvePhaseOutput(await phase.run(context, execution));
    output.phase = phase.name;
    if (output.message === "Phase completed.") {
      output.message = `${phase.name} phase completed.`;
    }
    return output;
  }

  // LLM-driven fallback
  return executePhaseWithModel(ctx);
}

async function executeToolCall(input: {
  config: AgentConfig;
  tools: Tool[];
  toolCall: ToolCall;
}): Promise<ToolResult> {
  let result: ToolResult;
  if (input.config.runtime?.tools) {
    result = await input.config.runtime.tools({
      config: input.config,
      toolCall: input.toolCall,
    });
  } else {
    const toolContext = {
      skills: input.config.context.skills,
      toolCallId: input.toolCall.id,
    };
    result = await executeRuntimeToolCall({
      tools: input.tools,
      toolCall: input.toolCall,
      toolContext,
      beforeToolCall: input.config.beforeToolCall,
      afterToolCall: input.config.afterToolCall,
      signal: input.config.signal,
    });
  }

  // A managed Runtime gives the Tool a separate durable Call identity. Only
  // the provider Call identity may cross this model-facing execution seam.
  return {
    ...result,
    toolCallId: input.toolCall.id,
    toolName: input.toolCall.name,
  };
}

async function executeToolCalls(input: {
  config: AgentConfig;
  tools: Tool[];
  toolCalls: readonly ToolCall[];
}): Promise<readonly ToolResult[]> {
  if (input.config.runtime?.toolsBatch) {
    const results = await input.config.runtime.toolsBatch({
      config: input.config,
      toolCalls: input.toolCalls,
    });
    if (results.length !== input.toolCalls.length) throw new Error("Runtime returned an invalid Tool batch result");
    return results.map((result, index) => ({
      ...result,
      toolCallId: input.toolCalls[index]!.id,
      toolName: input.toolCalls[index]!.name,
    }));
  }
  const results: ToolResult[] = [];
  for (const toolCall of input.toolCalls) {
    results.push(await executeToolCall({ ...input, toolCall }));
  }
  return results;
}

// ============================================================================
// PhaseExecution Factory
// ============================================================================

function createPhaseExecution(
  config: AgentConfig,
  state: ExecutionState,
  phase: Phase,
  messageManager: PhaseMessageManager,
  toolExecutionManager: PhaseToolExecutionManager,
  registry: PhaseRegistry,
): PhaseExecution {
  return {
    snapshot(): PhaseContextSnapshot {
      return {
        systemPrompt: config.context.systemPrompt,
        messages: [...config.context.messages],
        currentPhase: state.currentPhase ?? "",
        availablePhases: Array.from(registry.phases.keys()),
        turnNumber: state.metrics.iterations,
      };
    },

    restore(snapshot: PhaseContextSnapshot): void {
      config.context.systemPrompt = snapshot.systemPrompt;
      config.context.messages.length = 0;
      config.context.messages.push(...snapshot.messages);
      state.currentPhase = snapshot.currentPhase;
      state.metrics.iterations = snapshot.turnNumber;
    },

    async invokeModel(phaseContext: PhaseContext): Promise<ModelInvokeOutput> {
      // Allow extensions to transform PhaseContext before building request
      if (config.beforePrompt) {
        phaseContext = await config.beforePrompt(phase.name, phaseContext);
      }

      // Build LlmRequest — tools already phase-filtered in PhaseContext
      const request = buildModelRequest({
        systemPrompt: phaseContext.systemPrompt,
        messages: phaseContext.messages,
        tools: phaseContext.tools,
        skills: phaseContext.skills,
        promptGuidelines: phaseContext.promptGuidelines,
        appendSystemPrompt: phaseContext.appendSystemPrompt,
      }, { model: phase.model ?? config.model });

      // Ensure tools are available
      if (!request.tools) {
        if (phaseContext.tools.length > 0) {
          request.tools = phaseContext.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          }));
        }
      }

      const result = await runTurn(() =>
        withRetry(
          () => invokeModel({
            config,
            message: messageManager,
            request,
            phaseId: phase.name,
          }),
          {
            signal: config.signal,
            onRetry: () => {
              state.metrics.retryCount++;
            },
          },
        ),
      );

      await config.onModelTranscript?.(result.transcript, { phase: phase.name, model: phase.model ?? config.model });
      return result;
    },

    async executeTool(phaseContext: AgentContext, toolCall: ToolCall): Promise<ToolResult> {
      return runTurn(async () => {
        await toolExecutionManager.start(toolCall.id, toolCall.name, toolCall.args);
        const tools = phaseContext.tools.filter((tool) => tool.name !== PhaseRouteTool);
        const result = await executeToolCall({
          config: {
            ...config,
            context: {
              ...config.context,
              tools,
              skills: phaseContext.skills,
            },
          },
          tools,
          toolCall,
        });
        await toolExecutionManager.end(result.toolCallId, result.toolName, result, !result.ok);
        return result;
      });
    },

    async executeTools(phaseContext: AgentContext, toolCalls: readonly ToolCall[]): Promise<readonly ToolResult[]> {
      return runTurn(async () => {
        const tools = phaseContext.tools.filter((tool) => tool.name !== PhaseRouteTool);
        for (const toolCall of toolCalls) {
          await toolExecutionManager.start(toolCall.id, toolCall.name, toolCall.args);
        }
        const results = await executeToolCalls({
          config: {
            ...config,
            context: {
              ...config.context,
              tools,
              skills: phaseContext.skills,
            },
          },
          tools,
          toolCalls,
        });
        for (const result of results) {
          await toolExecutionManager.end(result.toolCallId, result.toolName, result, !result.ok);
        }
        return results;
      });
    },
  };
}

// ============================================================================
// Parallel Phase Execution
// ============================================================================

type ParallelResult = {
  instanceId: string;
  phaseId: string;
  payload: unknown;
  content: string;
};

async function executeParallelPhase(
  config: AgentConfig,
  state: ExecutionState,
  registry: PhaseRegistry,
  phase: Phase,
  payload: unknown,
  context: AgentMessage[],
  availablePhases: Pick<Phase, 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[],
  instanceId: string,
  groupId: string,
  index: number,
  count: number,
  sourcePhaseId: string,
): Promise<ParallelResult> {
  const messages = [...context];

  const allTools = buildToolsWithRouting(config, availablePhases);
  const phaseTools = phase.tools
    ? allTools.filter(t => t.name === PhaseRouteTool || phase.tools!.includes(t.name))
    : allTools;
  const phaseSkills = phase.skills
    ? config.context.skills.filter(s => phase.skills!.includes(s.name))
    : config.context.skills;

  // Both isolated and forked phases use the host system prompt. Phase content
  // is always injected as a user context message below.
  const systemPrompt = config.context.systemPrompt;

  const phaseContext: PhaseContext = {
    systemPrompt,
    messages,
    tools: phaseTools,
    skills: phaseSkills,
    invocation: {
      mode: "parallel",
      instanceId,
      groupId,
      index,
      count,
      sourcePhaseId,
    },
    execution: config.execution!,
    state: {
      current: phase.name,
      available: Array.from(registry.phases.keys()),
      iterations: 0,
      payload,
    },
  };

  const messageManager = createMessageManager({ messages } as AgentContext, config.onMessage, config.onMessageDelta);

  // Inject phase content for both isolated and forked phases using the same
  // user-context representation as the serial path.
  const phaseMsgId = injectPhaseContent(
    phase,
    { results: payload !== undefined ? [{ name: sourcePhaseId, output: payload }] : [] },
    messages,
  );

  const toolExecutionManager = createToolExecutionManager();
  const execution = createPhaseExecution(config, state, phase, messageManager, toolExecutionManager, registry);

  const runtime: PhaseRuntime = { phase, config, state, execution, messageManager, registry, context: phaseContext };
  const output = await executePhase(runtime);

  // Clean up injected phase message
  if (phaseMsgId) removePhaseMessage(messages, phaseMsgId);

  // Extract payload from route tool call if present, fallback to output.payload
  const decision = output.toolCalls ? extractRouteCall(output.toolCalls) : undefined;
  const resultPayload = (decision?.decision[0]?.payload !== undefined
    ? normalizePayload(decision.decision[0].payload)
    : output.payload);

  return { instanceId, phaseId: phase.name, payload: resultPayload, content: output.message };
}

async function waitForBackgroundTasks(
  backgroundTasks: Map<string, { promise: Promise<ParallelResult>; phaseId: string }>,
): Promise<ParallelResult[]> {
  const entries = Array.from(backgroundTasks.entries());
  const results = await Promise.allSettled(entries.map(([, t]) => t.promise));
  const successful: ParallelResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      successful.push({ ...r.value, instanceId: entries[i][0] });
    }
  }
  backgroundTasks.clear();
  return successful;
}
