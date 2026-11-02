import { expect, test } from "bun:test";
import {
  listApiProviders,
  registerBuiltInApiProviders,
  type OAuthCredential,
  type OAuthCredentialStore,
} from "../src";
import {
  createOpenAICodexResponsesStream,
  resolveOpenAICodexResponsesConfig,
} from "../src/providers/openai-responses";
import { ProviderError, type ProviderFetch } from "../src/providers/shared";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

class MemoryCredentialStore implements OAuthCredentialStore {
  readonly steps: string[] = [];

  constructor(public credential: OAuthCredential | undefined) {}

  async load(): Promise<OAuthCredential | undefined> {
    this.steps.push("load");
    return this.credential;
  }

  async save(_providerId: string, credential: OAuthCredential): Promise<void> {
    this.steps.push("save");
    this.credential = credential;
  }
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function codexAccessToken(accountId: string): string {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
  }));
  return `${header}.${payload}.signature`;
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const result: LlmStreamEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function completedResponses(): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "response.done", response: {} })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function request(): LlmRequest {
  return {
    model: { provider: "openai-codex-oauth", id: "gpt-5.5" },
    system: "You are Rowan.",
    messages: [{ role: "user", content: "hello" }],
    sessionId: "session-123",
    maxTokens: 4096,
    temperature: 0.2,
    thinkingLevel: "high",
    tools: [{
      name: "read",
      description: "Read a file.",
      parameters: { type: "object", properties: {} },
    }],
  };
}

test("openai-codex-responses is registered", () => {
  registerBuiltInApiProviders();
  expect(listApiProviders()).toContain("openai-codex-responses");
});

test("openai-codex-responses uses its default base URL", () => {
  const config = resolveOpenAICodexResponsesConfig({
    model: "gpt-5.5",
    auth: "openai-codex",
  });
  expect(config.baseUrl).toBe("https://chatgpt.com/backend-api");
});

test("openai-codex-responses sends the Codex URL, headers, and body contract", async () => {
  const credential: OAuthCredential = {
    flow: "openai-codex",
    access: codexAccessToken("acct-request"),
    refresh: "codex-refresh",
    expires: Date.now() + 60 * 60 * 1000,
    accountId: "acct-request",
  };
  const store = new MemoryCredentialStore(credential);
  let url = "";
  let headers = new Headers();
  let body: Record<string, unknown> = {};
  const fetchMock: ProviderFetch = async (input, init) => {
    url = String(input);
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return completedResponses();
  };
  const stream = createOpenAICodexResponsesStream({
    baseUrl: "https://chatgpt.com/backend-api",
    auth: "openai-codex",
    providerId: "openai-codex-oauth",
    model: "gpt-5.5",
    fetch: fetchMock,
  });

  await collect(stream(request(), { oauthCredentialStore: store }));

  expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
  expect(headers.get("authorization")).toBe(`Bearer ${credential.access}`);
  expect(headers.get("chatgpt-account-id")).toBe("acct-request");
  expect(headers.get("openai-beta")).toBe("responses=experimental");
  expect(headers.get("originator")).toBe("rowan");
  expect(headers.get("accept")).toBe("text/event-stream");
  expect(headers.get("session-id")).toBe("session-123");
  expect(headers.get("x-client-request-id")).toBe("session-123");
  expect(body).toMatchObject({
    model: "gpt-5.5",
    stream: true,
    store: false,
    instructions: "You are Rowan.",
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
    prompt_cache_key: "session-123",
    temperature: 0.2,
    reasoning: { effort: "high", summary: "auto" },
  });
  expect(Array.isArray(body.tools)).toBe(true);
  expect(body.max_output_tokens).toBeUndefined();
});

test("openai-codex-responses refreshes before the model request", async () => {
  const store = new MemoryCredentialStore({
    flow: "openai-codex",
    access: codexAccessToken("acct-old"),
    refresh: "old-refresh",
    expires: Date.now() - 1,
    accountId: "acct-old",
  });
  const calls: string[] = [];
  let modelHeaders = new Headers();
  const fetchMock: ProviderFetch = async (input, init) => {
    const url = String(input);
    if (url === "https://auth.openai.com/oauth/token") {
      calls.push("refresh");
      store.steps.push("token");
      return Response.json({
        access_token: codexAccessToken("acct-new"),
        refresh_token: "new-refresh",
        expires_in: 3600,
      });
    }
    calls.push("model");
    store.steps.push("model");
    modelHeaders = new Headers(init?.headers);
    return completedResponses();
  };
  const stream = createOpenAICodexResponsesStream({
    baseUrl: "https://chatgpt.com/backend-api",
    auth: "openai-codex",
    providerId: "openai-codex-oauth",
    model: "gpt-5.5",
    fetch: fetchMock,
  });

  await collect(stream(request(), { oauthCredentialStore: store }));

  expect(calls).toEqual(["refresh", "model"]);
  expect(store.steps).toEqual(["load", "token", "save", "model"]);
  expect(store.credential).toMatchObject({
    access: codexAccessToken("acct-new"),
    refresh: "new-refresh",
    accountId: "acct-new",
  });
  expect(modelHeaders.get("authorization")).toBe(`Bearer ${codexAccessToken("acct-new")}`);
  expect(modelHeaders.get("chatgpt-account-id")).toBe("acct-new");
});

test("openai-codex-responses rejects other auth modes", async () => {
  const stream = createOpenAICodexResponsesStream({
    baseUrl: "https://chatgpt.com/backend-api",
    auth: "xai",
    providerId: "openai-codex-oauth",
    model: "gpt-5.5",
    fetch: async () => completedResponses(),
  });

  await expect(collect(stream(request(), {}))).rejects.toMatchObject({
    code: "invalid_config",
  });
  await expect(collect(stream(request(), {}))).rejects.toBeInstanceOf(ProviderError);
});
