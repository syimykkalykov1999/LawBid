import { IsIn, IsString, Matches } from 'class-validator';
import { IsPhoneOrEmailIdentifier } from './validators';

/**
 * docs/01_FOUNDATION_AUTH.md §10.5: `{method: "otp", code}` — the table
 * is a summary and doesn't say which identifier the code was sent to.
 * Engineering judgment (docs/CHANGELOG.md, stage 1.4): `identifier` is
 * added here because the server has no other way to know which of the
 * user's possibly-several verified identifiers the client requested a
 * code for (via the existing public POST /auth/otp/request). The service
 * additionally checks that `identifier` actually belongs to and is
 * verified for the CURRENT authenticated user before accepting the code
 * — a caller can't reauth against someone else's phone number.
 *
 * "biometric" from §10.1 is intentionally NOT a valid `method` value yet:
 * a server can't verify an on-device Face ID/Touch ID assertion without
 * platform key attestation (App Attest / Play Integrity), which is the
 * FEATURE_ATTESTATION-flagged seam stage 1.4 stubs but does not build.
 * Only 'otp' reauth is implemented this stage.
 */
export class ReauthDto {
  @IsIn(['otp'])
  method!: 'otp';

  @IsString()
  @IsPhoneOrEmailIdentifier()
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}
