# Rowan Agent Examples

Template configurations and extension/phase examples for getting started.

## Directory Structure

```
examples/
├── config.yaml                    # Multi-provider config template
├── durable-runtime.ts             # Durable AgentRuntime and Run lifecycle
├── README.md
├── extensions/
│   ├── logger.ts                  # Durable Run Event logging
│   ├── custom-tool.ts             # Register an LLM-callable tool
│   ├── phase-registration.ts      # Register a phase programmatically
│   └── package-extension/         # Package-based extension (with manifest)
│       ├── package.json           # rowan manifest → auto-discovery
│       └── index.ts               # Extension entry point
└── phases/
    ├── research/                  # Markdown-only phase + optional hooks
    │   ├── PHASE.md               # Phase definition (system prompt + metadata)
    │   └── index.ts               # Factory pattern: register hooks
    ├── plan/                      # Phase with model override
    │   └── PHASE.md
    ├── implement/                 # Minimal phase (no code)
    │   └── PHASE.md
    └── verify/                    # Code-driven phase (no LLM)
        ├── PHASE.md
        └── index.ts               # Run pattern: replace LLM with logic
```

## Quick Start

### Durable Runtime

`durable-runtime.ts` shows the public execution path:
`AgentRuntime.init()` → `runtime.createAgent()` → `runtime.start()` →
`run.wait()`. An `input_required` boundary is resumed with `run.respond()`.

### Config

Copy `config.yaml` to `.rowan/config.yaml` and set your API keys:

```bash
mkdir -p .rowan
cp examples/config.yaml .rowan/config.yaml
# Edit .rowan/config.yaml — replace ${VAR} references with your keys
```

### Extensions

Copy any extension file to `.rowan/extensions/`:

```bash
cp examples/extensions/logger.ts .rowan/extensions/
```

Package-based extensions go in a subdirectory:

```bash
cp -r examples/extensions/package-extension .rowan/extensions/
```

### Phases

Copy phase directories to `.rowan/phases/`:

```bash
cp -r examples/phases/research .rowan/phases/
cp -r examples/phases/plan .rowan/phases/
```
