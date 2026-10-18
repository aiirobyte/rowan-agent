# Rowan Agent 0.27.0 — internal model loop for code Phases

## `execution.runInternalModelLoop`

Every code Phase's `execution` now has
`runInternalModelLoop(context, { prompt, tools?, maxToolRounds? })`. It lets a
Phase have the model work on the conversation without writing to it: Rowan
copies `context.messages`, appends `prompt` as the final user message
(`kind: "phase_input"`), and loops the model (`output: "internal"`) and Tool
calls on the copy, tagging its messages `phase_tool` with the running Phase's
name. It returns the final model result. Nothing it does enters the history.

- `tools`: the Tool names the loop may execute. Omitted: every Tool except
  `route`. `route` is never executed.
- `maxToolRounds`: at most this many Tool rounds (default 8).
- Allowed calls go through `executeTools`, so `before_tool_call` hooks and
  permission decisions apply as for any Tool call.

It is a method, not a package export, so Phases authored outside any
`node_modules` can use it with no import.

## The prompt cache is kept

The loop's first request starts exactly like the conversation's next request:
the same System Prompt, the same Tool definitions in the same order (`route`
included), and the same leading messages, with only the prompt appended. A
provider prefix cache therefore hits. `tools` is enforced when a call arrives,
not by removing definitions: a call to a Tool outside `tools`, or to `route`, is
not executed and returns the error result "Tool <name> is not available in
Phase <phase>" while the allowed calls of the same round run; a round with no
allowed call ends the loop, as compaction always did.

## Compaction uses it

`compact` calls `execution.runInternalModelLoop` with `tools: ["read", "bash"]`
and its summarize-only prompt. It now sends the conversation's full Tool list
instead of only `read` and `bash`, so compaction reuses the conversation's
prompt cache; calls to other Tools are refused as above.

## Packages

- `@rowan-agent/agent` 0.27.0
- Other package versions unchanged
