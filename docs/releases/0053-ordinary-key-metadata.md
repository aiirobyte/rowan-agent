# Rowan Agent 0.39.1 - ordinary names in definition metadata

Frontmatter keys that older versions special-cased are now ordinary metadata.
There are no compatibility branches for names the current type does not define.

- **Agent Definitions**: `content`, `context`, `extensions`, and `entryPhase`
  receive no validation guard. In Markdown they follow the standard metadata
  rule and arrive in `AgentDefinition.metadata`.
- **Programmatic definitions**: those names are not part of `AgentDefinition`
  and are not rejected by a runtime guard.
- **Phase `skills`**: the legacy frontmatter selector is gone. A `skills:` key
  is ordinary Phase metadata, while a Phase's Skill set still comes only from
  direct child Skill Bundles.

No data migrations are required. The change only removes guards and no-ops for
old key names.

## Packages

- `@rowan-agent/agent` 0.39.1
- `@rowan-agent/models` 0.13.0
