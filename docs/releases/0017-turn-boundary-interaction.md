# Rowan Agent 0.14.1 — turn-boundary Interactions are marked

A Run that ends a Phase without routing and waits for the next user message still exposes that wait as a `user_input` Interaction. It now carries `turnBoundary: true`, so a host that already has a message composer can tell it apart from a Phase question and skip the duplicate reply box. Phase-raised, tool-call, permission, elicitation and confirmation Interactions never carry the flag.

## Packages

- `@rowan-agent/agent` 0.14.1
- Other package versions unchanged
