export type OAuthLoginErrorCode =
  | "discovery_failed"
  | "device_authorization_failed"
  | "port_in_use"
  | "access_denied"
  | "expired_token"
  | "sign_in_required"
  | "token_exchange_failed"
  | "refresh_failed"
  | "invalid_response";

export class OAuthLoginError extends Error {
  readonly code: OAuthLoginErrorCode;

  constructor(code: OAuthLoginErrorCode, message: string) {
    super(message);
    this.name = "OAuthLoginError";
    this.code = code;
  }
}
