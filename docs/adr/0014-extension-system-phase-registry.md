# Extension System And Phase Registry

Status: Proposed

## Context

Rowan already has an `extensions` module and built-in phases are exposed as extension-style factories, but the loop still resolves phase handlers through the built-in singleton path. That means a custom `PhaseDefinition` can be added to `PhaseConfig`, while the matching handler, prompt builder, and outcome behavior do not travel with that config.

Pi's extension system uses three useful boundaries:

- `ExtensionFactory` receives a named host API parameter, `pi`.
- A loader executes factories into loaded `Extension` objects.
- A runner consumes `Extension[]` and resolves registered resources or emits lifecycle events.

Rowan should follow that shape, but keep the first implementation focused on phase registration and phase lifecycle. Commands, flags, UI, message renderers, and provider registration are out of scope for this ADR.

## Decision

Introduce a real `Extension` object and make phase execution resolve through a run-scoped phase registry built from loaded extensions.

Use `rowan` as the extension factory parameter name:

```typescript
export type ExtensionFactory = (rowan: ExtensionAPI) => void | Promise<void>;
```

Use `cwd` for the project root naming. Rowan resources live under `join(cwd, ".rowan")`.

`resolveWorkspacePaths()` should return root facts only:

```typescript
type WorkspacePaths = {
  mode: RuntimeMode;
  cwd: string;
  rowanDir: string;
};
```

It should not return resource-specific directories such as `runsDir`, `sessionsDir`, or `skillsDir`. Callers derive resources directly:

```typescript
const runsDir = join(paths.rowanDir, "runs");
const sessionsDir = join(paths.rowanDir, "sessions");
const skillsDir = join(paths.rowanDir, "skills");
const extensionsDir = join(paths.rowanDir, "extensions");
```

There is no compatibility fallback to the old `<workspace>/runs`, `<workspace>/sessions`, or `<workspace>/skills` layout.

## Extension Object

The first Rowan `Extension` shape should be small and intentionally expandable:

```typescript
type Extension = {
  path: string;
  resolvedPath: string;
  phases: Map<string, RegisteredPhase>;
  eventHandlers: Map<string, ExtensionHandler[]>;
};

type RegisteredPhase = {
  definition: PhaseDefinition;
  handler: ExtensionPhaseHandler;
  source: {
    extensionPath: string;
  };
};
```

`eventHandlers` exists to match Pi's object shape and to give lifecycle hooks a durable home, even if this ADR only needs phase-related events.

## Extension API

`ExtensionFactory` receives a `rowan` host API. Besides registration methods, the host API exposes small stable utilities so extensions do not import Rowan internals for ids, prompt-safe formatting, or common phase-input reads:

```typescript
type ExtensionAPI = {
  registerPhase(registration: PhaseRegistration): void;
  id: {
    create(prefix: string): string;
  };
  format: {
    json(value: unknown): string;
    tools(tools: PhaseInput["tools"]): SerializableTool[];
    skills(skills: PhaseInput["skills"]): unknown[];
  };
  input: {
    latestUserMessage(input: PhaseInput): string;
  };
  beforePhase(hook: (ctx: BeforePhaseHookContext) => void | Promise<void>): void;
  afterPhase(hook: (ctx: AfterPhaseHookContext) => void | Promise<void>): void;
};
```

This keeps extension modules dependent on the host contract instead of importing helpers from `loop/phases/config` or `harness/context/prompt-builder`.

## Loading

Extension loading has two entry points:

- `loadExtensionFromFactory(factory, cwd, extensionPath = "<inline>")`
- `discoverAndLoadExtensions(cwd)`

Discovery only scans:

```text
<cwd>/.rowan/extensions
```

Supported entries:

- `.rowan/extensions/*.ts`
- `.rowan/extensions/*.js`
- `.rowan/extensions/*/index.ts`
- `.rowan/extensions/*/index.js`
- `.rowan/extensions/*/package.json` with `rowan.extensions`

The loader should use `jiti` so `.ts` and `.js` extension modules can both be loaded in source and packaged runtimes.

No explicit extension paths are supported. Callers may explicitly pass `cwd`; they may not pass a separate extension path list.

Loading returns:

```typescript
type LoadExtensionsResult = {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
};
```

Agent and CLI composition should fail fast if `errors.length > 0`. Silent fallback would make extension failures look like phase behavior changes.

## Built-In Phases

Built-in phases are loaded as synthetic extensions:

```text
<builtin:chat>
<builtin:plan>
<builtin:execute>
<builtin:verify>
```

The default load order is:

```text
<builtin:*>
<cwd>/.rowan/extensions/*
```

Built-in `chat`, `plan`, `execute`, and `verify` use the same Rowan manifest shape as file extensions, but they are not npm packages. Each built-in phase directory uses `package.json`, not `manifest.json`, and the metadata contains only the Rowan phase manifest plus the extension entry:

```json
{
  "rowan": {
    "extensions": ["./index.ts"],
    "phase": {
      "id": "chat",
      "name": "Chat",
      "description": "Decide whether to answer directly or transition to another available phase."
    }
  }
}
```

The phase implementation reads its local Rowan metadata, registers through the same `ExtensionAPI.registerPhase()` path used by file extensions, and there should be no global built-in runner.

External extensions may not override built-in phase ids in this ADR. Duplicate non-built-in phase ids are load errors.

## Phase Registry

`ExtensionRunner` consumes loaded extensions and exposes a registry view:

```typescript
class ExtensionRunner {
  getPhase(id: string): PhaseDefinition | undefined;
  getPhaseHandler(id: string): ExtensionPhaseHandler | undefined;
  getPhases(): PhaseDefinition[];
  createPhaseConfig(input?: { entryPhaseId?: string }): PhaseConfig;
}
```

`PhaseConfig` becomes the immutable run snapshot:

```typescript
type PhaseConfig = {
  entryPhaseId: string;
  phases: PhaseDefinition[];
  phaseHandlers: Map<string, ExtensionPhaseHandler>;
};
```

The loop resolves both `PhaseDefinition` and `ExtensionPhaseHandler` from this config. It must not import or call a built-in singleton such as `getPhaseHandler(currentPhaseId)`.

This keeps the loop generic:

```typescript
const phase = resolvePhase(phaseConfig, currentPhaseId);
const handler = resolvePhaseHandler(phaseConfig, currentPhaseId);
```

If a phase calls `context.model.collect()`, its handler must provide `buildPrompt()`. If a phase never calls model collection, it can omit `buildPrompt()`.

## Phase Lifecycle

`ExtensionPhaseHandler` remains the phase-local specialization point:

```typescript
type ExtensionPhaseHandler = {
  conversationLimit?: number;
  prepare?(context: PhaseContext): void | Promise<void>;
  buildInput(context: PhaseContext, yield_?: unknown): PhaseInput | Promise<PhaseInput>;
  buildPrompt?(input: PhaseInput): string;
  finalize?(context: PhaseContext, output: PhaseOutput): void | Promise<void>;
  createOutcome?(output: PhaseOutput): Outcome;
};
```

Specialized behavior belongs in the phase handler, not in the main loop. The loop owns only:

- phase lookup
- visit limits
- lifecycle hook invocation
- input construction
- phase execution
- route validation
- `yield` handoff
- final outcome creation through the handler or generic default

## Pi Alignment

This design intentionally mirrors Pi where it helps Rowan's boundary:

- Pi's `ExtensionFactory = (pi: ExtensionAPI) => ...` maps to Rowan's `ExtensionFactory = (rowan: ExtensionAPI) => ...`.
- Pi's loader writes registrations into an `Extension` object; Rowan should do the same.
- Pi's runner consumes `Extension[]`; Rowan's runner should consume `Extension[]` rather than relying on module-level registries.
- Pi uses `cwd` for project-local discovery. Rowan should use `cwd` and derive `cwd/.rowan`.

This design intentionally does not copy Pi's global `agentDir`, configured extension path list, tools, commands, flags, shortcuts, UI context, provider registration, or message renderer surfaces.

## Testing

Add focused tests for:

- `resolveWorkspacePaths({ cwd })` returns `cwd` and `join(cwd, ".rowan")` only.
- `discoverAndLoadExtensions(cwd)` discovers supported entries under `.rowan/extensions`.
- invalid extension modules return load errors.
- factories load into `Extension` objects with registered phases.
- built-in phases load through the same extension path as file extensions.
- built-in phase directories use `package.json` metadata rather than `manifest.json`.
- duplicate external phase ids fail.
- external override of `chat`, `plan`, `execute`, or `verify` fails.
- a custom phase's handler, prompt builder, and outcome behavior are resolved from `PhaseConfig`.
- the main loop no longer depends on the built-in singleton handler registry.

## Consequences

The `.rowan` directory becomes Rowan's resource workspace. Existing root-level `runs`, `sessions`, and `skills` directories are no longer part of the active runtime layout.

Phase extension behavior becomes composable and testable because definitions, handlers, and prompt builders move together through the same registry snapshot.

The public extension foundation exists without committing Rowan to Pi's full plugin surface.
