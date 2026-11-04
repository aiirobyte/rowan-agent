# Rowan Agent 0.44.0 - Anthropic Messages honours OAuth request auth

An `anthropic-messages` model now uses the account host derived from its OAuth
credential, such as the GitHub Copilot proxy for Claude models, instead of the
catalog base URL. Requests still go to `/v1/messages`.

- **OAuth host**: the endpoint is resolved after request authentication, using
  `requestAuth.baseUrl` when present.
- **Version header**: every auth mode sends
  `anthropic-version: 2023-06-01`.
- **OAuth auth**: requests use the flow's bearer and provider headers and send
  no `x-api-key`.

## Packages

- `@rowan-agent/agent` 0.44.0
- `@rowan-agent/models` 0.16.0
