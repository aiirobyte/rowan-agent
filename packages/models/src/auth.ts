export const OAUTH_FLOWS = ["xai", "github-copilot", "openai-codex"] as const;

export type OAuthFlow = (typeof OAUTH_FLOWS)[number];

export type AuthMode = "none" | "oauth";

export function parseAuthMode(value: unknown): AuthMode | undefined {
  if (value === undefined) return undefined;
  if (value === "none") return "none";
  if (value === "oauth") return "oauth";
  throw new TypeError(
    'Invalid auth mode. Expected one of: "none", "oauth".',
  );
}

export type OAuthCredential = {
  flow: OAuthFlow;
  access: string;
  refresh: string;
  /** Unix epoch milliseconds. */
  expires: number;
  /** Token endpoint retained for refresh (xAI OIDC discovery). */
  tokenEndpoint?: string;
  idToken?: string;
  accountId?: string;
};

export interface OAuthCredentialStore {
  load(providerId: string): Promise<OAuthCredential | undefined>;
  save(providerId: string, credential: OAuthCredential): Promise<void>;
}
