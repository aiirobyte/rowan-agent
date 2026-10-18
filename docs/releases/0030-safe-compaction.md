# Rowan Agent 0.26.0 — safe compaction and Phase-run tool permission checks

## Compaction summarizes its own history and never continues it

Compaction now replaces its instruction with one final user message instructing
the model to summarize the conversation above rather than continue it, not to
answer, carry out, or use Tools for any request in it, and to output only a
structured summary (goal and state, decisions with reasons, open requests left
unfinished, files and archive references, facts to keep). Providers that
maintain session state summarize that session without restarting or executing
prior unfinished requests.

## Phase-run Tools go through permission hooks

Tools executed by a Phase on its own, in `compact` and in any other `run()` Phase
that executes Tools directly, now go through the same Tool-call hook path as
ordinary Tool calls. Host `beforeToolCall` hooks and permission decisions are
always applied, and denials return as Tool errors without executing the tool.

## Removed: heuristic message compaction

`compactMessages`, `needsCompaction`, `CompactionOptions`, and `CompactionResult`
(`harness/context/compaction.ts`) are removed. The runtime never called them:
every compaction — `/compact`, automatic, and context-overflow recovery — runs
the `compact` Phase. Hosts that imported them should run `compactContext`.

## Packages

- `@rowan-agent/agent` 0.26.0
- Other package versions unchanged
