import type {
  AttestationEvidence,
  AttestationPlatform,
  AttestationVerdict,
  AttestationVerifier,
} from './attestation-verifier.interface';

/**
 * Fail-closed placeholder for both App Attest (iOS) and Play Integrity
 * (Android): rejects every token. Real verification needs keys only the
 * owner can provision (docs/changelog.d/leaf-1.2.md, "Device attestation
 * keys"), and a verifier that accepted unverified tokens would make the
 * `device_attestation` flag a false sense of security. Consequence: with
 * the flag ON and these stubs in place, otp/request and social login are
 * refused for everyone — the flag must stay OFF (seed default) until real
 * verifiers are registered in AuthModule.
 */
export class UnconfiguredAttestationVerifier implements AttestationVerifier {
  constructor(readonly platform: AttestationPlatform) {}

  verify(evidence: AttestationEvidence): Promise<AttestationVerdict> {
    void evidence;
    return Promise.resolve({
      valid: false,
      reason: 'verifier_not_configured',
    });
  }
}
