# Agent Context capability assembly issue slices

Status: Implemented locally; Runtime migration amended by issue slices 0003

Source: [PRD-0002](../prd/0002-agent-context-capabilities.md)

Decision: [ADR-0003](../adr/0003-assemble-agent-context-capabilities.md)

## Slice 1: Preserve the public interface

- Keep Tools, Skills, and Phases in Agent Configuration Context.
- Add no Agent Configuration capability allowlists.

## Slice 2: Assemble internal capabilities

- Lazily combine built-in, Context, and Extension capabilities.
- Reject Tool and Phase name collisions.
- Adapt Extension Tools into the executable Runtime path.

## Slice 3: Keep execution narrowing safe

- Keep Phase Tool and Skill restrictions local.
- Prevent hooks and Runtime Tool policy from broadening their input.
- Build and test generated public declarations before release.
