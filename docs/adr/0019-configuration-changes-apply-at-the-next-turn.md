---
status: accepted
---

# Configuration changes apply at the next user turn, beside the turn's message

A Turn resolves its Agent Configuration when its user input is committed, and
everything inside that Turn keeps the resulting Configuration Snapshot. A host
change made mid-Turn therefore reaches only the next Turn. That Turn renders
the cached prefix from its Prefix Configuration and announces the change beside
its user message, so rebuilding the System Prompt does not invalidate provider
prompt caches.

Leaf lets a Visitor switch a Session's model mid-conversation (Leaf ADR-0005).
The configuration, Resource Sources, Phases and Tools can all change in the same
way.

Constraints from the owner:

- The mechanism is general, not model-only.
- There is no host callback. Hosts make changes the way they already do:
  - `updateAgentConfig`;
  - `loadTools`, `loadSkills`, `loadPhases` and `loadAgents`;
  - `unload`.
- A change is picked up at the next user turn. A turn in progress finishes on its
  configuration.
- The cached prefix is never rewritten:
  - a change rides with the turn's message;
  - only compaction rebuilds the System Prompt from the latest configuration.

## Decision

### Turn

A **Turn** is one user turn. It begins when the user's input for it is
committed, which happens in one of three ways:

- a new Run's user message, committed when the Run is claimed;
- an Agent Input reply to a Run that waits at a turn boundary (a `user_input`
  Interaction with `turnBoundary: true`);
- an answer to such an Interaction through `respondInteraction`.

The turn ends at the next input boundary or when the Run ends. Everything inside
the turn runs on the turn's configuration, including:

- model rounds and retries;
- Tool calls, and permission Interactions;
- Phase routes and parallel Phases.

The turn's configuration is fixed when its message is committed. The Run is
pinned to that Configuration Snapshot, and resume and recovery reuse it.

### Context Configuration (the value)

The Model Context carries one value, `configuration: { token, digest }`. It
names the configuration that the context currently reflects.

- `digest` is a canonical JSON fingerprint of what the model has been told:
  - the instructions, meaning the Definition prompt plus the Definition Contexts;
  - the prompt metadata of each Tool, Skill and Phase.

  It excludes the model, which is a request parameter and needs no telling.
- `token` is the Configuration Snapshot that the digest describes.

The value lives on the Model Context's messages, as a structured field next to
`contexts`:

- The message that opens a turn carries the field when the turn either:
  - establishes the prefix (`prefix: true`); or
  - announces a change (`notice`).
- After compaction, the context summary message carries the field, taken from
  the compaction record.
- The current value is the field on the last message in the Model Context that
  carries one.

The model never sees the token or the digest. It sees only the notice text.

### At the start of each turn

1. Resolve the latest configuration.
   - For a new Run, this already happens at claim.
   - For a reply or an answer, it happens when that message is committed.
2. Compute its digest.
3. If the digest equals the Context's digest, the turn message carries no notice,
   and nothing is added to the request.
4. Otherwise, the turn message stores a **Configuration Notice**: rendered text,
   stored as is so that its bytes never change. The notice:
   - is sent as a leading `<configuration_update>` text part of that message;
   - advances the Context's value.

If the previous snapshot cannot be resolved, the turn rebuilds the prefix from
the latest configuration instead (`prefix: true`, no notice).

### What reaches the model

- **Model:** the turn's snapshot supplies the request's `model` and the stream
  that serves it.
- **System Prompt:** rendered from the **Prefix Configuration**, filtered by
  Phase as it is today. It covers the instructions, the Tool snippets and
  guidelines, the Skills block, and the Phase and route-Tool guidelines.
- **`tools` parameter:** the Tools of the prefix, followed by the added Tools.
  - Each Tool keeps its position in the prefix order.
  - A changed Tool uses its new definition.
  - A removed Tool keeps its definition until compaction. If the model calls it,
    the call returns "Tool `x` was removed".
  - Added Tools go at the end.
- **Notice:** it lists the changes in this order:
  - Tools added, Tools removed, and changed Tool snippets;
  - Skills added and removed;
  - Phases added and removed;
  - the new instructions, in full.

  Example: "Tool `x` was removed; Tool `y` was added: …".
- **Phases:** routing and the route Tool's catalog follow the turn's Phases.
  - When a waiting Run resumes, Rowan injects the current Phase's prompt again
    from the turn's Phases.
  - If that Phase was removed, the turn starts in the new configuration's entry
    Phase instead, or in the Phase-less entry Loop. Its continuation is dropped.
- **Earlier messages:** byte-identical. The value field and metadata are never
  rendered.

### Compaction

Compaction sets the Prefix Configuration to the snapshot of the Run that
compacts:

- A Control compaction Run is claimed with the latest configuration, so the
  prefix becomes the latest configuration and resources.
- An in-Run overflow compaction uses the current turn's snapshot.

Its record stores `configuration`. After compaction:

- the System Prompt and the `tools` parameter are rebuilt from the new prefix;
- removed Tools leave the request;
- the notices that the summary covers leave the Model Context.

### Other Runs

- **A Control Phase Run with no input** adds no turn message and announces
  nothing. It runs on the configuration it claims.
- **A Control Phase Run whose Phase is missing** fails as it does today; it does
  not restart in the entry Phase.
- **Child Agents** each follow their own configuration. A parent's change does
  not reach its children.

### Durability and observation

Nothing needs a new SQLite column or a new event kind.

- **Messages** carry the value and the notice. Hosts see both on
  `message_committed`.
- **The compaction record** carries the prefix after compaction.
- **`run.pinnedConfigToken`** carries the turn's snapshot. A reply or answer that
  starts a new turn re-pins its waiting Run.
- **Assistant messages** keep recording `model`.
- **Session files:**
  - a user message entry includes the notice as its leading text part, which is
    what the model saw;
  - a model switch keeps writing `model_change`.

### Host API

There is no new API. Leaf switches a Session's model with
`updateAgentConfig(agentId, { ...config, model }, { idempotencyKey })`. The
switch applies from the Visitor's next message. Leaf ADR-0005's "from the next
model call" should change to "from the next message".

## Considered options

- **Host callback per model call (`modelForCall`).** Rejected:
  - it covers only the model;
  - it is a host callback;
  - it runs on every call.
- **Turn = one model round.** It would apply changes mid-Run, but it would have
  to swap the model, Tools and Phases inside the Phase loop. Not chosen.
- **Rebuild the System Prompt when the configuration changes.** Rejected: it
  breaks provider prompt caches, and it makes live-session Providers resend the
  prompt (ADR-0014).
- **Drop removed Tools from the `tools` parameter at once.** Rejected: it costs a
  cache miss for a removal. Removed Tools wait for compaction instead.
