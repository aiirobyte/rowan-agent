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
  };
}
