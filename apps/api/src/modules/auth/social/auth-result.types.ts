/** Shared response shape for every flow that ends in a fresh token pair
 * (OTP verify, social login, refresh) — one type so AuthController's
 * response mapping doesn't drift between endpoints. */
export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  isNewUser: boolean;
}
