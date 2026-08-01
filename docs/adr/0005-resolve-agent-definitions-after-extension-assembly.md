---
status: accepted
---

# Resolve Agent Definitions after Extension assembly

Rowan will make `AgentDefinition` the declarative resource-selection contract for an Agent Configuration. A Definition contains required `name`, `description`, and authored `content`; optional `model`; optional Tool, Skill, Phase, and Extension name lists; and an optional entry Phase. Phase frontmatter reuses the same parser, model-reference parser, and name-list normalization before applying Phase-specific fields. Rowan does not interpret host business scope, working-directory policy, or resource authorization.

`AgentConfig` supplies the Definition and concrete Resource Candidates instead of a preselected `context`. At execution, Rowan resolves selected Extensions first, assembles their Tools and Phases with ordinary candidates, then applies the same name resolver to Agent and Phase selections. An omitted list inherits all candidates, `[]` selects none, and a present list selects matching names with set semantics. Missing names warn and are skipped. A missing entry Phase warns and falls back to Rowan `default`; ambiguous duplicate executable names and structurally invalid definitions remain fatal.

The Config Provider still owns immutable executable Configuration Snapshots, and a Run remains pinned to the snapshot that produced an Input Request. The change is deliberately breaking: `AgentConfig.context`, `AgentDefinitionContext`, and any parallel compatibility path are removed in `@rowan-agent/agent@0.8.5`.

This supersedes ADR-0003 only for the host resource-supply shape and its rejection of Agent-level selections. It preserves internal built-in and Extension assembly, collision checks, Runtime Tool adaptation, and the rule that Phase or policy narrowing cannot invent a Resource Candidate.

## Consequences

- Hosts can use one Definition/frontmatter language for Agents, Workflows, and Phases without Rowan learning host Workflow or Project concepts. Rowan exports its generic `parseFrontmatter` result so host-only fields can extend that document without a parallel parser.
- Extension-contributed resources can satisfy Definition references because final resolution occurs after Extension initialization.
- Missing authored references remain diagnosable without making an otherwise usable Agent Configuration unavailable.

## Rejected options

- Resolving Definition references in the host: rejected because code-defined Extension resources do not exist there.
- Keeping both Context and Definition configuration paths: rejected because two public composition models would drift.
- Treating missing references as fatal: rejected because catalogs may evolve independently and Rowan has a safe empty/default fallback.
