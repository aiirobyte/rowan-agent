# Agent Context capability assembly migration

`@rowan-agent/agent` 0.8.0 assembles built-in, Context, and Extension capabilities without Agent Options allowlists.

## Required changes

- Continue supplying host resources through `AgentContext.tools`, `skills`, and `phases`.
- Do not pass `allowedTools`, `allowedSkills`, or `allowedPhases`; they are not part of `AgentOptions`.
- Remove Tool and Phase name collisions, including collisions with Rowan `route` and `default` controls.
- Expect code-defined Extension Tools to execute through Tool Runtime.

Ordinary PHASE.md Tool and Skill restrictions remain Phase-local. Reconstruction reassembles the current Context and configured Extensions.
