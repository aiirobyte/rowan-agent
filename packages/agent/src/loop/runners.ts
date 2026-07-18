import type {
  AgentEvent,
  AgentMessage,
  AgentContext,
  RunResult,
  Outcome,
  Tool,
  ToolCall,
  ToolResult,
} from "../types";
import { createMessage } from "../types";
import { createId, createTimestamp } from "../utils";
import type { SessionState, AgentConfig } from "./types";

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
import { snapshotMessage, snapshotMessages } from "./state";
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

/** Remove a phase's synthetic tool_result message from the conversation by id. */
function removePhaseMessage(messages: AgentMessage[], msgId: string | undefined): void {
  if (!msgId) return;
  const idx = messages.findIndex(m => m.id === msgId);
  if (idx !== -1) messages.splice(idx, 1);
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

/** Inject phase content (plus optional prior-phase outputs) as a tool_result message.
 * Returns message id, or undefined on failure. */
function injectPhaseContent(
  phase: Phase,
  output: { instruction?: string; results: Array<{ name: string; output?: unknown }> },
  messageManager: PhaseMessageManager,
): string | undefined {
  try {
    const phaseContent = phase.filePath
      ? readPhaseContent(phase)
      : (phase.content ?? phase.description ?? "");
const content = buildPhaseDirectiveMessage(
      { name: phase.id, content: phaseContent },
      output,
      `phase_${phase.id}`,
    );
    const msgId = messageManager.start("tool", content, { phase: phase.id });
    messageManager.end(msgId);
    return msgId;
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
// Event Emission
// ============================================================================

function emitTurn(
  context: AgentContext,
  emitFn: ((event: AgentEvent) => void) | undefined,
  type: "turn_start" | "turn_end",
  extra?: { outcome?: Outcome },
): void {
  emitFn?.({
    type,
    content: snapshotMessages(context.messages),
    ...extra,
    ts: createTimestamp(),
  });
}

// ============================================================================
// Result Creation
// ============================================================================

function createRunResult(
  config: AgentConfig,
  state: SessionState,
  outcome: Outcome,
): RunResult {
  return {
    sessionId: config.sessionId!,
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
  state: SessionState,
  outcome: Outcome,
): Promise<RunResult> {
  if (outcome.display) {
    const messages = createMessageManager(config.context, config.emit, config.onMessage);
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
  availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[],
) {
  const tools = [...config.context.tools];
  if (availablePhases.length > 0) {
    tools.push(createRouteTool(availablePhases));
  }
  return tools;
}

function createMessageManager(
  context: AgentContext,
  emitFn: AgentConfig["emit"],
  onMessage?: (message: AgentMessage) => Promise<void>,
): PhaseMessageManager {
  const activeMessages = new Map<string, AgentMessage>();
  return {
    visible: () => [...context.messages],
    start(role, content, metadata) {
      const msg = createMessage(role, content, metadata);
      activeMessages.set(msg.id, msg);
      emitFn?.({ type: "message_start", message: snapshotMessage(msg), ts: createTimestamp() });
      return msg.id;
    },
    async update(messageId, delta) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      msg.content = typeof msg.content === "string"
        ? msg.content + delta
        : [...msg.content, { type: "text", text: delta }];
      emitFn?.({ type: "message_update", message: snapshotMessage(msg), delta, ts: createTimestamp() });
    },
    replaceContent(messageId, content) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      msg.content = content;
    },
    async end(messageId) {
      const msg = activeMessages.get(messageId);
      if (!msg) return;
      activeMessages.delete(messageId);
      context.messages.push(msg);
      emitFn?.({ type: "message_end", message: snapshotMessage(msg), ts: createTimestamp() });
      await onMessage?.(msg);
    },
  };
}

function createToolExecutionManager(
  emitFn: AgentConfig["emit"],
): PhaseToolExecutionManager {
  return {
    async start(toolCallId, toolName, args) {
      emitFn?.({ type: "tool_execution_start", toolCallId, toolName, args, ts: createTimestamp() });
    },
    async end(toolCallId, toolName, result, isError) {
      emitFn?.({ type: "tool_execution_end", toolCallId, toolName, result, isError, ts: createTimestamp() });
    },
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

    const executableToolCalls = collected.toolCalls.filter((toolCall) =>
      executableToolNames.has(toolCall.name),
    );
    if (executableToolCalls.length === 0) {
      return output;
    }

    for (const toolCall of executableToolCalls) {
      const result = await ctx.execution.executeTool(roundContext, toolCall);
      const messageId = ctx.messageManager.start("tool", createToolResultContent(result), {
        phase: ctx.phase.id,
      });
      await ctx.messageManager.end(messageId);
    }
  }
}

async function runTurn<T>(
  context: AgentContext,
  emitFn: AgentConfig["emit"],
  fn: () => Promise<T>,
): Promise<T> {
  emitTurn(context, emitFn, "turn_start");
  try {
    return await fn();
  } finally {
    emitTurn(context, emitFn, "turn_end");
  }
}

// ============================================================================
// Unified Phase Loop
// ============================================================================

export async function startPhaseLoop(
  config: AgentConfig,
  state: SessionState,
): Promise<RunResult> {
  const registry = config.context.phases;
  if (!registry) {
    throw new Error("AgentContext.phases is required. Construct Agent to apply the default phase.");
  }
  if (!registry.entryPhaseId) {
    throw new Error("AgentContext.phases.entryPhaseId is required. Construct Agent to apply the default phase.");
  }

  return runPhaseLoop(config, state, registry);
}

// ============================================================================
// Unified Phase Execution
// ============================================================================

async function runPhaseLoop(
  config: AgentConfig,
  state: SessionState,
  registry: PhaseRegistry,
): Promise<RunResult> {
  let currentPhaseId = registry.entryPhaseId!;
  let isContinuing = false;
  let previousPayload: unknown = undefined;
  let previousPhaseMsgId: string | undefined = undefined;
  let previousResults: Array<{ name: string; output?: unknown }> = [];
  let pendingInstruction: string | undefined = undefined;

  while (currentPhaseId) {
    // Build available phases list for route tool from the explicit registry.
    const availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[] = [];
    for (const [, phase] of registry.phases) {
      availablePhases.push({ id: phase.id, name: phase.name, description: phase.description, tools: phase.tools, skills: phase.skills, input: phase.input, isolated: phase.isolated });
    }

    const abortResult = LoopGuard.checkAbort(config.signal);
    if (abortResult.stopReason !== "none") {
      return completeRun(config, state, createOutcome.aborted());
    }

    state.metrics.iterations++;

    // Auto-compact when transcript grows too long
    if (needsCompaction(config.context.messages)) {
      const compacted = compactMessages(config.context.messages);
      if (compacted.compacted) {
        config.context.messages = compacted.messages;
        state.metrics.compactionCount++;
        config.emit?.({
          type: "message_start",
          message: {
            id: "compaction",
            role: "assistant",
            content: `[Compacted ${compacted.summarizedCount} older messages to stay within context limits]`,
            createdAt: createTimestamp(),
            metadata: { type: "compaction_notice" },
          },
          ts: createTimestamp(),
        });
      }
    }

    const phase = registry.phases.get(currentPhaseId);
    if (!phase) {
      throw new Error(`Phase "${currentPhaseId}" not found`);
    }

    state.currentPhase = currentPhaseId;

    const allTools = buildToolsWithRouting(config, availablePhases);

    const messageManager = createMessageManager(config.context, config.emit, config.onMessage);
    const toolExecutionManager = createToolExecutionManager(config.emit);

    const execution = createPhaseExecution(config, state, allTools, phase, messageManager, toolExecutionManager, registry);

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
      state: {
        current: currentPhaseId,
        available: Array.from(registry.phases.keys()),
        iterations: state.metrics.iterations,
        payload: previousPayload,
      },
    };

    // Emit phase_start only when entering a new phase (not on continue)
    const enteringNewPhase = !isContinuing;
    if (enteringNewPhase) {
      config.emit?.({ type: "phase_start", phase: currentPhaseId, ts: createTimestamp() });
    }
    isContinuing = false;

    // beforePhase hook
    if (config.beforePhase) {
      const extBefore = await config.beforePhase(currentPhaseId, phaseContext);
      if (extBefore.abort) {
        config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
        return completeRun(config, state, extBefore.abort);
      }
      if (extBefore.skip) {
        config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
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

    // Clean up previous phase's injected message to prevent context leakage
    removePhaseMessage(config.context.messages, previousPhaseMsgId);
    previousPhaseMsgId = undefined;

    // Inject phase content as tool result when entering a new phase.
    // Carries prior phase(s)' results (route payload) and optional instruction.
    if (enteringNewPhase) {
      previousPhaseMsgId = injectPhaseContent(phase, { results: previousResults, instruction: pendingInstruction }, messageManager);
      previousResults = [];
      pendingInstruction = undefined;
    }

    // Execute phase
    const runtime: PhaseRuntime = { phase, config, state, execution, messageManager, registry: registry, context: phaseContext };
    let output = await executePhase(runtime);

    // Extract route from tool calls
    let routeToolCalled = false;
    let routeDecision: RouteToolArgs | undefined;
    if (output.toolCalls && output.toolCalls.length > 0) {
      routeDecision = extractRouteCall(output.toolCalls);
      if (routeDecision) {
        routeToolCalled = true;
        applyFirstDecision(routeDecision, output);
      }
    }

    // afterPhase hook
    if (config.afterPhase) {
      const extAfter = await config.afterPhase(currentPhaseId, output);
      if (extAfter.abort) {
        config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
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
          config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
          removePhaseMessage(config.context.messages, previousPhaseMsgId);
          previousPhaseMsgId = undefined;
          return completeRun(config, state, createOutcome.aborted());
        }
        config.emit?.({ type: "user_prompt_requested", phase: currentPhaseId, ts: createTimestamp() });
        const userMessages = await config.waitForInput();
        const abortResult = LoopGuard.checkAbort(config.signal);
        if (abortResult.stopReason !== "none") {
          config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
          removePhaseMessage(config.context.messages, previousPhaseMsgId);
          previousPhaseMsgId = undefined;
          return completeRun(config, state, createOutcome.aborted());
        }
        for (const message of userMessages) {
          config.context.messages.push(message);
        }
        removePhaseMessage(config.context.messages, previousPhaseMsgId);
        previousPhaseMsgId = undefined;
        isContinuing = true;
        continue;
      }
      config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      return completeRun(config, state, createOutcome.default(output, config.context.messages));
    }

    // Handle "continue" — re-execute current phase
    if (output.route === "continue") {
      isContinuing = true;
      continue;
    }

    config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });

    // Parallel dispatch: when route tool returns multiple targets, execute all concurrently.
    // Each target gets its own PhaseContext (isolated=true → fresh, otherwise fork of current).
    // After all complete, results are stashed as previousResults for the next iteration's
    // phase entry injection (so the entry phase sees them inside its <phase_directive> message).
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
      // assemble them into the entry phase's directive message (under <phase_results>).
      previousResults = successfulResults.map(r => ({ name: r.instanceId, output: r.payload }));
      pendingInstruction = routeDecision.instruction;

      // Determine entry phase: original phase's target > registry entry.
      // In parallel mode, the original phase's target field determines where to go after
      // all parallel phases complete. If "stop", end the run.
      const entryPhaseId = phase.target ?? registry.entryPhaseId!;
      if (entryPhaseId === "stop") {
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
      if (routeToolCalled) removePhaseMessage(config.context.messages, previousPhaseMsgId);
      return completeRun(config, state, createTerminalOutcome(phase, output, config.context.messages));
    }

    // Validate route target exists
    const targetPhaseId = nextRoute;
    if (!registry.phases.has(targetPhaseId)) {
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      return completeRun(config, state, createOutcome.phaseNotFound(output));
    }

    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: targetPhaseId,
      ts: createTimestamp(),
    });

    // Pass payload to next phase (also surfaced as previousResults for entry injection)
    previousPayload = output.payload;
    previousResults = output.payload !== undefined ? [{ name: phase.id, output: output.payload }] : [];

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
  state: SessionState;
  execution: PhaseExecution;
  messageManager: PhaseMessageManager;
  registry: PhaseRegistry;
  context: PhaseContext;
}

/** Execute phase code — factory (ExtensionAPI) or run (PhaseContext) or LLM-driven. */
async function executePhase(ctx: PhaseRuntime): Promise<PhaseOutput> {
  const { phase, config, execution, registry, context } = ctx;

  if (phase.factory) {
    const api = createExtensionAPI(undefined, undefined, {
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
      session: config.context,
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
  if (input.config.runtime?.tools) {
    return input.config.runtime.tools({
      config: input.config,
      toolCall: input.toolCall,
    });
  }

  const toolContext = {
    skills: input.config.context.skills,
    toolCallId: input.toolCall.id,
  };
  return executeRuntimeToolCall({
    tools: input.tools,
    toolCall: input.toolCall,
    toolContext,
    beforeToolCall: input.config.beforeToolCall,
    afterToolCall: input.config.afterToolCall,
    signal: input.config.signal,
  });
}

// ============================================================================
// PhaseExecution Factory
// ============================================================================

function createPhaseExecution(
  config: AgentConfig,
  state: SessionState,
  allTools: Tool[],
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
        phaseContext = await config.beforePrompt(phase.id, phaseContext);
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

      const result = await runTurn(config.context, config.emit, () =>
        withRetry(
          () => invokeModel({
            config,
            message: messageManager,
            request,
            phaseId: phase.id,
          }),
          {
            signal: config.signal,
            onRetry: (attempt, error, delayMs) => {
              state.metrics.retryCount++;
              const errMsg = error instanceof Error ? error.message : String(error);
              config.emit?.({
                type: "message_start",
                message: {
                  id: `retry_${attempt}`,
                  role: "assistant",
                  content: `[Retry ${attempt + 1}/${DEFAULT_MAX_RETRIES}] Transient error: ${errMsg}. Retrying in ${Math.round(delayMs)}ms...`,
                  createdAt: createTimestamp(),
                  metadata: { type: "retry_notice" },
                },
                ts: createTimestamp(),
              });
            },
          },
        ),
      );

      await config.onModelTranscript?.(result.transcript, { phase: phase.id, model: phase.model ?? config.model });
      return result;
    },

    async executeTool(_context: AgentContext, toolCall: ToolCall): Promise<ToolResult> {
      return runTurn(config.context, config.emit, async () => {
        await toolExecutionManager.start(toolCall.id, toolCall.name, toolCall.args);
        const result = await executeToolCall({ config, tools: allTools, toolCall });
        await toolExecutionManager.end(result.toolCallId, result.toolName, result, !result.ok);
        return result;
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
  state: SessionState,
  registry: PhaseRegistry,
  phase: Phase,
  payload: unknown,
  context: AgentMessage[],
  availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input' | 'isolated'>[],
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

  // isolated=true: fresh systemPrompt from phase content, no prior messages
  // isolated=false (forked): use main systemPrompt, inject phase content as message (same as serial)
  const systemPrompt = phase.isolated
    ? readPhaseContent(phase)
    : config.context.systemPrompt;

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
    state: {
      current: phase.id,
      available: Array.from(registry.phases.keys()),
      iterations: 0,
      payload,
    },
  };

  const messageManager = createMessageManager({ messages } as AgentContext, config.emit, config.onMessage);

  // For forked (non-isolated) phases: inject phase content as message, same as serial path.
  // Outer <phase> is the executing (child) phase; inner <prev_phase_outputs><phase> is
  // the parent phase that issued the route call, carrying the payload it supplied.
  const phaseMsgId = phase.isolated
    ? undefined
    : injectPhaseContent(
        phase,
        { results: payload !== undefined ? [{ name: sourcePhaseId, output: payload }] : [] },
        messageManager,
      );

  const toolExecutionManager = createToolExecutionManager(config.emit);
  const execution = createPhaseExecution(config, state, phaseTools, phase, messageManager, toolExecutionManager, registry);

  const runtime: PhaseRuntime = { phase, config, state, execution, messageManager, registry, context: phaseContext };
  const output = await executePhase(runtime);

  // Clean up injected phase message
  if (phaseMsgId) removePhaseMessage(messages, phaseMsgId);

  // Extract payload from route tool call if present, fallback to output.payload
  const decision = output.toolCalls ? extractRouteCall(output.toolCalls) : undefined;
  const resultPayload = (decision?.decision[0]?.payload !== undefined
    ? normalizePayload(decision.decision[0].payload)
    : output.payload);

  return { instanceId, phaseId: phase.id, payload: resultPayload, content: output.message };
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
