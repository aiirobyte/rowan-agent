import type { PhaseDefinition } from "../loop/phases/config";
import type {
  ExtensionAPI,
  ExtensionFactory,
  ExtensionPhaseHandler,
  PhaseManifest,
  BeforePhaseHookContext,
  AfterPhaseHookContext,
} from "./types";

// ---------------------------------------------------------------------------
// Extension Runner — loads extensions and provides phase definitions + handlers
// ---------------------------------------------------------------------------

export class ExtensionRunner {
  readonly #phases = new Map<string, PhaseDefinition>();
  readonly #handlers = new Map<string, ExtensionPhaseHandler>();
  readonly #beforeHooks: Array<(ctx: BeforePhaseHookContext) => void | Promise<void>> = [];
  readonly #afterHooks: Array<(ctx: AfterPhaseHookContext) => void | Promise<void>> = [];

  // ---- Extension loading --------------------------------------------------

  /** Load extensions synchronously (factory must not be async). */
  loadSync(factories: ExtensionFactory[]): void {
    for (const factory of factories) {
      const api = this.#createAPI();
      const result = factory(api);
      if (result && typeof (result as Promise<void>).then === "function") {
        throw new Error("loadSync does not support async factories. Use load() instead.");
      }
    }
  }

  /** Load extensions (supports async factories). */
  async load(factories: ExtensionFactory[]): Promise<void> {
    for (const factory of factories) {
      const api = this.#createAPI();
      await factory(api);
    }
  }

  // ---- Phase resolution ---------------------------------------------------

  getPhase(id: string): PhaseDefinition | undefined {
    return this.#phases.get(id);
  }

  getPhases(): PhaseDefinition[] {
    return [...this.#phases.values()];
  }

  getHandler(id: string): ExtensionPhaseHandler | undefined {
    return this.#handlers.get(id);
  }

  getHandlers(): ExtensionPhaseHandler[] {
    return [...this.#handlers.values()];
  }

  // ---- Hooks --------------------------------------------------------------

  get beforeHooks(): ReadonlyArray<(ctx: BeforePhaseHookContext) => void | Promise<void>> {
    return this.#beforeHooks;
  }

  get afterHooks(): ReadonlyArray<(ctx: AfterPhaseHookContext) => void | Promise<void>> {
    return this.#afterHooks;
  }

  // ---- Internal -----------------------------------------------------------

  #createAPI(): ExtensionAPI {
    return {
      registerPhase: (manifest, handler, run) => {
        const definition: PhaseDefinition = {
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          run,
        };
        this.#phases.set(manifest.id, definition);
        this.#handlers.set(manifest.id, handler);
      },
      beforePhase: (hook) => {
        this.#beforeHooks.push(hook);
      },
      afterPhase: (hook) => {
        this.#afterHooks.push(hook);
      },
    };
  }
}
