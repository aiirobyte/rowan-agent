import { execFile } from "node:child_process";
import { createPhaseRegistry, type PhaseRegistry, type PhaseDefinition } from "../loop/phases/registry";
import { serializeSkills, serializeTools, latestUserInput } from "../harness/context/prompt-builder";
import { createId, createJson } from "../utils";
import type {
  ExecOptions,
  ExecResult,
  Extension,
  ExtensionAPI,
  ExtensionHandler,
  ExtensionPhaseHandler,
  ExtensionRuntime,
  RegisteredPhase,
} from "./types";

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options?.cwd ?? cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        timeout: options?.timeout,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && error.killed && options?.signal?.aborted) {
          reject(new Error("Command was aborted"));
          return;
        }
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : (error ? 1 : 0),
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );

    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      }, { once: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Extension Runtime
// ---------------------------------------------------------------------------

export function createExtensionRuntime(options?: { cwd?: string }): ExtensionRuntime {
  const cwd = options?.cwd ?? process.cwd();
  const state: { staleMessage?: string } = {};

  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };

  return {
    assertActive,
    invalidate: (message) => {
      state.staleMessage ??=
        message ?? "This extension context is stale after session replacement or reload.";
    },

    registerPhase(extension, registration) {
      assertActive();
      const handler: ExtensionPhaseHandler = {
        conversationLimit: registration.conversationLimit,
        prepare: registration.prepare,
        buildInput: registration.buildInput,
        buildPrompt: registration.buildPrompt,
        finalize: registration.finalize,
        createOutcome: registration.createOutcome,
      };
      const definition: PhaseDefinition = {
        id: registration.id,
        name: registration.name,
        description: registration.description,
        run: registration.run,
      };
      extension.phases.set(registration.id, { definition, handler, source: { extensionPath: extension.path } });
    },

    addEventHandler(extension, event, handler) {
      assertActive();
      const handlers = extension.eventHandlers.get(event) ?? [];
      handlers.push(handler);
      extension.eventHandlers.set(event, handlers);
    },

    exec(command, args, options) {
      assertActive();
      return execCommand(command, args, cwd, options);
    },

    id: { create: createId },
    format: { json: createJson.stringify, tools: serializeTools, skills: serializeSkills },
    input: { latestUserMessage: latestUserInput },
  };
}

// ---------------------------------------------------------------------------
// Extension API creation
// ---------------------------------------------------------------------------

export function createExtensionAPI(extension: Extension, runtime: ExtensionRuntime): ExtensionAPI {
  return {
    registerPhase(registration) { runtime.registerPhase(extension, registration); },
    on(event, handler) { runtime.addEventHandler(extension, event, handler); },
    beforePhase(hook) { runtime.addEventHandler(extension, "before_phase", hook as ExtensionHandler); },
    afterPhase(hook) { runtime.addEventHandler(extension, "after_phase", hook as ExtensionHandler); },
    exec(command, args, options) { return runtime.exec(command, args, options); },
    id: runtime.id,
    format: runtime.format,
    input: runtime.input,
    runtime,
  };
}

// ---------------------------------------------------------------------------
// Extension Runner
// ---------------------------------------------------------------------------

export type ExtensionRunnerOptions = {
  entryPhaseId?: string;
  validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean;
};

export class ExtensionRunner {
  private readonly validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean;

  constructor(
    private readonly extensions: Extension[],
    options?: { validatePhaseOverride?: (phaseId: string, extensionPath: string) => boolean },
  ) {
    this.validatePhaseOverride = options?.validatePhaseOverride;
  }

  getPhase(id: string): PhaseDefinition | undefined {
    return this.getRegisteredPhase(id)?.definition;
  }

  getPhases(): PhaseDefinition[] {
    return [...this.collectRegisteredPhases().values()].map((p) => p.definition);
  }

  getPhaseHandler(id: string): ExtensionPhaseHandler | undefined {
    return this.getRegisteredPhase(id)?.handler;
  }

  createPhaseRegistry(input: { entryPhaseId?: string } = {}): PhaseRegistry {
    const registered = this.collectRegisteredPhases();
    return createPhaseRegistry({
      entryPhaseId: input.entryPhaseId,
      phases: [...registered.values()].map((p) => p.definition),
      phaseHandlers: new Map([...registered].map(([id, p]) => [id, p.handler])),
    });
  }

  private getRegisteredPhase(id: string): RegisteredPhase | undefined {
    return this.collectRegisteredPhases().get(id);
  }

  private collectRegisteredPhases(): Map<string, RegisteredPhase> {
    const phases = new Map<string, RegisteredPhase>();
    for (const extension of this.extensions) {
      for (const [id, phase] of extension.phases) {
        if (this.validatePhaseOverride?.(id, phase.source.extensionPath)) {
          throw new Error(`External extension cannot override built-in phase: ${id}`);
        }
        if (phases.has(id)) {
          throw new Error(`Duplicate phase id: ${id}`);
        }
        phases.set(id, phase);
      }
    }
    return phases;
  }
}
