# Rowan Agent 0.35.2 — Tool-call mistakes come back to the model

Three mistakes weaker models make each ended a turn or a Run instead of reaching the model as something to fix:

- A call to a Tool that does not exist (for example a Skill name used as a Tool) was dropped; with nothing left to run, the turn ended as if the model had finished and the Run waited for the person. It now runs and returns `Tool <name> is not available. Available tools: …`, and the turn goes on.
- Arguments JSON-encoded a second time reached the Tool as a string. They are decoded before the Tool runs.
- A Tool that threw a typebox `ParseError` for invalid arguments made the outcome indeterminate and failed the Run, and the error rendered as `[object Object]`. It now returns a failed result such as `Invalid arguments: / must have required properties edits`.

## Packages

- `@rowan-agent/agent` 0.35.2
