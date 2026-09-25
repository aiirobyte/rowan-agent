# Rowan Agent 0.10.0 — one Configuration shape: the Resource View

This release removes the concrete candidate configuration. `AgentConfig`, its
`resources` bag, `AgentResources`, `AgentConfigRequest`, `isAgentConfiguration`
and `assertAgentConfig` are gone. `AgentConfiguration` — the request that names
a Definition and a `resourceView` — is the only shape the public seam accepts,
and the Runtime resolves it into the `ConfigurationSnapshot` that execution
reads.

Status: staged and package-built locally; npm publication requires explicit
authorization for the external registry mutation.

## Runtime contract

- `createAgent()` and `updateAgentConfig()` accept `AgentConfiguration` only,
  and `resourceView` is required.
- A Config Provider stores and resolves `AgentConfiguration |
  ConfigurationSnapshot`. A stored snapshot is frozen in place and returned as
  it stands; a request is resolved against the current sources.
- `materializeConfigurationSnapshot` is gone; `isConfigurationSnapshot`
  distinguishes a stored snapshot from a request.
- Extension contributions have exactly one source: `loadExtensions` registers
  an Extension's Tools and Phases under the implicit `rowan.extensions` source,
  which every view includes. The assembly no longer appends the runner's own
  copy, so the Runtime holds no candidate-collision rule of its own — ambiguous
  names are rejected where a source or a view resolves, and `rowan.core`
  reserves the core Phase and Tool names.
- `BeforeToolCall` and `AfterToolCall` are the only Tool hooks. The per-Agent
  config fields that mirrored them, which no host supplied, are gone.

## Compatibility

Breaking for every embedding host. What a host must change:

1. Register what it used to pass: `runtime.loadAgents`, `loadSkills`,
   `loadPhases` and `loadTools` under stable `sourceId` values, then name those
   sources in the request's `resourceView`.
2. Move Contexts out of `resources.contexts` and onto the request as `contexts`
   (Host-owned Contexts stay in `additionalContexts`).
3. Move the entry Phase selection off the registry and onto the Definition:
   `definition.phases = { entryPhaseId, phaseIds }`. Phases the Definition does
   not select are not available to the Agent.
4. A Definition is resolved by name from a selected source, so a Definition a
   host used to pass inline is registered like every other resource.
5. A Config Provider must pass `AgentConfiguration | ConfigurationSnapshot`
   through and must not re-resolve a stored snapshot.
6. `@rowan-agent/cli` is migrated in this release and is the worked example.

Behaviour that does not change: the Runtime supplies the core
`read`/`bash`/`edit`/`write`/`route` Tools, `rowan.core` stays implicit in every
view, and a Run remains pinned to the snapshot that produced it.
