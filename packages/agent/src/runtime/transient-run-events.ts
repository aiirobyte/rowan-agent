import type {
  ExecutionId,
  MessageDelta,
  RunId,
  ToolProgress,
} from "../runtime-events";

export type TransientRunEvent = MessageDelta | ToolProgress;

const MAX_BUFFERED_EVENTS = 128;
const MAX_BUFFERED_TEXT = 64 * 1024;

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export class TransientRunEventSubscription {
  private readonly queue: TransientRunEvent[] = [];
  private wake = deferred();
  private version = 0;
  private stopped = false;

  push(event: TransientRunEvent): void {
    if (this.stopped) return;
    const previous = this.queue.at(-1);
    if (
      previous?.kind === "message_delta"
      && event.kind === "message_delta"
      && previous.executionId === event.executionId
      && previous.messageId === event.messageId
      && previous.offset + previous.text.length === event.offset
    ) {
      this.queue[this.queue.length - 1] = {
        ...previous,
        text: previous.text + event.text,
      };
    } else {
      if (this.queue.length >= MAX_BUFFERED_EVENTS) this.queue.shift();
      this.queue.push(event);
    }
    this.trimText();
    this.notify();
  }

  shift(): TransientRunEvent | undefined {
    return this.queue.shift();
  }

  clear(executionId?: ExecutionId): void {
    if (executionId === undefined) this.queue.length = 0;
    else {
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        if (this.queue[index]?.executionId === executionId) this.queue.splice(index, 1);
      }
    }
    this.notify();
  }

  clearMessage(messageId: MessageDelta["messageId"]): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const event = this.queue[index];
      if (event?.kind === "message_delta" && event.messageId === messageId) this.queue.splice(index, 1);
    }
    this.notify();
  }

  clearTool(toolCallId: ToolProgress["toolCallId"]): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const event = this.queue[index];
      if (event?.kind === "tool_progress" && event.toolCallId === toolCallId) this.queue.splice(index, 1);
    }
    this.notify();
  }

  checkpoint(): number {
    return this.version;
  }

  changed(since: number): Promise<void> {
    if (this.version !== since || this.queue.length > 0 || this.stopped) return Promise.resolve();
    return this.wake.promise;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queue.length = 0;
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = deferred();
    this.version += 1;
    wake.resolve();
  }

  private trimText(): void {
    let buffered = this.queue.reduce(
      (length, event) => length + (event.kind === "message_delta" ? event.text.length : 0),
      0,
    );
    while (buffered > MAX_BUFFERED_TEXT) {
      const index = this.queue.findIndex((event) => event.kind === "message_delta");
      if (index < 0) return;
      const event = this.queue[index] as MessageDelta;
      const overflow = buffered - MAX_BUFFERED_TEXT;
      if (event.text.length <= overflow) {
        this.queue.splice(index, 1);
        buffered -= event.text.length;
      } else {
        this.queue[index] = {
          ...event,
          offset: event.offset + overflow,
          text: event.text.slice(overflow),
        };
        buffered -= overflow;
      }
    }
  }
}

export class TransientRunEventHub {
  private readonly subscriptions = new Map<RunId, Set<TransientRunEventSubscription>>();

  subscribe(runId: RunId): TransientRunEventSubscription {
    const subscription = new TransientRunEventSubscription();
    const current = this.subscriptions.get(runId) ?? new Set();
    current.add(subscription);
    this.subscriptions.set(runId, current);
    return subscription;
  }

  unsubscribe(runId: RunId, subscription: TransientRunEventSubscription): void {
    subscription.stop();
    const current = this.subscriptions.get(runId);
    current?.delete(subscription);
    if (current?.size === 0) this.subscriptions.delete(runId);
  }

  publish(event: TransientRunEvent): void {
    for (const subscription of this.subscriptions.get(event.runId) ?? []) {
      subscription.push(event);
    }
  }

  clear(runId: RunId, executionId?: ExecutionId): void {
    for (const subscription of this.subscriptions.get(runId) ?? []) {
      subscription.clear(executionId);
    }
  }

  clearMessage(runId: RunId, messageId: MessageDelta["messageId"]): void {
    for (const subscription of this.subscriptions.get(runId) ?? []) subscription.clearMessage(messageId);
  }

  clearTool(runId: RunId, toolCallId: ToolProgress["toolCallId"]): void {
    for (const subscription of this.subscriptions.get(runId) ?? []) subscription.clearTool(toolCallId);
  }

  close(): void {
    for (const subscriptions of this.subscriptions.values()) {
      for (const subscription of subscriptions) subscription.stop();
    }
    this.subscriptions.clear();
  }
}
