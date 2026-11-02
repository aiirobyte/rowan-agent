export const OAUTH_FLOWS = ["xai", "github-copilot", "openai-codex"] as const;

export type OAuthFlow = (typeof OAUTH_FLOWS)[number];

export type AuthMode = "none" | OAuthFlow;

export function parseAuthMode(value: unknown): AuthMode | undefined {
  if (value === undefined) return undefined;
  if (value === "none") return "none";
  if (value === "xai" || value === "github-copilot" || value === "openai-codex") return value;
  throw new TypeError(
    `Invalid auth mode. Expected one of: "none", ${OAUTH_FLOWS.map((flow) => `"${flow}"`).join(", ")}.`,
  );
}

export function isOAuthFlow(value: AuthMode | undefined): value is OAuthFlow {
  return value !== undefined && value !== "none";
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
