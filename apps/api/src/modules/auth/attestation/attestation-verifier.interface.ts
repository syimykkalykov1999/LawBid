export type AttestationPlatform = 'ios' | 'android';

/** What the client sent: `X-Device-Attestation` (an App Attest assertion
 * on iOS, a Play Integrity token on Android) plus request context the
 * verifier binds it to (the token's embedded challenge/requestHash must
 * commit to this route and device, or a token could be replayed onto a
 * different request). */
export interface AttestationEvidence {
  platform: AttestationPlatform;
  token: string;
  deviceId?: string;
  /** e.g. `POST /api/v1/auth/otp/request` */
  requestBinding: string;
}

export type AttestationVerdict =
  { valid: true } | { valid: false; reason: string };

/**
 * docs/01 §10.6: "Проверка целостности устройства (Play Integrity / App
 * Attest) в релизной сборке, включается флагом." One implementation per
 * platform. A real implementation needs owner-provisioned credentials
 * (Apple Team ID + App Attest environment; a Google Cloud service
 * account with the Play Integrity API) — see docs/changelog.d/leaf-1.2.md.
 */
export interface AttestationVerifier {
  readonly platform: AttestationPlatform;
  verify(evidence: AttestationEvidence): Promise<AttestationVerdict>;
}

export const APP_ATTEST_VERIFIER = Symbol('APP_ATTEST_VERIFIER');
export const PLAY_INTEGRITY_VERIFIER = Symbol('PLAY_INTEGRITY_VERIFIER');
