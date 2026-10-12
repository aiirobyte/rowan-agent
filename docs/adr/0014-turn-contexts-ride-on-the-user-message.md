---
status: accepted
---

# Turn-scoped host Contexts ride on the user message

Host-supplied `additionalContexts` belong to one Run, and so to one user turn.
Examples are an explicit Skill read and a file or task the user referenced.
Until now they were rendered into the System Prompt next to the Definition's
Contexts. The System Prompt therefore changed on every turn that carried one
and changed back on the next. That invalidated Provider prompt caches twice,
and it made Providers that keep a live session (ACP agents) resend the whole
System Prompt.

## Decision

- Definition-selected `contexts` stay in the System Prompt.
- A Run's `additionalContexts` are stored on that Run's committed user
  `Message` as `contexts`, at the moment the store commits the message
  (`claimRun`).
- `buildModelRequest` renders a user message that carries `contexts` as a leading
  text part, `<turn_context>…</turn_context>`, using the same `<agent_context>`
  body as before, followed by the message's own content. The rendering is
  deterministic. A historic message therefore produces the same bytes on every
  later turn, and the request prefix stays stable.
- The message's visible `content` is unchanged. Hosts read `contexts` separately.

## Consequences

- The System Prompt only changes when the Definition or its Contexts change.
- Turn Contexts stay in history, so later turns still see what a referenced
  file or Skill contained. That is a deliberate change: before, the content was
  dropped after its turn.
- A Provider that wants structure, such as an ACP agent sending an embedded
  resource, can detect the leading `<turn_context>` part.
