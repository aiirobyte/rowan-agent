import { expect, test } from "bun:test";
import { refreshOAuthCredential, startOAuthLogin } from "../src";
import type { ProviderFetch } from "../src/providers/shared";

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

test("Codex login rejects a wrong callback state, exchanges the code, and closes the listener", async () => {
  let tokenBody = "";
  const accessToken = codexAccessToken("acct-login");
  const fetchMock: ProviderFetch = async (input, init) => {
    expect(String(input)).toBe("https://auth.openai.com/oauth/token");
    tokenBody = String(init?.body);
    return Response.json({
      access_token: accessToken,
      refresh_token: "codex-refresh",
      expires_in: 3600,
      id_token: "id-token",
    });
  };

  const session = await startOAuthLogin("openai-codex", { fetch: fetchMock });
  if (!session.url) throw new Error("Codex login did not return an authorization URL.");
  const authorize = new URL(session.url);
  const state = authorize.searchParams.get("state");
  if (!state) throw new Error("Codex login did not return state.");

  expect(authorize.origin).toBe("https://auth.openai.com");
  expect(authorize.pathname).toBe("/oauth/authorize");
  expect(authorize.searchParams.get("response_type")).toBe("code");
  expect(authorize.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
  expect(authorize.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
  expect(authorize.searchParams.get("scope")).toBe("openid profile email offline_access");
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorize.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(authorize.searchParams.get("id_token_add_organizations")).toBe("true");
  expect(authorize.searchParams.get("codex_cli_simplified_flow")).toBe("true");
  expect(authorize.searchParams.get("originator")).toBe("rowan");

  const wrong = await fetch(
    `http://127.0.0.1:1455/auth/callback?state=wrong&code=wrong-code`,
  );
  expect(wrong.status).toBe(400);

  const callback = await fetch(
    `http://127.0.0.1:1455/auth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
  );
  expect(callback.status).toBe(200);
  const credential = await session.credential;

  const body = new URLSearchParams(tokenBody);
  expect(body.get("grant_type")).toBe("authorization_code");
  expect(body.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
  expect(body.get("code")).toBe("authorization-code");
  expect(body.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
  const verifier = body.get("code_verifier");
  if (!verifier) throw new Error("Codex exchange omitted code_verifier.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const expectedChallenge = authorize.searchParams.get("code_challenge");
  if (!expectedChallenge) throw new Error("Codex login omitted code_challenge.");
  expect(challenge).toBe(expectedChallenge);

  expect(credential).toMatchObject({
    flow: "openai-codex",
    access: accessToken,
    refresh: "codex-refresh",
    accountId: "acct-login",
    idToken: "id-token",
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
});

test("Codex refresh rotates tokens and re-reads the account id", async () => {
  let body = "";
  const fetchMock: ProviderFetch = async (input, init) => {
    expect(String(input)).toBe("https://auth.openai.com/oauth/token");
    body = String(init?.body);
    return Response.json({
      access_token: codexAccessToken("acct-refreshed"),
      refresh_token: "rotated-refresh",
      expires_in: 7200,
    });
  };

  const refreshed = await refreshOAuthCredential("openai-codex", {
    flow: "openai-codex",
    access: codexAccessToken("acct-old"),
    refresh: "test-refresh",
    expires: 1,
    accountId: "acct-old",
  }, {
    fetch: fetchMock,
    now: () => 1_000_000,
  });

  expect(new URLSearchParams(body).get("grant_type")).toBe("refresh_token");
  expect(new URLSearchParams(body).get("refresh_token")).toBe("test-refresh");
  expect(refreshed).toMatchObject({
    flow: "openai-codex",
    refresh: "rotated-refresh",
    accountId: "acct-refreshed",
    expires: 8_200_000,
  });
});

test("Codex login reports a clear port-in-use error", async () => {
  const { createServer } = await import("node:http");
  const blocker = createServer((_request, response) => response.end("busy"));
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(1455, "127.0.0.1", () => resolve());
  });
  try {
    await expect(startOAuthLogin("openai-codex", {
      fetch: async () => Response.json({}),
    })).rejects.toMatchObject({ code: "port_in_use" });
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

test("Codex cancel closes the loopback listener", async () => {
  const session = await startOAuthLogin("openai-codex", {
    fetch: async () => Response.json({}),
  });
  session.cancel();
  await expect(session.credential).rejects.toMatchObject({ name: "AbortError" });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const replacement = await startOAuthLogin("openai-codex", {
    fetch: async () => Response.json({}),
  });
  replacement.cancel();
  await expect(replacement.credential).rejects.toMatchObject({ name: "AbortError" });
});
