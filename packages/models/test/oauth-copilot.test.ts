import { expect, test } from "bun:test";
import {
  OAuthSignInRequiredError,
  refreshOAuthCredential,
  startOAuthLogin,
  type OAuthCredential,
  type OAuthCredentialStore,
} from "../src";
import { createOpenAICompletionsStream } from "../src/providers/openai-completions";
import { createOpenAIResponsesStream } from "../src/providers/openai-responses";
import type { ProviderFetch } from "../src/providers/shared";
import type { LlmRequest, LlmStreamEvent } from "../src/protocol";

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

async function collect(events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const result: LlmStreamEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function request(provider = "github-copilot", model = "gpt-4.1"): LlmRequest {
  return {
    model: { provider, id: model },
    messages: [{ role: "user", content: "hello" }],
  };
}

function errorEvent(events: LlmStreamEvent[]): Error | undefined {
  const event = events.find((candidate) => candidate.type === "error");
  return event?.type === "error" ? event.error : undefined;
}

test("GitHub Copilot device login polls, exchanges, and returns a Copilot credential", async () => {
  let now = 1_000_000;
  let polls = 0;
  const sleeps: number[] = [];
  let exchangeHeaders = new Headers();
  const fetchMock: ProviderFetch = async (input, init) => {
    const url = String(input);
    if (url === "https://github.com/login/device/code") {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("scope")).toBe("read:user");
      expect(body.get("client_id")).toBe("Iv1.b507a08c87ecfe98");
      return Response.json({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 30,
        interval: 1,
      });
    }
    if (url === "https://github.com/login/oauth/access_token") {
      polls += 1;
      if (polls === 1) return Response.json({ error: "authorization_pending" });
      if (polls === 2) return Response.json({ error: "slow_down" });
      return Response.json({ access_token: "github-token" });
    }
    if (url === "https://api.github.com/copilot_internal/v2/token") {
      exchangeHeaders = new Headers(init?.headers);
      return Response.json({
        token: "tid=test;proxy-ep=proxy.individual.githubcopilot.com;exp=2000",
        expires_at: 1_000_100,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const session = await startOAuthLogin("github-copilot", {
    fetch: fetchMock,
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  });
  const credential = await session.credential;

  expect(session.userCode).toBe("ABCD-EFGH");
  expect(session.verificationUri).toBe("https://github.com/login/device");
  expect(session.expiresAt).toBe(1_030_000);
  expect(sleeps).toEqual([1000, 6000]);
  expect(exchangeHeaders.get("authorization")).toBe("Bearer github-token");
  expect(exchangeHeaders.get("editor-version")).toBe("vscode/1.107.0");
  expect(exchangeHeaders.get("copilot-integration-id")).toBe("vscode-chat");
  expect(credential).toEqual({
    flow: "github-copilot",
    access: "tid=test;proxy-ep=proxy.individual.githubcopilot.com;exp=2000",
    refresh: "github-token",
    expires: 1_000_100_000,
  });
});

test("GitHub Copilot device polling surfaces denied and expired codes", async () => {
  for (const errorCode of ["access_denied", "expired_token"] as const) {
    let now = 1_000_000;
    const fetchMock: ProviderFetch = async (input) => {
      if (String(input) === "https://github.com/login/device/code") {
        return Response.json({
          device_code: "device-code",
          user_code: "ABCD",
          verification_uri: "https://github.com/login/device",
          expires_in: 30,
          interval: 1,
        });
      }
      return Response.json({ error: errorCode });
    };

    const session = await startOAuthLogin("github-copilot", {
      fetch: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });
    await expect(session.credential).rejects.toMatchObject({ code: errorCode });
  }
});

test("Copilot-derived base URL is used by Completions and Responses", async () => {
  const credential: OAuthCredential = {
    flow: "github-copilot",
    access: "tid=test;proxy-ep=proxy.business.githubcopilot.com;exp=2000",
    refresh: "github-token",
    expires: Date.now() + 60 * 60 * 1000,
  };
  const store = new MemoryCredentialStore(credential);
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetchMock: ProviderFetch = async (input, init) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    if (String(input).endsWith("/responses")) {
      return new Response(
        `data: ${JSON.stringify({ type: "response.completed", response: {} })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  const ctx = { oauthCredentialStore: store };
  const completions = createOpenAICompletionsStream({
    baseUrl: "https://api.individual.githubcopilot.com",
    auth: "github-copilot",
    providerId: "github-copilot",
    model: "gpt-4.1",
    fetch: fetchMock,
  });
  const responses = createOpenAIResponsesStream({
    baseUrl: "https://api.individual.githubcopilot.com",
    auth: "github-copilot",
    providerId: "github-copilot",
    model: "gpt-4.1",
    fetch: fetchMock,
  });

  await collect(completions(request(), ctx));
  await collect(responses(request(), ctx));

  expect(urls).toEqual([
    "https://api.business.githubcopilot.com/chat/completions",
    "https://api.business.githubcopilot.com/responses",
  ]);
  for (const requestHeaders of headers) {
    expect(requestHeaders.get("authorization")).toBe(`Bearer ${credential.access}`);
    expect(requestHeaders.get("user-agent")).toBe("GitHubCopilotChat/0.35.0");
    expect(requestHeaders.get("editor-plugin-version")).toBe("copilot-chat/0.35.0");
    expect(requestHeaders.get("copilot-integration-id")).toBe("vscode-chat");
  }
});

test("GitHub Copilot refresh re-exchanges the GitHub token", async () => {
  let body = "";
  const fetchMock: ProviderFetch = async (input, init) => {
    expect(String(input)).toBe("https://api.github.com/copilot_internal/v2/token");
    body = String(init?.body ?? "");
    return Response.json({
      token: "tid=test;proxy-ep=proxy.individual.githubcopilot.com;exp=3000",
      expires_at: 1_000_200,
    });
  };

  const refreshed = await refreshOAuthCredential("github-copilot", {
    flow: "github-copilot",
    access: "old-copilot-token",
    refresh: "github-token",
    expires: 1,
  }, {
    fetch: fetchMock,
    now: () => 1_000_000,
  });

  expect(body).toBe("");
  expect(refreshed).toEqual({
    flow: "github-copilot",
    access: "tid=test;proxy-ep=proxy.individual.githubcopilot.com;exp=3000",
    refresh: "github-token",
    expires: 1_000_200_000,
  });
});

test("a revoked GitHub token makes Copilot request auth require sign-in", async () => {
  const store = new MemoryCredentialStore({
    flow: "github-copilot",
    access: "expired-copilot-token",
    refresh: "revoked-github-token",
    expires: Date.now() - 1,
  });
  let modelCalls = 0;
  const fetchMock: ProviderFetch = async (input) => {
    if (String(input) === "https://api.github.com/copilot_internal/v2/token") {
      return Response.json({ message: "Bad credentials" }, { status: 401 });
    }
    modelCalls += 1;
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  const stream = createOpenAICompletionsStream({
    baseUrl: "https://api.individual.githubcopilot.com",
    auth: "github-copilot",
    providerId: "github-copilot",
    model: "gpt-4.1",
    fetch: fetchMock,
  });

  const events = await collect(stream(request(), { oauthCredentialStore: store }));
  const error = errorEvent(events);

  expect(modelCalls).toBe(0);
  expect(error).toBeInstanceOf(OAuthSignInRequiredError);
  expect(error).toMatchObject({ code: "sign_in_required" });
});
