# @rowan-agent/models

## Overview

`@rowan-agent/models` provides the model registry, provider definitions, and token usage/cost calculation utilities for Rowan Agent. It serves as the central configuration layer for LLM model management.

## Features

- **Model Registry** — register, resolve, and query models by provider and ID
- **Provider Definitions** — structured provider metadata with base URLs and defaults
- **Cost Calculation** — compute token costs (input, output, cache read/write) per model
- **SSE Streaming** — server-sent event parsing for streaming model responses
- **Protocol Types** — shared TypeScript types for models, providers, and token usage

## Architecture

```
src/
├── index.ts           # Package entry point, re-exports all modules
├── protocol.ts        # Core types: Model, Provider, LlmTokenUsage, etc.
├── models.ts          # Model registry with register/resolve/query functions
├── models.generated.ts # Auto-generated model definitions for common providers
├── registry.ts        # Higher-level registry helpers
├── sse.ts             # SSE stream parser for model responses
└── providers/         # Provider-specific implementations
```

### Key Exports

| Export | Description |
|--------|-------------|
| `registerModel()` | Register a model in the global registry |
| `resolveModel()` | Look up by `"provider/model-id"` string |
| `getModel()` | Look up by provider + model ID |
| `getAllModels()` | List all registered models |
| `calculateCost()` | Compute token costs from usage data |

## Installation

```bash
npm install @rowan-agent/models
# or
bun add @rowan-agent/models
```

## Usage

### Register and Resolve Models

```ts
import { registerModel, resolveModel, getModel } from "@rowan-agent/models";

// Register a custom model
registerModel({
  provider: "openai",
  id: "gpt-4.1-mini",
  cost: { input: 0.40, output: 1.60, cacheRead: 0.10, cacheWrite: 0.40 },
});

// Resolve by combined string
const model = resolveModel("openai/gpt-4.1-mini");

// Or look up explicitly
const same = getModel("openai", "gpt-4.1-mini");
```

### Calculate Token Costs

```ts
import { calculateCost, resolveModel } from "@rowan-agent/models";

const model = resolveModel("anthropic/claude-sonnet-4-20250514")!;
const usage = {
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 2000,
  cacheWriteTokens: 100,
};

const cost = calculateCost(model, usage);
console.log(cost.total); // Total cost in USD
```

### Use Provider Definitions

```ts
import { getProviders, getModels } from "@rowan-agent/models";

// List all providers
const providers = getProviders();

// List models for a provider
const openaiModels = getModels("openai");
```

## Version

Current version: **0.4.6**
