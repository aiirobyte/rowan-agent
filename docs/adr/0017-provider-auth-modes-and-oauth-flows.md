---
status: accepted
date: 2026-11-03
---

# Provider auth modes and OAuth flows

Model providers need three authentication shapes without making the serializable
configuration carry credentials, flow names, or executable values:

- absent: the static API key used today;
- `"none"`: no auth header, for local servers;
- `"oauth"`: the subscription credential stored for the provider id.

The OAuth credential file, login UI, and processes stay with the host. Rowan
owns the flow, refresh, and request mapping.

## Decision

### One serializable auth field

`Model`, `ModelConfig`, `ProviderConfig`, and the provider stream config gain
one optional `auth` field:

```ts
type OAuthFlow = "xai" | "github-copilot" | "openai-codex";
type AuthMode = "none" | "oauth";
```

- An absent `auth` keeps today's API-key behavior. Missing `apiKey` raises the
  existing error.
- `"none"` omits both `Authorization` and `x-api-key` on the general-purpose
  protocols. An API key is optional.
- `"oauth"` selects the credential keyed by the provider id already supplied
  by `ModelConfig.provider`, `Model.provider`, or `ProviderConfig.id`. The
  credential's own `flow` selects headers, base URL, refresh, and protocol
  validation; configuration never names the flow.

Unknown values are rejected at configuration boundaries. The field contains
no tokens, refresh tokens, flow names, functions, or credential-store
reference.

### Credential store is a stream option

The host supplies:

```ts
interface OAuthCredentialStore {
  load(providerId: string): Promise<OAuthCredential | undefined>;
  save(providerId: string, credential: OAuthCredential): Promise<void>;
}
```

It is passed to `createModelStream(config, { oauthCredentialStore })` or on
`ProviderCallContext`. It is never part of a model/provider configuration or a
Configuration Snapshot.

Before each HTTP attempt, an `auth: "oauth"` stream loads the provider's
credential and reads its `flow`. A credential inside the 60-second expiry skew
is refreshed, saved, and only then used. Refresh is single-flight per store and
provider id. A failed load, refresh, or save fails the request; a stale token
is never used. A missing credential raises `OAuthSignInRequiredError`
(`code: "sign_in_required"`) without inventing a flow.

### Login session API

`startOAuthLogin(flow, options)` resolves after the flow has enough information
to present:

```ts
type OAuthLoginSession = {
  url?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt: number;
  credential: Promise<OAuthCredential>;
  cancel(): void;
};
```

Browser flows set `url`. Device flows set `userCode` and `verificationUri`.
The credential promise resolves only after a complete refreshable credential
exists; cancellation rejects it. `refreshOAuthCredential(flow, credential)` is
the same refresh path used by request auth.

The same shape serves all three flows.

### OAuth model listing

`listOAuthModels(providerId, store, options?)` returns the models the signed-in
account can use:

```ts
type OAuthModel = {
  id: string;
  name?: string;
  contextWindow?: number;
};
```

It loads the credential, refreshes and saves it through the same path as a
request, then dispatches on `credential.flow`:

- `openai-codex`: `GET /codex/models?client_version=<Codex CLI version>` on the
  ChatGPT backend. Only models whose catalog `visibility` is `list` are
  returned.
- `xai`: `GET https://cli-chat-proxy.grok.com/v1/models` with the Grok CLI
  headers. `x-userid` and `x-email` come from the stored ID token when present
  and are omitted otherwise.
- `github-copilot`: `GET <token-derived Copilot base URL>/models` with the
  Copilot editor headers. The result keeps picker-enabled chat models whose
  policy is not disabled.

Callers supply the same optional `fetch` and `signal` seams as provider
requests. Listing performs no live call unless the host invokes it.

### OpenAI Codex flow

- Login uses PKCE S256 and `state`, the OpenAI Codex client id, scopes, redirect
  URI, and authorize parameters from the protocol reference. The session
  returns the authorize URL.
- A loopback listener binds `127.0.0.1:1455`, serves
  `http://localhost:1455/auth/callback`, rejects a wrong `state` without
  completing the session, and closes on callback completion, cancellation, or
  a 10-minute login expiry. A port already in use raises
  `OAuthLoginError("port_in_use")`.
- Exchange and refresh produce access/refresh tokens and expiry. The ChatGPT
  account id is read from the access token's
  `https://api.openai.com/auth` claim.
- `openai-codex-responses` is a variant of the Responses stream. It posts to
  `<baseUrl>/codex/responses` (default
  `https://chatgpt.com/backend-api`), requires `auth: "oauth"` plus a stored
  credential whose flow is `openai-codex`, and sends the Codex account, beta,
  originator, session, streaming, stateless `store: false`, instructions,
  encrypted reasoning, verbosity, parallel tool, and prompt-cache contract. It
  omits the standard Responses output-token limit and rejects any other stored
  flow with `invalid_config`.

### GitHub Copilot flow

- Login uses GitHub.com device authorization with the Copilot client id and
  `read:user` scope. Polling handles `authorization_pending`, `slow_down`
  (+5 seconds), `access_denied`, and `expired_token`.
- The GitHub token is exchanged at the Copilot token endpoint. `access` is the
  Copilot token, `refresh` is the GitHub token, and `expires` is the Copilot
  token expiry. Refresh re-exchanges the GitHub token; a revoked token becomes
  the typed sign-in-required error.
- Request auth sends Bearer Copilot auth and the Copilot editor/integration
  headers. The API base URL is derived from the token's `proxy-ep`, with
  `proxy.` rewritten to `api.`, and is surfaced through
  `OAuthRequestAuth.baseUrl`. Both built-in OpenAI protocols use that value for
  the request endpoint.

### xAI flow

- Discovery is fixed at
  `https://auth.x.ai/.well-known/openid-configuration`. Discovered device and
  token endpoints must be HTTPS on exactly `auth.x.ai`, with no port,
  credentials, or fragment. Verification URLs must be HTTPS on `x.ai` or a
  subdomain.
- Device authorization uses the xAI client id and scopes from the protocol
  reference. Polling handles `authorization_pending`, `slow_down` (+5 seconds),
  `access_denied`, and `expired_token`.
- The discovered token endpoint is retained on the credential. Refresh sends
  `grant_type=refresh_token` to that trusted endpoint and preserves the old
  refresh token when the response omits a new one.
- Model requests use `openai-responses` at
  `https://cli-chat-proxy.grok.com/v1`, Bearer access auth, the Grok CLI
  version/model-override headers with identifier `rowan`, and Rowan's required
  CLI marker.
  The marker is source-owned and never enters configuration, logs, errors, or
  documentation values.

## Consequences

- Hosts can persist OAuth credentials in their existing owner-only store while
  Rowan keeps protocol-specific refresh and request mapping.
- Keyless local providers need no fake API key.
- Codex, Copilot, and xAI share one login, refresh, and credential-store
  contract while keeping their protocol-specific request shapes.
- A credential-store failure cannot silently downgrade to an expired token.
