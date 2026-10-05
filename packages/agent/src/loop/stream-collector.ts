import type {
  LlmStreamEvent,
  ToolCall,
} from "../types";
import { contentBlocksToMessageContent } from "../types";
import type { AgentConfig } from "./types";
import type {
  AssistantMessagePartial,
  TextBlock,
  ToolCallBlock,
  LlmRequest,
  LlmResponse,
  ProviderCallContext,
} from "@rowan-agent/models";
import type { ModelInvokeOutput, PhaseMessageManager } from "./execution";
import type { ThinkingDeltaNotification, ToolCallDeltaNotification } from "./types";
import { parsePartialJson } from "./partial-json";
import type { ModelTranscript } from "../protocol/turn";
import { LoopGuard, EmptyResponseError, ModelOutputLimitError } from "./errors";
import { resolveScopeFromMetadata } from "../extensions/host";
import type { JsonObject, JsonValue, RunId } from "../runtime-events";

const MAX_STREAMED_OUTPUT_CHARACTERS = 1024 * 1024;

export type ModelInvokerInput = {
  config: AgentConfig;
  message: PhaseMessageManager;
  request: LlmRequest;
  phaseId: string;
  output?: "reply" | "internal";
  onThinkingDelta?: (event: ThinkingDeltaNotification) => void;
  onToolCallDelta?: (event: ToolCallDeltaNotification) => void;
  callContext?: ProviderCallContext;
};

export type ModelInvokerResult = ModelInvokeOutput & {
  transcript: ModelTranscript;
};

/**
 * Invoke the model and collect the stream result.
 * Uses done.response as the final truth when available,
 * falls back to partial accumulation otherwise.
 */
export async function invokeModel(input: ModelInvokerInput): Promise<ModelInvokerResult> {
  const callContext: ProviderCallContext = input.callContext ?? {
    signal: input.config.signal ?? new AbortController().signal,
    run: {
      id: input.config.execution.runId,
      agentId: input.config.execution.agentId,
      scope: resolveScopeFromMetadata(input.config.execution.runMetadata),
      cwd: (typeof input.config.execution.runMetadata?.cwd === "string" ? input.config.execution.runMetadata.cwd : undefined)
        ?? input.config.context.cwd
        ?? "",
    },
    emit: (activity) => {
      const turn: JsonObject = {
        ...(typeof input.config.execution.input === "object"
          && input.config.execution.input !== null
          && !Array.isArray(input.config.execution.input)
            ? (input.config.execution.input as unknown as JsonObject)
            : {}),
        turnIndex: 0,
      };
      input.config.onProviderActivity?.({
        runId: input.config.execution.runId as RunId,
        turn,
        activity,
      });
    },
    interact: async (request) => {
      const handler = input.config.runtime?.interact ?? input.config.interact;
      if (!handler) {
        throw new Error("Run interactions are not supported in this runtime.");
      }
      return handler(request);
    },
    tools: {
      list: () => {
        return input.config.context.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as JsonValue | undefined,
        }));
      },
      call: async () => {
        throw new Error("Tool calling is not available in standalone stream collector without callContext.");
      },
    },
  };
  const events = input.config.stream(input.request, callContext);
  const result = await collectStreamResult({
    config: input.config,
    message: input.message,
    events,
    metadataPhase: input.phaseId,
    output: input.output,
    onThinkingDelta: input.onThinkingDelta,
    onToolCallDelta: input.onToolCallDelta,
  });

  const response: LlmResponse = result.doneResponse ?? {
    content: result.text,
    toolCalls: result.toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.args,
    })),
    stopReason: result.stopReason as LlmResponse["stopReason"],
  };

  return {
    text: result.text,
    contentBlocks: result.contentBlocks,
    toolCalls: result.toolCalls,
    stopReason: result.stopReason,
    transcript: {
      request: input.request,
      response,
    },
  };
}

// ---------------------------------------------------------------------------
// Stream collection (internal)
// ---------------------------------------------------------------------------

type StreamCollectionResult = ModelInvokeOutput & {
  doneResponse?: LlmResponse;
};

async function collectStreamResult(input: {
  config: AgentConfig;
  message: PhaseMessageManager;
  events: AsyncIterable<LlmStreamEvent>;
  metadataPhase: string;
  output?: "reply" | "internal";
  onThinkingDelta?: (event: ThinkingDeltaNotification) => void;
  onToolCallDelta?: (event: ToolCallDeltaNotification) => void;
}): Promise<StreamCollectionResult> {
  const persistAssistant = input.output !== "internal";
  let activeMessageId: string | undefined;
  let lastPartial: AssistantMessagePartial | undefined;
  let stopReason: string | undefined;
  let doneResponse: LlmResponse | undefined;
  let streamedOutputCharacters = 0;
  const toolCallsWithDeltas = new Set<string>();
  const thinkingOffsets = new Map<number, number>();
  const toolNames = new Map<string, string>();
  const toolArguments = new Map<string, string>();

  for await (const event of input.events) {
    if (event.type === "text_delta") {
      streamedOutputCharacters += event.text.length;
    } else if (event.type === "thinking_delta") {
      streamedOutputCharacters += event.thinking.length;
    } else if (event.type === "tool_call_delta") {
      streamedOutputCharacters += event.arguments.length;
      toolCallsWithDeltas.add(event.id);
    } else if (event.type === "tool_call_end" && !toolCallsWithDeltas.has(event.id)) {
      streamedOutputCharacters += event.arguments.length;
    }
    if (streamedOutputCharacters > MAX_STREAMED_OUTPUT_CHARACTERS) {
      throw new ModelOutputLimitError(MAX_STREAMED_OUTPUT_CHARACTERS);
    }

    const abortResult = LoopGuard.checkAbort(input.config.signal);
    if (abortResult.stopReason !== "none") {
      // Flush the partial assistant reply so it lands in the transcript as a
      // completed message. This keeps the user/assistant alternation intact
      // and lets the next durable Agent Input resume from this snapshot.
      if (persistAssistant && activeMessageId) {
        await input.message.end(activeMessageId);
        activeMessageId = undefined;
      }
      return { text: abortResult.message, contentBlocks: [], toolCalls: [], stopReason: "aborted" };
    }

    if (event.type === "error") {
      throw event.error;
    }

    if (event.type === "start") {
      lastPartial = event.partial;
      if (persistAssistant) {
        activeMessageId ??= input.message.reserve("assistant", {
          phase: input.metadataPhase,
        });
      }
    }

    if (event.type === "text_delta") {
      lastPartial = event.partial;
      if (persistAssistant && !activeMessageId) {
        activeMessageId = input.message.reserve("assistant", {
          phase: input.metadataPhase,
        });
      }
      if (persistAssistant && activeMessageId) await input.message.update(activeMessageId, event.text);
    }

    if (event.type === "tool_call_start" || event.type === "tool_call_delta" || event.type === "tool_call_end") {
      if (persistAssistant) {
        activeMessageId ??= input.message.reserve("assistant", {
          phase: input.metadataPhase,
        });
      }
      lastPartial = event.partial;
    }

    if (event.type === "tool_call_start") {
      toolNames.set(event.id, event.name);
    }

    if (event.type === "tool_call_delta") {
      const accumulated = (toolArguments.get(event.id) ?? "") + event.arguments;
      toolArguments.set(event.id, accumulated);
      const toolName = toolNames.get(event.id)
        ?? event.partial.contentBlocks.find((b): b is ToolCallBlock => b.type === "tool_call" && b.id === event.id)?.name
        ?? "";
      if (toolName && !toolNames.has(event.id)) {
        toolNames.set(event.id, toolName);
      }
      if (persistAssistant && activeMessageId) {
        input.onToolCallDelta?.({
          messageId: activeMessageId,
          providerToolCallId: event.id,
          toolName,
          arguments: accumulated,
          args: parsePartialJson(accumulated),
        });
      }
    }

    if (event.type === "thinking_delta") {
      if (persistAssistant && !activeMessageId) {
        activeMessageId = input.message.reserve("assistant", {
          phase: input.metadataPhase,
        });
      }
      lastPartial = event.partial;
      if (persistAssistant && activeMessageId) {
        let blockIndex = 0;
        for (let index = event.partial.contentBlocks.length - 1; index >= 0; index -= 1) {
          if (event.partial.contentBlocks[index]?.type === "thinking") {
            blockIndex = index;
            break;
          }
        }
        const offset = thinkingOffsets.get(blockIndex) ?? 0;
        input.onThinkingDelta?.({
          messageId: activeMessageId,
          blockIndex,
          offset,
          text: event.thinking,
        });
        thinkingOffsets.set(blockIndex, offset + event.thinking.length);
      }
    }

    if (event.type === "done") {
      doneResponse = event.response;
      stopReason = event.response?.stopReason;

      const contentBlocks = lastPartial?.contentBlocks ?? [];
      const hasContent = contentBlocks.length > 0
        || (event.response?.content?.length ?? 0) > 0
        || (event.response?.toolCalls?.length ?? 0) > 0;

      const shouldStoreContentParts = contentBlocks.some((block) => block.type !== "text");
      if (persistAssistant && activeMessageId && hasContent && shouldStoreContentParts) {
        input.message.replaceContent(activeMessageId, contentBlocksToMessageContent(contentBlocks));
      }

      if (persistAssistant && activeMessageId) {
        if (hasContent) await input.message.end(activeMessageId);
        else input.message.discard(activeMessageId);
        activeMessageId = undefined;
      }
    }
  }

  const abortResult = LoopGuard.checkAbort(input.config.signal);
  if (abortResult.stopReason !== "none") {
    if (persistAssistant && activeMessageId) {
      await input.message.end(activeMessageId);
      activeMessageId = undefined;
    }
    return { text: abortResult.message, contentBlocks: [], toolCalls: [], stopReason: "aborted" };
  }

  if (persistAssistant && activeMessageId) {
    await input.message.end(activeMessageId);
  }

  // Detect empty responses — model returned no text and no tool calls.
  // Abort and error stop reasons are handled upstream, so only flag benign stop reasons.
  const hasContent = (lastPartial?.contentBlocks?.length ?? 0) > 0
    || (doneResponse?.content?.length ?? 0) > 0
    || (doneResponse?.toolCalls?.length ?? 0) > 0;
  if (!hasContent && stopReason !== "error" && stopReason !== "aborted") {
    throw new EmptyResponseError();
  }

  // Use done.response as final truth when available
  if (doneResponse) {
    const toolCalls: ToolCall[] = (doneResponse.toolCalls ?? []).map(tc => ({
      id: tc.id,
      name: tc.name,
      args: tc.arguments,
    }));
    return {
      text: doneResponse.content,
      contentBlocks: lastPartial?.contentBlocks ?? [],
      toolCalls,
      stopReason: doneResponse.stopReason,
      doneResponse,
    };
  }

  // Fallback: extract from lastPartial
  const contentBlocks = lastPartial?.contentBlocks ?? [];
  const text = contentBlocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const toolCalls: ToolCall[] = contentBlocks
    .filter((b): b is ToolCallBlock => b.type === "tool_call")
    .map((b) => {
      let parsedArgs: unknown = b.args;
      try { parsedArgs = JSON.parse(b.args); } catch { /* keep raw */ }
      return { id: b.id, name: b.name, args: parsedArgs };
    });

  return { text, contentBlocks, toolCalls, stopReason };
}
