/**
 * EventBus — simple pub/sub for inter-extension communication.
 *
 * Extensions can emit and subscribe to arbitrary events via `api.events`.
 * This allows extensions to coordinate without direct coupling.
 *
 * @example
 * ```typescript
 * // Extension A
 * api.events.on("my-plugin:ready", (data) => {
 *   console.log("Plugin ready:", data);
 * });
 *
 * // Extension B
 * api.events.emit("my-plugin:ready", { version: "1.0" });
 * ```
 */

type Listener = (...args: unknown[]) => void;

export interface EventBus {
  /** Subscribe to an event. Returns unsubscribe function. */
  on(event: string, listener: Listener): () => void;
  /** Emit an event to all subscribers. */
  emit(event: string, ...args: unknown[]): void;
  /** Remove all listeners for an event, or all listeners if no event specified. */
  off(event?: string): void;
  /** Check if there are listeners for an event. */
  has(event: string): boolean;
  /** Get listener count for an event. */
  count(event: string): number;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Listener>>();

  return {
    on(event: string, listener: Listener): () => void {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(event);
      };
    },

    emit(event: string, ...args: unknown[]): void {
      const set = listeners.get(event);
      if (!set) return;
      for (const listener of set) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`[event-bus] Listener error for "${event}":`, err);
        }
      }
    },

    off(event?: string): void {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    },

    has(event: string): boolean {
      const set = listeners.get(event);
      return set !== undefined && set.size > 0;
    },

    count(event: string): number {
      return listeners.get(event)?.size ?? 0;
    },
  };
}
