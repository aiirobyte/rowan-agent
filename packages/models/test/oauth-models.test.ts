import { expect, test } from "bun:test";
import {
  OAuthSignInRequiredError,
  listOAuthModels,
  type OAuthCredential,
  type OAuthCredentialStore,
} from "../src";
import type { ProviderFetch } from "../src/providers/shared";

class MemoryCredentialStore implements OAuthCredentialStore {
  readonly saves: OAuthCredential[] = [];

  constructor(public credential: OAuthCredential | undefined) {}

  async load(): Promise<OAuthCredential | undefined> {
    return this.credential;
  }

  async save(_providerId: string, credential: OAuthCredential): Promise<void> {
    this.credential = credential;
    this.saves.push(credential);
  }
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function token(payload: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: "none" }))}.${base64url(JSON.stringify(payload))}.signature`;
}

function future(): number {
  return Date.now() + 60 * 60 * 1000;
}

test("listOAuthModels maps Codex, xAI, and Copilot catalogs with flow headers", async () => {
  const cases: Array<{
    providerId: string;
    credential: OAuthCredential;
    expectedIds: string[];
    expectedUrl: string;
    expectedHeaders: Record<string, string | undefined>;
    response: unknown;
  }> = [
    {
      providerId: "codex-account",
      credential: {
        flow: "openai-codex",
        access: token({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" } }),
        refresh: "codex-refresh",
        expires: future(),
        accountId: "acct-123",
      },
      expectedIds: ["gpt-6.1-sol"],
      expectedUrl: "https://chatgpt.com/backend-api/codex/models?client_version=0.166.0",
      expectedHeaders: {
        authorization: `Bearer ${token({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-123" } })}`,
        "chatgpt-account-id": "acct-123",
        originator: "rowan",
        accept: "application/json",
      },
      response: {
        models: [
          { slug: "gpt-6.1-sol", display_name: "GPT-6.1-Sol", context_window: 272_000, visibility: "list" },
          { slug: "daybreak", display_name: "Daybreak", context_window: 372_000, visibility: "hide" },
          { slug: "internal", display_name: "Internal", context_window: 1_000 },
        ],
      },
    },
    {
      providerId: "xai-account",
      credential: {
        flow: "xai",
        access: "xai-access",
        refresh: "xai-refresh",
        expires: future(),
        tokenEndpoint: "https://auth.x.ai/oauth/token",
        idToken: token({ sub: "user-456", email: "person@example.com" }),
      },
      expectedIds: ["grok-4.7", "grok-4.6", "grok-build"],
      expectedUrl: "https://cli-chat-proxy.grok.com/v1/models",
      expectedHeaders: {
        authorization: "Bearer xai-access",
        "x-userid": "user-456",
        "x-email": "person@example.com",
        "x-grok-client-identifier": "rowan",
        "x-grok-client-mode": "interactive",
        accept: "application/json",
      },
      response: {
        data: [
          { id: "grok-4.7", name: "Grok 4.7", contextWindow: 256_000 },
          { model: "grok-4.6", context_window: 131_072 },
          { modelId: "grok-build" },
        ],
      },
    },
    {
      providerId: "copilot-account",
      credential: {
        flow: "github-copilot",
        access: "tid=test;proxy-ep=proxy.business.githubcopilot.com;exp=2000",
        refresh: "github-token",
        expires: future(),
      },
      expectedIds: ["gpt-4.1", "claude-sonnet-4"],
      expectedUrl: "https://api.business.githubcopilot.com/models",
      expectedHeaders: {
        authorization: "Bearer tid=test;proxy-ep=proxy.business.githubcopilot.com;exp=2000",
        "user-agent": "GitHubCopilotChat/0.35.0",
        "editor-plugin-version": "copilot-chat/0.35.0",
        "copilot-integration-id": "vscode-chat",
        accept: "application/json",
      },
      response: {
        data: [
          {
            id: "gpt-4.1",
            name: "GPT-4.1",
            model_picker_enabled: true,
            policy: { state: "enabled" },
            capabilities: { type: "chat", limits: { max_context_window_tokens: 128_000 } },
          },
          {
            id: "claude-sonnet-4",
            name: "Claude Sonnet 4",
            model_picker_enabled: true,
            capabilities: { type: "chat", limits: { max_prompt_tokens: 90_000 } },
          },
          {
            id: "hidden",
            model_picker_enabled: false,
            policy: { state: "enabled" },
            capabilities: { type: "chat" },
          },
          {
            id: "disabled",
            model_picker_enabled: true,
            policy: { state: "disabled" },
            capabilities: { type: "chat" },
          },
          {
            id: "completion-only",
            model_picker_enabled: true,
            capabilities: { type: "completion" },
          },
        ],
      },
    },
  ];

  for (const item of cases) {
    let requestUrl = "";
    let headers = new Headers();
    const fetchMock: ProviderFetch = async (input, init) => {
      requestUrl = String(input);
      headers = new Headers(init?.headers);
      return Response.json(item.response);
    };
    const models = await listOAuthModels(
      item.providerId,
      new MemoryCredentialStore(item.credential),
      { fetch: fetchMock },
    );

    expect(models.map((model) => model.id)).toEqual(item.expectedIds);
    expect(requestUrl).toBe(item.expectedUrl);
    for (const [name, value] of Object.entries(item.expectedHeaders)) {
      expect(headers.get(name)).toBe(value ?? null);
    }
  }
});

test("listOAuthModels requires a stored credential", async () => {
  await expect(listOAuthModels("missing", new MemoryCredentialStore(undefined)))
    .rejects.toBeInstanceOf(OAuthSignInRequiredError);
});

test("listOAuthModels refreshes and saves the credential before listing", async () => {
  const store = new MemoryCredentialStore({
    flow: "xai",
    access: "old-access",
    refresh: "refresh-token",
    expires: Date.now() - 1,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
  const calls: string[] = [];
  let listAuthorization = "";
  const fetchMock: ProviderFetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://auth.x.ai/oauth/token") {
      return Response.json({
        access_token: "new-access",
        refresh_token: "rotated-refresh",
        expires_in: 3_600,
      });
    }
    listAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({ data: [{ id: "grok-4.7", contextWindow: 256_000 }] });
  };

  const models = await listOAuthModels("xai-account", store, { fetch: fetchMock });

  expect(models).toEqual([{ id: "grok-4.7", contextWindow: 256_000 }]);
  expect(calls).toEqual([
    "https://auth.x.ai/oauth/token",
    "https://cli-chat-proxy.grok.com/v1/models",
  ]);
  expect(store.saves).toHaveLength(1);
  expect(store.credential).toMatchObject({
    access: "new-access",
    refresh: "rotated-refresh",
  });
  expect(listAuthorization).toBe("Bearer new-access");
});
