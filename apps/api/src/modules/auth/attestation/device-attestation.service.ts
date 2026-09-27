import { Inject, Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import {
  APP_ATTEST_VERIFIER,
  PLAY_INTEGRITY_VERIFIER,
  type AttestationPlatform,
  type AttestationVerdict,
  type AttestationVerifier,
} from './attestation-verifier.interface';

export const DEVICE_ATTESTATION_FLAG = 'device_attestation';
export const ATTESTATION_HEADER = 'x-device-attestation';
/** Attestation tokens are a few KB at most; anything larger is junk. */
const MAX_TOKEN_LENGTH = 16_384;

export interface AttestationRequest {
  platform?: string;
  token?: string;
  deviceId?: string;
  requestBinding: string;
}

/** Decides whether attestation is required (feature flag
 * `device_attestation`, default OFF when the row is missing) and
 * dispatches the token to the platform's verifier. */
@Injectable()
export class DeviceAttestationService {
  constructor(
    private readonly flags: FeatureFlagsService,
    @Inject(APP_ATTEST_VERIFIER)
    private readonly appAttest: AttestationVerifier,
    @Inject(PLAY_INTEGRITY_VERIFIER)
    private readonly playIntegrity: AttestationVerifier,
  ) {}

  isRequired(): Promise<boolean> {
    return this.flags.isEnabled(DEVICE_ATTESTATION_FLAG, false);
  }

  async verify(input: AttestationRequest): Promise<AttestationVerdict> {
    const platform = this.parsePlatform(input.platform);
    if (!platform) return { valid: false, reason: 'unsupported_platform' };
    const token = input.token?.trim();
    if (!token) return { valid: false, reason: 'missing_token' };
    if (token.length > MAX_TOKEN_LENGTH) {
      return { valid: false, reason: 'malformed_token' };
    }
    const verifier = platform === 'ios' ? this.appAttest : this.playIntegrity;
    try {
      return await verifier.verify({
        platform,
        token,
        deviceId: input.deviceId,
        requestBinding: input.requestBinding,
      });
    } catch {
      // Verifier/provider outage: fail closed — the flag exists precisely
      // for periods of suspected abuse.
      return { valid: false, reason: 'verifier_error' };
    }
  }

  private parsePlatform(raw: string | undefined): AttestationPlatform | null {
    const value = raw?.trim().toLowerCase();
    return value === 'ios' || value === 'android' ? value : null;
  }
}
