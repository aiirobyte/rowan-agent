import { expect, test } from "bun:test";
import {
  OAuthSignInRequiredError,
  createModelStream,
  parseAuthMode,
  registerApiProvider,
  refreshOAuthCredential,
  startOAuthLogin,
  unregisterApiProvider,
  type OAuthCredential,
  type OAuthCredentialStore,
} from "../src";
import { createAnthropicStream } from "../src/providers/anthropic";
import { createOpenAICompletionsStream } from "../src/providers/openai-completions";
import { createOpenAIResponsesStream } from "../src/providers/openai-responses";
import { resolveOpenAIResponsesConfig } from "../src/providers/openai-responses";
import { ProviderError, type ProviderFetch } from "../src/providers/shared";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

class MemoryCredentialStore implements OAuthCredentialStore {
  credential: OAuthCredential | undefined;
  readonly saves: OAuthCredential[] = [];
  readonly steps: string[] = [];

  constructor(credential?: OAuthCredential) {
    this.credential = credential;
  }

  async load(): Promise<OAuthCredential | undefined> {
    this.steps.push("load");
    return this.credential;
  }

  async save(_providerId: string, credential: OAuthCredential): Promise<void> {
    this.steps.push("save");
    this.credential = credential;
    this.saves.push(credential);
  }
}

function streamResponse(body = ""): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function completedResponses(): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const result: LlmStreamEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function request(provider = "test", model = "test-model"): LlmRequest {
  return {
    model: { provider, id: model },
    messages: [{ role: "user", content: "hello" }],
  };
}

function errorEvent(events: LlmStreamEvent[]): Error | undefined {
  const event = events.find((candidate) => candidate.type === "error");
  return event?.type === "error" ? event.error : undefined;
}

test("auth modes parse absent, keyless, and OAuth", () => {
  expect(parseAuthMode(undefined)).toBeUndefined();
  expect(parseAuthMode("none")).toBe("none");
  expect(parseAuthMode("oauth")).toBe("oauth");
  expect(() => parseAuthMode("xai")).toThrow("Invalid auth mode");
  expect(() => parseAuthMode("api-key")).toThrow("Invalid auth mode");
  expect(() => parseAuthMode(null)).toThrow("Invalid auth mode");
});

test("static API key stays required without an auth mode", () => {
  expect(() => resolveOpenAIResponsesConfig({ model: "test-model" })).toThrow("Missing API key");
  const keyless = resolveOpenAIResponsesConfig({ model: "test-model", auth: "none" });
  expect(keyless.apiKey).toBeUndefined();
  expect(keyless.auth).toBe("none");
});

test("createModelStream passes the credential store as a stream option", async () => {
  const store = new MemoryCredentialStore();
  let seen: OAuthCredentialStore | undefined;
  const protocol = "test-oauth-credential-store";
  registerApiProvider({
    protocol,
    stream: async function* (_model, _request, ctx) {
      seen = ctx.oauthCredentialStore;
      yield { type: "done", response: { content: "", stopReason: "end_turn" } };
    },
  });
  try {
    const stream = createModelStream({
      provider: "oauth-provider",
      id: "test-model",
      protocol,
      baseUrl: "https://provider.example/v1",
      auth: "oauth",
    }, { oauthCredentialStore: store });

    await collect(stream(request("oauth-provider", "test-model"), {}));

    expect(seen).toBe(store);
  } finally {
    unregisterApiProvider(protocol);
  }
});

test("keyless Responses carries no auth header", async () => {
  let headers: Headers | undefined;
  const fetchMock: ProviderFetch = async (_input, init) => {
    headers = new Headers(init?.headers);
    return streamResponse();
  };
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://provider.example/v1",
    auth: "none",
    model: "test-model",
    fetch: fetchMock,
  });

  await collect(stream(request(), {}));

  expect(headers?.has("authorization")).toBe(false);
  expect(headers?.has("x-api-key")).toBe(false);
});

test("keyless Completions carries no auth header", async () => {
  let headers: Headers | undefined;
  const fetchMock: ProviderFetch = async (_input, init) => {
    headers = new Headers(init?.headers);
    return streamResponse("data: [DONE]\n\n");
  };
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://provider.example/v1",
    auth: "none",
    model: "test-model",
    fetch: fetchMock,
  });

  await collect(stream(request(), {}));

  expect(headers?.has("authorization")).toBe(false);
  expect(headers?.has("x-api-key")).toBe(false);
});

test("keyless Anthropic carries no auth header", async () => {
  let headers: Headers | undefined;
  const fetchMock: ProviderFetch = async (_input, init) => {
    headers = new Headers(init?.headers);
    return streamResponse();
  };
  const stream = createAnthropicStream({
    baseUrl: "https://provider.example",
    auth: "none",
    model: "test-model",
    fetch: fetchMock,
  });

  await collect(stream(request("anthropic", "test-model"), {}));

  expect(headers?.has("authorization")).toBe(false);
  expect(headers?.has("x-api-key")).toBe(false);
  expect(headers?.get("anthropic-version")).toBe("2023-06-01");
});

test("OAuth auth resolves xAI flow and request decoration from the credential", async () => {
  const store = new MemoryCredentialStore({
    flow: "xai",
    access: "test-access",
    refresh: "test-refresh",
    expires: Date.now() + 60 * 60 * 1000,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
  let requestUrl = "";
  let headers = new Headers();
  const fetchMock: ProviderFetch = async (input, init) => {
    requestUrl = String(input);
    headers = new Headers(init?.headers);
    return completedResponses();
  };
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://ignored.example/v1",
    auth: "oauth",
    providerId: "xai-oauth",
    model: "grok-4.5",
    fetch: fetchMock,
  });

  await collect(stream(
    request("xai-oauth", "grok-4.5"),
    { oauthCredentialStore: store },
  ));

  expect(requestUrl).toBe("https://cli-chat-proxy.grok.com/v1/responses");
  expect(headers.get("authorization")).toBe("Bearer test-access");
  expect(headers.get("x-xai-token-auth")).toBeTruthy();
  expect(headers.get("x-grok-client-version")).toBe("0.2.95");
  expect(headers.get("x-grok-client-identifier")).toBe("rowan");
  expect(headers.get("x-grok-model-override")).toBe("grok-4.5");
  expect(store.saves).toEqual([]);
});

test("an expiring OAuth credential refreshes, saves, then authorizes the request", async () => {
  const store = new MemoryCredentialStore({
    flow: "xai",
    access: "old-access",
    refresh: "test-refresh",
    expires: Date.now() - 1,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
  let modelAuthorization = "";
  const fetchMock: ProviderFetch = async (input, init) => {
    const url = String(input);
    if (url === "https://auth.x.ai/oauth/token") {
      store.steps.push("token");
      return Response.json({
        access_token: "new-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      });
    }
    store.steps.push("model");
    modelAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    return completedResponses();
  };
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://ignored.example/v1",
    auth: "oauth",
    providerId: "xai-oauth",
    model: "grok-4.5",
    fetch: fetchMock,
  });

  await collect(stream(
    request("xai-oauth", "grok-4.5"),
    { oauthCredentialStore: store },
  ));

  expect(store.steps).toEqual(["load", "token", "save", "model"]);
  expect(store.saves).toHaveLength(1);
  expect(store.credential?.access).toBe("new-access");
  expect(store.credential?.refresh).toBe("rotated-refresh");
  expect(modelAuthorization).toBe("Bearer new-access");
});

test("concurrent requests share one refresh per provider id", async () => {
  const store = new MemoryCredentialStore({
    flow: "xai",
    access: "old-access",
    refresh: "test-refresh",
    expires: Date.now() - 1,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
  let refreshCalls = 0;
  let modelCalls = 0;
  let releaseRefresh: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const fetchMock: ProviderFetch = async (input) => {
    if (String(input) === "https://auth.x.ai/oauth/token") {
      refreshCalls += 1;
      await refreshGate;
      return Response.json({
        access_token: "shared-access",
        refresh_token: "shared-refresh",
        expires_in: 3600,
      });
    }
    modelCalls += 1;
    return completedResponses();
  };
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://ignored.example/v1",
    auth: "oauth",
    providerId: "xai-oauth",
    model: "grok-4.5",
    fetch: fetchMock,
  });
  const ctx = { oauthCredentialStore: store };

  const first = collect(stream(request("xai-oauth", "grok-4.5"), ctx));
  const second = collect(stream(request("xai-oauth", "grok-4.5"), ctx));
  await Promise.resolve();
  releaseRefresh();
  await Promise.all([first, second]);

  expect(refreshCalls).toBe(1);
  expect(store.saves).toHaveLength(1);
  expect(modelCalls).toBe(2);
});

test("a failed refresh fails the request without using the stale token", async () => {
  const store = new MemoryCredentialStore({
    flow: "xai",
    access: "stale-access",
    refresh: "test-refresh",
    expires: Date.now() - 1,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
  let modelCalls = 0;
  const fetchMock: ProviderFetch = async (input) => {
    if (String(input) === "https://auth.x.ai/oauth/token") {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    modelCalls += 1;
    return completedResponses();
  };
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://ignored.example/v1",
    auth: "oauth",
    providerId: "xai-oauth",
    model: "grok-4.5",
    fetch: fetchMock,
  });

  const events = await collect(stream(
    request("xai-oauth", "grok-4.5"),
    { oauthCredentialStore: store },
  ));
  const error = errorEvent(events);

  expect(modelCalls).toBe(0);
  expect(store.saves).toEqual([]);
  expect(error).toBeInstanceOf(ProviderError);
  expect(error).toMatchObject({ code: "oauth_refresh_failed" });
});

test("a missing credential raises the typed sign-in-required error", async () => {
  const store = new MemoryCredentialStore();
  const stream = createOpenAIResponsesStream({
    baseUrl: "https://ignored.example/v1",
    auth: "oauth",
    providerId: "xai-oauth",
    model: "grok-4.5",
    fetch: async () => completedResponses(),
  });

  const events = await collect(stream(
    request("xai-oauth", "grok-4.5"),
    { oauthCredentialStore: store },
  ));
  const error = errorEvent(events);

  expect(error).toBeInstanceOf(OAuthSignInRequiredError);
  expect(error).toMatchObject({
    code: "sign_in_required",
    details: { providerId: "xai-oauth" },
  });
});

test("xAI device login polls pending, slow_down, then succeeds", async () => {
  let now = 1_000_000;
  let tokenCalls = 0;
  const sleeps: number[] = [];
  const fetchMock: ProviderFetch = async (input, init) => {
    const url = String(input);
    if (url === "https://auth.x.ai/.well-known/openid-configuration") {
      return Response.json({
        device_authorization_endpoint: "https://auth.x.ai/oauth/device",
        token_endpoint: "https://auth.x.ai/oauth/token",
      });
    }
    if (url === "https://auth.x.ai/oauth/device") {
      return Response.json({
        device_code: "device-1",
        user_code: "ABCD-EFGH",
        verification_uri: "https://x.ai/device",
        expires_in: 30,
        interval: 1,
      });
    }
    tokenCalls += 1;
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(body.get("device_code")).toBe("device-1");
    if (tokenCalls === 1) return Response.json({ error: "authorization_pending" });
    if (tokenCalls === 2) return Response.json({ error: "slow_down" });
    return Response.json({
      access_token: "device-access",
      refresh_token: "device-refresh",
      expires_in: 3600,
    });
  };

  const session = await startOAuthLogin("xai", {
    fetch: fetchMock,
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  });
  const credential = await session.credential;

  expect(session.userCode).toBe("ABCD-EFGH");
  expect(session.verificationUri).toBe("https://x.ai/device");
  expect(session.expiresAt).toBe(1_030_000);
  expect(sleeps).toEqual([1000, 1000, 6000]);
  expect(credential).toMatchObject({
    flow: "xai",
    access: "device-access",
    refresh: "device-refresh",
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
});

test("xAI device login surfaces access_denied and expired_token", async () => {
  for (const errorCode of ["access_denied", "expired_token"] as const) {
    let now = 1_000_000;
    const fetchMock: ProviderFetch = async (input) => {
      const url = String(input);
      if (url === "https://auth.x.ai/.well-known/openid-configuration") {
        return Response.json({
          device_authorization_endpoint: "https://auth.x.ai/oauth/device",
          token_endpoint: "https://auth.x.ai/oauth/token",
        });
      }
      if (url === "https://auth.x.ai/oauth/device") {
        return Response.json({
          device_code: "device-1",
          user_code: "ABCD",
          verification_uri: "https://x.ai/device",
          expires_in: 30,
          interval: 1,
        });
      }
      return Response.json({ error: errorCode });
    };

    const session = await startOAuthLogin("xai", {
      fetch: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await expect(session.credential).rejects.toMatchObject({ code: errorCode });
  }
});

test("xAI discovery rejects untrusted authorization endpoints", async () => {
  const fetchMock: ProviderFetch = async () =>
    Response.json({
      device_authorization_endpoint: "https://evil.example/device",
      token_endpoint: "https://auth.x.ai/oauth/token",
    });

  await expect(startOAuthLogin("xai", { fetch: fetchMock })).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("xAI login cancel rejects the credential wait", async () => {
  const fetchMock: ProviderFetch = async (input) => {
    const url = String(input);
    if (url === "https://auth.x.ai/.well-known/openid-configuration") {
      return Response.json({
        device_authorization_endpoint: "https://auth.x.ai/oauth/device",
        token_endpoint: "https://auth.x.ai/oauth/token",
      });
    }
    return Response.json({
      device_code: "device-1",
      user_code: "ABCD",
      verification_uri: "https://x.ai/device",
      expires_in: 30,
      interval: 1,
    });
  };
  const session = await startOAuthLogin("xai", { fetch: fetchMock });

  session.cancel();

  await expect(session.credential).rejects.toMatchObject({ name: "AbortError" });
});

test("xAI refresh rotates the stored credential and keeps its token endpoint", async () => {
  let refreshBody = "";
  const fetchMock: ProviderFetch = async (_input, init) => {
    refreshBody = String(init?.body);
    return Response.json({
      access_token: "rotated-access",
      expires_in: 7200,
    });
  };
  const refreshed = await refreshOAuthCredential("xai", {
    flow: "xai",
    access: "test-access",
    refresh: "test-refresh",
    expires: 1,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  }, {
    fetch: fetchMock,
    now: () => 1_000_000,
  });

  expect(new URLSearchParams(refreshBody).get("grant_type")).toBe("refresh_token");
  expect(refreshed).toMatchObject({
    flow: "xai",
    access: "rotated-access",
    refresh: "test-refresh",
    expires: 8_200_000,
    tokenEndpoint: "https://auth.x.ai/oauth/token",
  });
});

