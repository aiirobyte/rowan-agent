import {
  createExtensionRunner,
  type ExtensionRunner,
} from "../extensions";
import type {
  LoadedExtension,
  RegisteredTool,
} from "../extensions";
import { loadExtensionsFromPath } from "../extensions/loader";
import type { Phase } from "../harness/phases/types";
import { createCorePhases } from "../harness/phases/default";
import { createRouteTool } from "../harness/tools/route-tool";
import { ResourceRegistry, type LoadInput, type ResourceDiagnostic } from "./resource-registry";

export type ExtensionContribution = LoadedExtension;
export type ExtensionLoadInput = LoadInput<ExtensionContribution>;

export type ExtensionActivationError = Readonly<{
  path: string;
  error: string;
}>;

export type ExtensionActivationResult = Readonly<{
  active: readonly string[];
  errors: readonly ExtensionActivationError[];
  revision?: string;
  registered?: readonly string[];
  skipped?: readonly ResourceDiagnostic[];
}>;

export type ExtensionLifetimeErrorCode = "extensions_frozen" | "extensions_closed";

export class ExtensionLifetimeError extends Error {
  readonly code: ExtensionLifetimeErrorCode;

  constructor(code: ExtensionLifetimeErrorCode, message: string) {
    super(message);
    this.name = "ExtensionLifetimeError";
    this.code = code;
  }
}

/** Runtime-global Extension activation and lifetime boundary. */
export class RuntimeExtensionLifetime {
  private readonly runner: ExtensionRunner;
  private frozen = false;
  private closed = false;

  constructor(options: { cwd?: string } = {}) {
    this.runner = createExtensionRunner(options);
  }

  async activate(extensions: readonly LoadedExtension[]): Promise<ExtensionActivationResult> {
    if (this.closed) throw new ExtensionLifetimeError("extensions_closed", "The Extension Runtime has been closed.");
    if (this.frozen) throw new ExtensionLifetimeError("extensions_frozen", "Extensions are frozen until Runtime restart.");
    const active: string[] = [];
    const errors: ExtensionActivationError[] = [];
    for (const extension of extensions) {
      try {
        await this.runner.loadExtensions([extension]);
        active.push(extension.name);
      } catch (error) {
        errors.push({
          path: extension.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.runner.bind();
    this.frozen = true;
    return { active, errors };
  }

  tools(): readonly RegisteredTool[] {
    return this.runner.getAllRegisteredTools();
  }

  phases(): readonly Phase[] {
    return this.runner.getPhases();
  }

  get extensionRunner(): ExtensionRunner {
    return this.runner;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.runner.close();
  }
}

/** Bootstrap-only Registry facade; its Extension method disappears after init. */
export class RuntimeBootstrapRegistry extends ResourceRegistry {
  private readonly extensionSourceId = "rowan.extensions";

  constructor(private readonly extensions: RuntimeExtensionLifetime = new RuntimeExtensionLifetime()) {
    super();
  }

  /** Install Rowan-owned implicit resources before any host source is read. */
  async ensureCoreResources(): Promise<void> {
    await this.replaceImplicit("tool", "rowan.core", [createRouteTool([]) as unknown as import("./contracts").Tool]);
    await this.replaceImplicit("phase", "rowan.core", createCorePhases());
  }

  async loadExtensions(input: readonly LoadedExtension[] | ExtensionLoadInput): Promise<ExtensionActivationResult> {
    const loaded = Array.isArray(input)
      ? { extensions: [...(input as readonly LoadedExtension[])], errors: [] as Array<{ path: string; error: string }> }
      : (() => {
          const descriptor = input as ExtensionLoadInput;
          return descriptor.directory
            ? loadExtensionsFromPath(descriptor.directory)
            : Promise.resolve({ extensions: [...(descriptor.values ?? [])], errors: [] as Array<{ path: string; error: string }> });
        })();
    const normalized = await loaded;
    const result = await this.extensions.activate(normalized.extensions);
    // Successful Extension contributions are implicit in every view. Keep one
    // source transaction so the ordinary registry still owns collision and
    // revision semantics, while the bootstrap lifetime owns activation/close.
    await this.replaceImplicit("tool", this.extensionSourceId, this.extensions.tools().map(adaptExtensionTool));
    await this.replaceImplicit("phase", this.extensionSourceId, [...this.extensions.phases()]);
    return {
      ...result,
      revision: `extensions:${Date.now()}`,
      registered: result.active,
      skipped: normalized.errors.map((error) => ({
        kind: "invalid",
        sourceId: "rowan.extensions",
        path: error.path,
        message: error.error,
      })),
    };
  }

  get extensionRunner(): import("../extensions").ExtensionRunner {
    return this.extensions.extensionRunner;
  }

  get extensionTools(): readonly RegisteredTool[] { return this.extensions.tools(); }

  get extensionPhases(): readonly Phase[] { return this.extensions.phases(); }

  async closeExtensions(): Promise<void> {
    await this.extensions.close();
  }
}

function adaptExtensionTool(input: RegisteredTool): import("./contracts").Tool {
  const definition = input.definition;
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters as never,
    execute: async (args, context, signal) => {
      const result = await definition.execute(args, signal);
      const content = JSON.parse(JSON.stringify(result.content));
      return result.isError
        ? { ok: false, content, error: "Extension Tool failed." }
        : { ok: true, content };
    },
  };
}
