/**
 * Context window compaction — summarizes older messages when the transcript
 * exceeds a configurable threshold, keeping recent messages intact.
 *
 * This prevents context window overflow in long-running sessions while
 * preserving the most relevant conversation history.
 */

import type { AgentMessage } from "../types";
import { createMessage } from "../types";

export type CompactionOptions = {
  /** Maximum number of messages before compaction triggers. Default: 50. */
  maxMessages?: number;
  /** Number of recent messages to always keep. Default: 10. */
  keepRecent?: number;
  /** Minimum number of messages to compact. Default: 20. */
  minCompact?: number;
};

export type CompactionResult = {
  /** Whether compaction was performed. */
  compacted: boolean;
  /** The (possibly compacted) messages. */
  messages: AgentMessage[];
  /** Number of messages that were summarized. */
  summarizedCount?: number;
  /** The summary text. */
  summary?: string;
};

/**
 * Check if compaction is needed based on message count.
 */
export function needsCompaction(
  messages: AgentMessage[],
  options: CompactionOptions = {},
): boolean {
  const maxMessages = options.maxMessages ?? 50;
  return messages.length > maxMessages;
}

/**
 * Build a compact summary of older messages.
 * Groups consecutive messages by role and extracts key information.
 */
function buildSummary(messages: AgentMessage[]): string {
  const parts: string[] = [];
  let currentRole: string | undefined;
  let currentContent: string[] = [];

  function flush(): void {
    if (currentRole && currentContent.length > 0) {
      const combined = currentContent.join("\n");
      const truncated = combined.length > 500
        ? combined.slice(0, 500) + "..."
        : combined;
      parts.push(`[${currentRole}]: ${truncated}`);
    }
    currentContent = [];
  }

  for (const msg of messages) {
    if (msg.role !== currentRole) {
      flush();
      currentRole = msg.role;
    }
    currentContent.push(msg.content);
  }
  flush();

  return parts.join("\n\n");
}

/**
 * Compact messages by summarizing older ones and keeping recent ones intact.
 *
 * Strategy:
 * 1. Keep the first user message (original request) always
 * 2. Keep the last N messages intact (recent context)
 * 3. Summarize everything in between
 * 4. Insert a single summary message replacing the old messages
 */
export function compactMessages(
  messages: AgentMessage[],
  options: CompactionOptions = {},
): CompactionResult {
  if (!needsCompaction(messages, options)) {
    return { compacted: false, messages };
  }

  const keepRecent = options.keepRecent ?? 10;
  const minCompact = options.minCompact ?? 20;

  // Find the first user message (keep it)
  const firstUserIdx = messages.findIndex(
    (m) => m.role === "user",
  );

  // Calculate boundaries
  const recentStart = Math.max(messages.length - keepRecent, firstUserIdx + 1);
  const oldMessages = messages.slice(firstUserIdx >= 0 ? firstUserIdx + 1 : 0, recentStart);

  // Don't compact if there aren't enough old messages
  if (oldMessages.length < minCompact) {
    return { compacted: false, messages };
  }

  const recentMessages = messages.slice(recentStart);
  const summary = buildSummary(oldMessages);

  // Build compacted message list
  const result: AgentMessage[] = [];

  // Keep first user message
  if (firstUserIdx >= 0) {
    result.push(messages[firstUserIdx]);
  }

  // Add summary as an assistant message
  result.push(
    createMessage("assistant", `[Context compaction summary]\n\n${summary}`, {
      type: "compaction_summary",
      compactedCount: oldMessages.length,
    }),
  );

  // Add recent messages
  result.push(...recentMessages);

  return {
    compacted: true,
    messages: result,
    summarizedCount: oldMessages.length,
    summary,
  };
}

/**
 * Estimate token count from messages (rough heuristic: ~4 chars per token).
 */
export function estimateTokenCount(messages: AgentMessage[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += msg.content.length;
    // Add overhead for role, metadata, etc.
    totalChars += 20;
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Check if compaction is needed based on estimated token count.
 */
export function needsTokenCompaction(
  messages: AgentMessage[],
  maxTokens: number = 100_000,
): boolean {
  return estimateTokenCount(messages) > maxTokens;
}
