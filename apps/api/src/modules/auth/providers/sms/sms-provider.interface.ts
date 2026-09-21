/**
 * docs/01_FOUNDATION_AUTH.md §15 stage 1.4 names "Twilio Verify" (a
 * managed OTP product where Twilio generates and checks the code) as the
 * SMS provider, but §10.6 requires the code to be stored locally as a
 * hash so LawBid's own OtpService owns rate limiting/attempts/lockout —
 * those two requirements are structurally incompatible for the same
 * channel (a managed provider never hands you the code to hash).
 *
 * Resolved (docs/CHANGELOG.md, stage 1.4): implement against Twilio's
 * plain Messages (SMS send) API instead of the Verify product. LawBid
 * generates the code itself, so §10.6's local-hash/attempt/lockout logic
 * applies uniformly to every provider — this interface stays a plain
 * "deliver this code" seam rather than needing a dual local/remote
 * custody model.
 */
export interface SmsProvider {
  send(toE164: string, code: string): Promise<void>;
}
