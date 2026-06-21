# Agent Model Configuration

## Context

Currently, the agent uses a single model/provider configured via environment variables (`ROWAN_OPENAI_API_KEY`, `ROWAN_MODEL`, `ROWAN_OPENAI_BASE_URL`). The CLI hardcodes `{ provider: "openai-compatible", name: config.model }` and creates a single `StreamFn` via `createOpenAICompletionsStream(config)`. All phases share this one model.

The user needs:
1. A config file supporting multiple providers and model IDs
2. Per-agent model selection (from config file)
3. Per-phase model override (PHASE.md frontmatter)

## Approach

Leverage the existing `createDispatchStream()` in `packages/models/src/registry.ts` — it already resolves models from the registry by `(provider, name)` and dispatches to the correct API provider. The `LlmRequest` already carries `model: LlmModelRef`. The key insight: **we don't need a new model resolution abstraction** — we just need to (a) register models from a config file, (b) use `createDispatchStream()` instead of the hardcoded OpenAI stream, and (c) set `request.model` per-phase.

## Config File

**Location:** `.rowan/config.yaml` (alongside existing `.rowan/phases/`, `.rowan/skills/`, etc.)

```yaml
# Default model — "primary" on a model entry also sets this
model:
  provider: openai
  name: gpt-4.1

providers:
  - name: openai
    baseUrl: https://api.openai.com/v1
    apiKey: ${ROWAN_OPENAI_API_KEY}
    api: openai-completions
    models:
      - id: gpt-4.1
        name: GPT-4.1
        primary: true              # ← marks this as the default agent model
        # All fields below are OPTIONAL with sensible defaults:
        # reasoning: false
        # input: [text]
        # contextWindow: 128000
        # maxTokens: 16384
        # cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      - id: gpt-4.1-mini
        name: GPT-4.1 Mini

  - name: anthropic
    baseUrl: https://api.anthropic.com
    apiKey: ${ANTHROPIC_API_KEY}
    api: anthropic-messages
    models:
      - id: claude-sonnet-4-20250514
        name: Claude Sonnet 4
        reasoning: true
        contextWindow: 200000
        maxTokens: 16000
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
```

**Model field defaults** (when omitted):
- `reasoning`: `false`
- `input`: `["text"]`
- `contextWindow`: `128000`
- `maxTokens`: `16384`
- `cost`: `{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`

**`primary: true`** on a model entry sets it as the default agent model (`config.model`). Resolution order:
1. CLI `--model` flag
2. Env `ROWAN_MODEL`
3. First model marked `primary: true` in config (by file order)
4. First model in config file (by parse order) — when no `primary` is specified
5. Top-level `model:` field (explicit override)

## Files to Change

### 1. `packages/agent/src/harness/phases/types.ts` — Add model field to Phase types

- Add `model?: string` to `PhaseFrontmatter` (e.g. `"anthropic/claude-sonnet-4-20250514"` or just `"gpt-4.1"`)
- Add `model?: LlmModelRef` to `Phase`

### 2. `packages/agent/src/harness/phases/loader.ts` — Parse model from frontmatter

- In `loadPhase()` (line 37): parse `frontmatter.model` into `LlmModelRef` and assign to `phase.model`
- Add helper `parseModelRef(input?: string): LlmModelRef | undefined`
  - `"gpt-4.1"` → `{ provider: "*", name: "gpt-4.1" }` (wildcard provider — dispatch stream resolves by model ID first, matches the first registered model with that ID)
  - `"anthropic/claude-sonnet-4-20250514"` → `{ provider: "anthropic", name: "claude-sonnet-4-20250514" }` (explicit provider+model)

### 3. `packages/agent/src/harness/config.ts` (NEW) — Config file loading + provider registration

- Types: `AgentConfigFile`, `ProviderConfigFromFile`, `ModelConfigFromFile`
- `ModelConfigFromFile` has all model fields optional with defaults:
  ```typescript
  type ModelConfigFromFile = {
    id: string;
    name?: string;          // defaults to id
    primary?: boolean;      // marks as default agent model
    reasoning?: boolean;    // default: true
    input?: ("text" | "image")[];  // default: ["text"]
    contextWindow?: number; // default: 128000
    maxTokens?: number;     // default: 16384
    cost?: Partial<ModelCost>; // default: all zeros
  };
  ```
- `loadConfigFile(workspace): Promise<AgentConfigFile | undefined>` — reads `.rowan/config.yaml`, returns undefined if missing
- `interpolateEnvVars(value: string): string` — replaces `${VAR}` with `process.env[VAR]`
- `resolveDefaultModel(config: AgentConfigFile): LlmModelRef | undefined` — finds the primary model or uses top-level `model:`
- `registerConfigModels(config: AgentConfigFile): void` — calls `registerModel()` for each model, applying defaults for omitted fields
- Uses `yaml` npm package for parsing (add to agent package.json)

### 4. `packages/agent/src/loop/runners.ts` — Per-phase model in phase execution

- In `createPhaseExecution.invokeModel()` (~line 804): change `{ model: config.model }` to `{ model: phase.model ?? config.model }`
- This is a **2-line change** — the dispatch stream already routes by `request.model`

### 5. `packages/cli/src/cli.ts` — Switch to dispatch stream + config file loading

- Import `createDispatchStream`, `registerBuiltInApiProviders` from `@rowan-agent/models`
- Import `loadConfigFile`, `registerConfigModels` from agent config module
- In `createConfiguredAgent()`:
  1. Load config file, register its providers/models
  2. If no config file, register env-var model as virtual provider (backward compat)
  3. Replace `createOpenAICompletionsStream(config)` with `createDispatchStream()`
  4. Resolve `model` from: CLI `--model` flag > env `ROWAN_MODEL` > config file `primary: true` model > config file top-level `model:` > first model in config

### 6. `packages/models/src/registry.ts` — Support wildcard provider in dispatch stream

- In `createDispatchStream()` (~line 130): when `request.model.provider` is `"*"` or empty, skip `getModel()` and go straight to `resolveModel(request.model.name)` which already searches all providers by model ID
- This enables PHASE.md `model: gpt-4.1` (without provider prefix) to resolve correctly

### 7. `packages/agent/src/extensions/types.ts` — Add model to PhaseRegistration

- Add `model?: string` to `PhaseRegistration` type

### 8. `packages/agent/src/extensions/runner.ts` — Copy model in adaptToPhase

- In `adaptToPhase()` (~line 442): add `model: parseModelRef(def.model)` to the returned Phase

### 9. `packages/agent/package.json` — Add yaml dependency

- Add `"yaml": "^2.7.0"` to dependencies

### 10. Export config module from agent index

- `packages/agent/src/index.ts`: export `loadConfigFile`, `registerConfigModels` types/functions

## Implementation Order

1. types.ts (Phase types) + loader.ts (parse model)
2. config.ts (NEW — config file loading)
3. registry.ts (wildcard provider in dispatch stream)
4. runners.ts (per-phase model in execution)
5. cli.ts (dispatch stream + config integration)
6. extensions/types.ts + runner.ts (extension model support)
7. agent package.json (yaml dep) + index.ts (exports)
8. Tests

## Verification

1. `bun run build` — type check passes
2. `bun test` — existing tests pass (backward compat)
3. Create `.rowan/config.yaml` with two providers
4. Create a PHASE.md with `model: anthropic/claude-sonnet-4-20250514`
5. Run `bun run rowan "hello"` — agent uses config file model
6. Run with phase routing — phase uses its own model
7. Run without config file — falls back to env vars (existing behavior)

## Skipped

- No `modelResolver` abstraction — `createDispatchStream()` already does this
- No per-phase `StreamFn` — the dispatch stream handles routing via `request.model`
- No config file validation schema (TypeBox) — keep it simple, fail on bad YAML with clear error
