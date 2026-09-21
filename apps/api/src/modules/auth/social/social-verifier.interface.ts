export interface SocialVerifyResult {
  providerUid: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}

export interface SocialTokenVerifier {
  verify(idToken: string, nonce: string): Promise<SocialVerifyResult>;
}
