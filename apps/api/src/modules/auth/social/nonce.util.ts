import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * How the provider's id_token `nonce` claim relates to the RAW nonce the
 * client sends us (SocialLoginDto.nonce — always raw, see
 * apps/mobile/.../social_auth_native_client.dart):
 *
 * - Apple: the app must pass sha256(raw) to ASAuthorization and Apple
 *   echoes it verbatim, so the claim must equal sha256hex(raw) — a raw
 *   match would mean the client skipped hashing (and the raw value was
 *   exposed to the Apple flow).
 * - Google: google_sign_in (iOS/web) embeds the nonce it was given
 *   verbatim, while Android Credential Manager's documented practice is
 *   to pass sha256(raw). Either is accepted, but the claim is REQUIRED —
 *   a token minted without a nonce was not minted for this request.
 *
 * Either way the server derives the expected value from the raw nonce,
 * so a token can only be replayed together with the secret that was
 * bound into it.
 */
export function nonceClaimMatches(
  provider: 'apple' | 'google',
  claim: unknown,
  rawNonce: string,
): boolean {
  if (typeof claim !== 'string' || claim.length === 0) return false;
  if (rawNonce.length === 0) return false;
  const hashed = sha256Hex(rawNonce);
  if (provider === 'apple') return safeEqual(claim, hashed);
  return safeEqual(claim, rawNonce) || safeEqual(claim, hashed);
}
