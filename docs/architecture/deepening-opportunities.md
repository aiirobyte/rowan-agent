# Deepening Opportunities

Status: candidate review notes from the 2026-05-04 architecture pass. These are not implementation plans yet. Pick one candidate, run the grilling loop, then update `CONTEXT.md` or `docs/adr/` as decisions crystallize.

## 1. Agent Loop Phase Output Module

**Files**:
`packages/agent/src/loop.ts`, `packages/protocol/src/context.ts`, `packages/agent/src/phases/types.ts`, `packages/adapters/src/openai-compatible.ts`

**Problem**:
The Provider Adapter already normalizes route, plan, execute, and verify output, but `ModelStreamEvent` exposes that work as `structured_output: unknown`. The Agent loop then has to know phase parsing rules. This makes the Interface shallow: callers cross a typed-looking Seam but still need Implementation details about each phase.

**Solution**:
Move shared phase output contracts into `protocol` and let Provider Adapters emit typed phase output events. Keep provider JSON extraction and repair inside `adapters`; keep run ordering and effect publication inside `agent`.

**Benefits**:
Locality improves because provider-output bugs live in `adapters`. Leverage improves because `agent`, adapter tests, and future providers share one phase-output Interface. Tests can assert typed phase outputs without driving the whole Agent loop.

## 2. Runtime-Owned Tool Execution Module

**Files**:
`packages/agent/src/loop.ts`, `packages/runtime/src/tools.ts`, `packages/runtime/src/types.ts`, `packages/agent/src/phases/types.ts`

**Problem**:
The default tool path in the Agent loop performs lookup, schema compilation, argument validation, approval hook calls, execution, review hook calls, limit consumption, and event publication. The ToolRunner Seam is therefore only hypothetical for the default path. Deleting this code would spread the same complexity across local, MCP, plugin, and future policy paths.

**Solution**:
Move event-neutral tool execution to `runtime`. The runtime Module should resolve tools, validate args, invoke hooks, execute the tool, normalize the ToolResult, and return structured execution outcomes. The Agent loop should translate those outcomes into AgentEvents, Session messages, ExecutionTurns, and limit effects.

**Benefits**:
Locality improves because tool execution rules live in one Runtime glue Module. Leverage improves because local tools, MCP tools, plugins, and policy can reuse one Interface. Tests can cover unknown tools, invalid args, blocked calls, successful calls, and after-hook review without a full Agent run.

## 3. Agent Run Effects And ExecutionTurn Module

**Files**:
`packages/agent/src/loop.ts`, `packages/agent/src/recorder.ts`, `packages/store/src/types.ts`

**Problem**:
Phase transcript collection, `message_delta` publication, ExecutionTurn entries, and diagnostic scope handling are split across the Agent loop and recorder helpers. That keeps the pollution-prevention rule close to many call sites instead of one deep Module.

**Solution**:
Deepen `recorder.ts` into an Agent-owned phase effects Module. It should concentrate the conversion from phase activity into AgentEvents, event-only messages, Session conversation messages, and ExecutionTurns.

**Benefits**:
Locality improves because conversation, execution, and diagnostic scope rules are maintained in one place. Leverage improves because every phase uses one effect Interface. Tests can verify scope and persistence behavior through this Interface rather than by replaying the whole loop.

## 4. Context Projection And Rendering Module

**Files**:
`packages/context/src/prompt-builder.ts`, `packages/context/src/prompt.ts`, `packages/session/src/session.ts`, `packages/session/src/session-store.ts`

**Problem**:
Context Rendering currently depends on `AgentMessage.metadata.scope` and phase-specific slices of recent messages. This has already been valuable, but it is still a shallow Interface for DCP because prompt builders scan raw Session messages instead of consuming an explicit Projection.

**Solution**:
In v0.5.0, deepen `packages/context` into Projection and Rendering Modules. Projection should build a provider-independent intermediate context; Rendering should produce phase-specific model-readable context before provider wire conversion.

**Benefits**:
Locality improves because visibility and viewport rules live in `context`. Leverage improves because route, plan, execute, verify, replay, compaction, and future providers can share the same DCP Interface. Tests can snapshot what each phase sees.

## 5. CLI Composition Module

**Files**:
`packages/cli/src/cli.ts`

**Problem**:
The CLI Module currently combines argument parsing, config snapshot, Agent composition, logging, Session persistence, and interactive terminal flow. Its Interface is nearly as complex as its Implementation, and tests must often exercise the full command path.

**Solution**:
Split CLI runtime composition from terminal interaction. Keep `cli.ts` as the command entrypoint, but move config resolution, Agent construction, run persistence, and interactive prompt handling behind smaller stable Interfaces.

**Benefits**:
Locality improves because CLI behavior changes land in focused Modules. Leverage improves because future daemon, webhook, or UI entrypoints can reuse composition logic. Tests can target config and run orchestration without terminal plumbing.
