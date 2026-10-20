# Rowan Agent 0.35.3 — The Phase execution limit counts only stuck executions

`maxAttempts` (default 16) counted every Phase execution since the last turn boundary. Each permission answer resumes the Phase as a new execution, so a Workflow that asked for several approvals ran out of attempts and paused with "The autonomous Phase execution limit (16) was reached" while it was making progress.

Now:

- A Phase execution that runs a Tool resets the count; `maxAttempts` bounds only consecutive executions that run no Tool, such as Phases routing in circles.
- Resuming a suspended Run (a person answered a permission or a question) starts a fresh window, as a turn boundary already did.

## Packages

- `@rowan-agent/agent` 0.35.3
