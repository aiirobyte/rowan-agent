import type { ContentBlock, LlmToolCall, ToolCallBlock } from "./protocol";

type ToolCallUpdate = Partial<Pick<ToolCallBlock, "id" | "name" | "args">>;

/**
 * The `done` response a provider reports, projected from its accumulated blocks.
 * A provider that streams a response builds blocks once and reads them here.
 */
export function contentBlocksResponse(blocks: readonly ContentBlock[]): {
  content: string;
  thinking?: string;
  toolCalls?: LlmToolCall[];
} {
  const text: string[] = [];
  const thinking: string[] = [];
  const toolCalls: LlmToolCall[] = [];
  for (const block of blocks) {
    if (block.type === "text") text.push(block.text);
    else if (block.type === "thinking") thinking.push(block.thinking);
    else {
      let args: unknown = block.args;
      try { args = JSON.parse(block.args); } catch { /* keep raw */ }
      toolCalls.push({ id: block.id, name: block.name, arguments: args });
    }
  }
  const thinkingText = thinking.join("");
  return {
    content: text.join(""),
    ...(thinkingText ? { thinking: thinkingText } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

/** Shared ordered assembly for provider stream partials. */
export class ContentBlockAccumulator {
  private readonly blocks: ContentBlock[] = [];
  private readonly keyedIndexes = new Map<string, number>();

  appendText(text: string): number {
    const last = this.blocks.at(-1);
    if (last?.type === "text") {
      last.text += text;
      return this.blocks.length - 1;
    }
    this.blocks.push({ type: "text", text });
    return this.blocks.length - 1;
  }

  appendThinking(thinking: string): number {
    const last = this.blocks.at(-1);
    if (last?.type === "thinking") {
      last.thinking += thinking;
      return this.blocks.length - 1;
    }
    this.blocks.push({ type: "thinking", thinking });
    return this.blocks.length - 1;
  }

  startText(key: string): void {
    this.open(key, { type: "text", text: "" });
  }

  appendTextTo(key: string, text: string): void {
    const block = this.get(key);
    if (block.type !== "text") throw new TypeError(`Content block ${key} is not text.`);
    block.text += text;
  }

  startThinking(key: string, signature?: string): void {
    this.open(key, { type: "thinking", thinking: "", ...(signature ? { signature } : {}) });
  }

  setThinking(key: string, thinking: string): void {
    const block = this.get(key);
    if (block.type !== "thinking") throw new TypeError(`Content block ${key} is not thinking.`);
    block.thinking = thinking;
  }

  appendThinkingTo(key: string, thinking: string): void {
    const block = this.get(key);
    if (block.type !== "thinking") throw new TypeError(`Content block ${key} is not thinking.`);
    block.thinking += thinking;
  }

  setThinkingSignatureFor(key: string, signature: string): void {
    const index = this.keyedIndexes.get(key);
    if (index === undefined) throw new TypeError(`Content block ${key} does not exist.`);
    const block = this.blocks[index];
    if (block?.type !== "thinking") throw new TypeError(`Content block ${key} is not thinking.`);
    block.signature = signature;
  }

  startToolCall(key: string, block: ToolCallBlock): void {
    this.open(key, { ...block });
  }

  updateToolCall(key: string, update: ToolCallUpdate): void {
    const block = this.get(key);
    if (block.type !== "tool_call") throw new TypeError(`Content block ${key} is not a tool call.`);
    Object.assign(block, update);
  }

  setToolCallArguments(key: string, args: string): void {
    this.updateToolCall(key, { args });
  }

  /** A copy of the block a key opened, so providers read without mutating. */
  block(key: string): ContentBlock | undefined {
    const index = this.keyedIndexes.get(key);
    return index === undefined ? undefined : { ...this.blocks[index]! };
  }

  snapshot(): ContentBlock[] {
    return this.blocks.map((block) => ({ ...block }));
  }

  private open(key: string, block: ContentBlock): void {
    if (this.keyedIndexes.has(key)) throw new TypeError(`Content block ${key} already exists.`);
    const index = this.blocks.length;
    this.blocks.push(block);
    this.keyedIndexes.set(key, index);
  }

  private get(key: string): ContentBlock {
    const index = this.keyedIndexes.get(key);
    if (index === undefined) throw new TypeError(`Content block ${key} does not exist.`);
    return this.blocks[index]!;
  }
}
