import type {
  AgentEvent,
  AgentMessage,
  AgentContext,
  RunResult,
  Outcome,
  Tool,
  ToolCall,
  ToolResult,
  Skill,
} from "../types";
import { createMessage } from "../types";
import { createTimestamp } from "../utils";
import type { SessionState, AgentConfig } from "./types";
import { resolveThreadLimits } from "./types";

// Execution types (loop-level)
import type {
  PhaseMessageManager,
  PhaseToolExecutionManager,
  ModelInvokeOutput,
  PhaseExecution,
  AgentContextSnapshot,
} from "./execution";
import { invokeModel } from "./stream-collector";
import type { PhaseInput, PhaseOutput } from "../protocol/context";
import type { PhaseContext } from "../harness/phases/types";
import { createExtensionAPI } from "../extensions/api";

// Phase system types
import type {
  Phase,
  PhaseRegistry,
} from "../harness/phases";
import { reloadPhases, readPhaseContent } from "../harness/phases";

import { executeRuntimeToolCall } from "../harness/tools";
import { buildModelRequest } from "../harness/context/prompt-builder";
import { LoopGuard } from "./errors";
import { createOutcome } from "./outcomes";
import { snapshotMessage, snapshotMessages } from "./state";
import { createRouteTool, extractRouteCall, createThreadTool, PhaseRouteTool } from "../harness/tools";
import { compactMessages, needsCompaction } from "../harness/context/compaction";
import { jsonToXml } from "../harness/context/resource-formatter";
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
  // Finalize metrics
  state.metrics.endedAt = createTimestamp();
  state.metrics.durationMs = Date.now() - state.metrics.startedAtMs;

  await config.onOutcome?.(outcome);

  return createRunResult(config, state, outcome);
}

// ============================================================================
// Tools Factory
// ============================================================================

function buildToolsWithRouting(
  config: AgentConfig,
  availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input'>[],
  runLoop: (input: AgentConfig) => Promise<RunResult>,
) {
  const tools = [...config.context.tools];
  if (availablePhases.length > 0) {
    tools.push(createRouteTool(availablePhases));
  }
  const threadTool = createThreadTool(config.context.tools, config.context.skills, async (input) => {
    const runtime = resolveThreadLimits(config.limits);
    const result = await runLoop({
      context: {
        systemPrompt: config.context.systemPrompt,
        messages: [createMessage("user", input.prompt)],
        tools: input.tools?.slice() ?? config.context.tools.slice(),
        skills: input.skills?.slice() ?? config.context.skills.slice(),
      },
      sessionId: config.sessionId!,
      model: config.model,
      stream: config.stream,
      maxAttempts: config.maxAttempts,
      limits: {
        ...config.limits,
        threadDepth: runtime.threadDepth + 1,
        maxThreadDepth: runtime.maxThreadDepth,
      },
      signal: config.signal,
      runtime: config.runtime,
      beforeToolCall: config.beforeToolCall,
      afterToolCall: config.afterToolCall,
      beforePhase: config.beforePhase,
      afterPhase: config.afterPhase,
      beforePrompt: config.beforePrompt,
      emit: config.emit,
      phases: config.phases,
    });
    return result;
  });
  return [...tools, threadTool];
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

async function executePhaseWithModel(ctx: PhaseExecutionContext): Promise<PhaseOutput> {
  const { config, execution, messageManager, phase, phaseInput, phaseTools, phaseSkills } = ctx;
  const executableToolNames = new Set(
    phaseTools
      .filter((tool) => tool.name !== PhaseRouteTool)
      .map((tool) => tool.name),
  );
  let output: PhaseOutput = {
    message: "",
    route: "stop",
    phase: phase.name,
    toolCalls: [],
  };

  while (true) {
    const roundContext: AgentContext = {
      systemPrompt: config.context.systemPrompt,
      messages: messageManager.visible(),
      tools: phaseTools,
      skills: phaseSkills,
    };
    const roundInput: PhaseInput = {
      ...phaseInput,
      messages: snapshotMessages(roundContext.messages),
      tools: phaseInput.tools,
      skills: phaseInput.skills,
      phaseTools,
      phaseSkills,
    };
    const collected = await execution.invokeModel(roundContext, { phaseInput: roundInput });

    output = {
      message: collected.text,
      route: "stop",
      phase: phase.name,
      toolCalls: collected.toolCalls,
    };

    const executableToolCalls = collected.toolCalls.filter((toolCall) =>
      executableToolNames.has(toolCall.name),
    );
    if (executableToolCalls.length === 0) {
      return output;
    }

    for (const toolCall of executableToolCalls) {
      const result = await execution.executeTool(roundContext, toolCall);
      const messageId = messageManager.start("tool", createToolResultContent(result), {
        phase: phase.id,
      });
      await messageManager.end(messageId);
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

export async function runPhaseLoop(
  config: AgentConfig,
  state: SessionState,
  runLoop: (input: AgentConfig) => Promise<RunResult>,
): Promise<RunResult> {
  const entryPhaseId = config.phases?.entryPhaseId ?? "default";

  // Build registry: always include default phase as the first entry
  const phases = new Map<string, Phase>();

  // Add default phase first
  phases.set("default", {
    id: "default",
    name: "Execution Phase",
    description: "Executes concrete task operations and produces artifacts.",
    filePath: "",
    baseDir: "",
    content: "Execute tasks using current context.\nNo planning. No evaluation.\nRoute to next phase or stop when done.",
  });

  // Merge configured phases (user-defined "default" overrides built-in)
  if (config.phases) {
    for (const [id, phase] of config.phases.phases) {
      phases.set(id, phase);
    }
  }

  const registry: PhaseRegistry = {
    phases,
    entryPhaseId,
  };

  return runPhase(config, state, registry, runLoop);
}

// ============================================================================
// Unified Phase Execution
// ============================================================================

async function runPhase(
  config: AgentConfig,
  state: SessionState,
  registry: PhaseRegistry,
  runLoop: (input: AgentConfig) => Promise<RunResult>,
): Promise<RunResult> {
  // Hot-reload: re-read phase files from disk before each run
  const freshRegistry = await reloadPhases(registry);

  let currentPhaseId = freshRegistry.entryPhaseId!;
  let isContinuing = false;
  let previousPayload: unknown = undefined;
  let previousPhaseMsgId: string | undefined = undefined;

  // Build available phases list for route tool
  const availablePhases: Pick<Phase, 'id' | 'name' | 'description' | 'tools' | 'skills' | 'input'>[] = [];
  for (const [, phase] of freshRegistry.phases) {
    availablePhases.push({ id: phase.id, name: phase.name, description: phase.description, tools: phase.tools, skills: phase.skills, input: phase.input });
  }

  while (currentPhaseId) {
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

    const phase = freshRegistry.phases.get(currentPhaseId);
    if (!phase) {
      throw new Error(`Phase "${currentPhaseId}" not found in registry`);
    }

    state.currentPhase = currentPhaseId;

    const allTools = buildToolsWithRouting(config, availablePhases, runLoop);

    const messageManager = createMessageManager(config.context, config.emit, config.onMessage);
    const toolExecutionManager = createToolExecutionManager(config.emit);

    const execution = createPhaseExecution(config, state, allTools, phase, messageManager, toolExecutionManager);

    // Build AgentContext for this phase
    const agentContext: AgentContext = {
      systemPrompt: config.context.systemPrompt,
      messages: messageManager.visible(),
      tools: allTools,
      skills: config.context.skills,
    };

    // Build PhaseInput for hooks
    // undefined = all available; explicit [] = none available
    // route tool is always available regardless of phase.tools config
    const phaseTools = phase.tools
      ? allTools.filter(t => t.name === PhaseRouteTool || phase.tools!.includes(t.name))
      : allTools;
    const phaseSkills = phase.skills
      ? config.context.skills.filter(s => phase.skills!.includes(s.name))
      : config.context.skills;

    let phaseInput: PhaseInput = {
      phase: currentPhaseId,
      systemPrompt: config.context.systemPrompt,
      messages: agentContext.messages,
      tools: allTools,
      skills: config.context.skills,
      phaseTools,
      phaseSkills,
      payload: previousPayload,
    };

    // Emit phase_start only when entering a new phase (not on continue)
    const enteringNewPhase = !isContinuing;
    if (enteringNewPhase) {
      config.emit?.({ type: "phase_start", phase: currentPhaseId, ts: createTimestamp() });
    }
    isContinuing = false;

    // beforePhase hook
    if (config.beforePhase) {
      const extBefore = await config.beforePhase(currentPhaseId, phaseInput);
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
        phaseInput = extBefore.input;
      }
    }

    // Clean up previous phase's injected message to prevent context leakage
    removePhaseMessage(config.context.messages, previousPhaseMsgId);
    previousPhaseMsgId = undefined;

    // Inject phase content as tool result when entering a new phase
    if (enteringNewPhase) {
      try {
        let phaseContent = phase.filePath
          ? readPhaseContent(phase)
          : (phase.content ?? phase.description ?? "");

        // Append payload as XML to phase content
        if (phaseInput.payload !== undefined) {
          phaseContent += `\n\n<phase_input>\n${jsonToXml(phaseInput.payload, 1)}\n</phase_input>`;
        }

        if (phaseContent) {
          const content: LlmContentPart[] = [{
            type: "tool_result",
            toolUseId: `phase_${phase.id}`,
            content: `<phase name="${phase.id}">\n${phaseContent}\n</phase>`,
            isError: false,
          }];
          const msgId = messageManager.start("tool", content, { phase: phase.id });
          await messageManager.end(msgId);
          previousPhaseMsgId = msgId;
        }
      } catch {
        // Phase content formatting failed — continue without content
      }
    }

    // Execute phase
    const execCtx = { phase, config, state, execution, messageManager, registry: freshRegistry, agentContext, currentPhaseId, payload: previousPayload, phaseInput, phaseTools, phaseSkills };
    let output = await executePhase(execCtx);

    // ToolChoice fallback
    if (phaseInput.toolChoice && typeof phaseInput.toolChoice === 'object' && phaseInput.toolChoice.type === 'tool') {
      const requiredTool = phaseInput.toolChoice.name;
      const hasRequiredTool = output.toolCalls?.some(tc => tc.name === requiredTool);
      if (!hasRequiredTool) {
        state.metrics.retryCount++;
      }
    }

    // Framework-level route check: extract route from tool calls
    let routeToolCalled = false;
    if (output.toolCalls && output.toolCalls.length > 0) {
      const routeDecision = extractRouteCall(output.toolCalls);
      if (routeDecision) {
        routeToolCalled = true;
        output.route = routeDecision.route;
        if (routeDecision.reason) {
          output.routeReason = routeDecision.reason;
        }
        if (routeDecision.payload !== undefined) {
          output.payload = normalizePayload(routeDecision.payload);
        }
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
        output = await executePhase(execCtx);
        if (output.toolCalls && output.toolCalls.length > 0) {
          const routeDecision = extractRouteCall(output.toolCalls);
          if (routeDecision) {
            output.route = routeDecision.route;
            if (routeDecision.reason) {
              output.routeReason = routeDecision.reason;
            }
            if (routeDecision.payload !== undefined) {
              output.payload = normalizePayload(routeDecision.payload);
            }
          }
        }
      }
      if (extAfter.output) {
        output = extAfter.output;
      }
    }

    // Handle "continue" — re-execute current phase
    if (output.route === "continue") {
      isContinuing = true;
      continue;
    }

    config.emit?.({ type: "phase_end", phase: currentPhaseId, ts: createTimestamp() });

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
      return completeRun(config, state, createOutcome.default(output, config.context.messages));
    }

    // Validate route target exists
    const targetPhaseId = nextRoute;
    if (!freshRegistry.phases.has(targetPhaseId)) {
      removePhaseMessage(config.context.messages, previousPhaseMsgId);
      return completeRun(config, state, createOutcome.phaseNotFound(output));
    }

    state.metrics.phaseTransitions.push({
      from: currentPhaseId,
      to: targetPhaseId,
      ts: createTimestamp(),
    });

    // Pass payload to next phase
    previousPayload = output.payload;

    currentPhaseId = targetPhaseId;
  }

  throw new Error("Phase machine exited without a stop or abort transition.");
}

// ============================================================================
// Retry Logic
// ============================================================================

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
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
// Phase Capabilities
// ============================================================================

// ============================================================================
// Phase Execution
// ============================================================================

/** Context for phase execution — everything needed to run a phase. */
interface PhaseExecutionContext {
  phase: Phase;
  config: AgentConfig;
  state: SessionState;
  execution: PhaseExecution;
  messageManager: PhaseMessageManager;
  registry: PhaseRegistry;
  agentContext: AgentContext;
  currentPhaseId: string;
  payload: unknown;
  phaseInput: PhaseInput;
  phaseTools: Tool[];
  phaseSkills: Skill[];
}

/** Execute phase code — factory (ExtensionAPI) or run (PhaseContext) or LLM-driven. */
async function executePhase(ctx: PhaseExecutionContext): Promise<PhaseOutput> {
  const { phase, config, state, execution, messageManager, registry, agentContext, currentPhaseId, payload } = ctx;

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
        getMessages: () => agentContext.messages as Array<{ role: string; content: string }>,
        addMessage: (role, content) => { config.context.messages.push(createMessage(role, content)); },
        getAvailableTools: () => config.context.tools.map(t => ({ name: t.name, description: t.description })),
        getAvailableSkills: () => config.context.skills.map(s => ({ name: s.name, description: s.description })),
        getPhaseContent: (id) => registry.phases.get(id)?.content ?? "",
        getAvailablePhases: () => Array.from(registry.phases.keys()),
      },
      phase: {
        systemPrompt: config.context.systemPrompt,
        messages: messageManager.visible(),
        currentPhase: currentPhaseId,
        availablePhases: Array.from(registry.phases.keys()),
        turnNumber: state.metrics.iterations,
        payload,
      },
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
    const runCtx: PhaseContext = {
      systemPrompt: config.context.systemPrompt,
      messages: messageManager.visible(),
      currentPhase: currentPhaseId,
      availablePhases: Array.from(registry.phases.keys()),
      turnNumber: state.metrics.iterations,
      payload,
    };
    const output = resolvePhaseOutput(await phase.run(runCtx, execution));
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
): PhaseExecution {
  // Build PhaseInput from AgentContext + phase config
  function buildPhaseInput(context: AgentContext): PhaseInput {
    // undefined = all available; explicit [] = none available
    // route tool is always available regardless of phase.tools config
    const phaseTools = phase.tools
      ? context.tools.filter(t => t.name === PhaseRouteTool || phase.tools!.includes(t.name))
      : context.tools;
    const phaseSkills = phase.skills
      ? context.skills.filter(s => phase.skills!.includes(s.name))
      : context.skills;

    return {
      phase: phase.id,
      systemPrompt: context.systemPrompt,
      messages: context.messages,
      tools: context.tools,
      skills: context.skills,
      phaseTools,
      phaseSkills,
    };
  }

  return {
    snapshot(context: AgentContext): AgentContextSnapshot {
      return { messagesLength: context.messages.length };
    },

    restore(context: AgentContext, snapshot: AgentContextSnapshot): void {
      context.messages.length = snapshot.messagesLength;
      config.context.messages.length = Math.min(config.context.messages.length, snapshot.messagesLength);
    },

    async invokeModel(context: AgentContext, options?: { phaseInput?: PhaseInput }): Promise<ModelInvokeOutput> {
      let phaseInput = options?.phaseInput ?? buildPhaseInput(context);

      // Allow extensions to transform PhaseInput before building request
      if (config.beforePrompt) {
        phaseInput = await config.beforePrompt(phase.id, phaseInput);
      }

      // Build LlmRequest
      const request = buildModelRequest({
        systemPrompt: phaseInput.systemPrompt,
        messages: phaseInput.messages,
        tools: phaseInput.tools,
        skills: phaseInput.skills,
        toolsFilter: phaseInput.phaseTools,
        skillsFilter: phaseInput.phaseSkills,
        promptGuidelines: phaseInput.promptGuidelines,
        appendSystemPrompt: phaseInput.appendSystemPrompt,
      }, { model: config.model });

      // Ensure tools are available
      if (!request.tools) {
        const modelTools = phaseInput.phaseTools ?? phaseInput.tools;
        if (modelTools.length > 0) {
          request.tools = modelTools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          }));
        }
      }
      if (phaseInput.toolChoice && !request.toolChoice) {
        request.toolChoice = phaseInput.toolChoice;
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

      await config.onModelTranscript?.(result.transcript, { phase: phase.id, model: config.model });
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
