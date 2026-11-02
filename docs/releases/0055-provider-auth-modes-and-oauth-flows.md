# Rowan Agent 0.41.0 - provider auth modes and subscription OAuth

Provider configuration now distinguishes static API keys, keyless local
servers, and named subscription flows without storing credentials in the
configuration.

- **One auth field**: `auth?: "none" | "xai" | "github-copilot" |
  "openai-codex"` replaces the unused generic `oauth` object. Absent keeps the
  existing required `apiKey` and error; `"none"` sends no auth header.
- **Credential store seam**: hosts pass `OAuthCredentialStore` to
  `createModelStream(config, { oauthCredentialStore })`. Rowan loads before
  every HTTP attempt, refreshes within a 60-second skew, saves rotated
  credentials before use, and single-flights refresh per provider id.
- **Sign-in required**: a missing credential raises the typed
  `OAuthSignInRequiredError`; failed refreshes and saves fail the request
  without falling back to a stale token.
- **Login API**: `startOAuthLogin(flow, options)` exposes browser or device
  instructions, expiry, a credential promise, and cancellation.
  `refreshOAuthCredential` is the reusable refresh path.
- **OpenAI Codex**: browser PKCE S256 + state, a 127.0.0.1 loopback callback,
  code exchange, ChatGPT account-id extraction, refresh, and the dedicated
  `openai-codex-responses` protocol. Request headers use `originator: rowan`.
- **GitHub Copilot**: GitHub.com device flow, Copilot token exchange, derived
  API base URL, editor/integration headers, and refresh by re-exchanging the
  GitHub token. Revocation becomes `sign_in_required`.
- **xAI**: OIDC discovery, device polling, refresh, trusted endpoint checks,
  and `openai-responses` requests through the Grok CLI proxy with its required
  headers and `rowan` client identifier.

All three subscription flows ship in this release behind the same credential
store and login-session contracts.

The generic `oauth` object was unused, so there is no configuration migration.
An existing configuration that omits `auth` keeps its current API-key behavior;
keyless local servers can now remove their placeholder key.

## Packages

- `@rowan-agent/agent` 0.41.0
- `@rowan-agent/models` 0.14.0
