import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
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
 * platform key attestation (App Attest / Play Integrity), which the API
 * does not have.
 * Owner 2026-10-28: `{method: "password", password}` — the account
 * password instead of an SMS code (PasswordReauthService). The code path
 * stays for accounts without a password, «Забыли пароль?» and older apps.
 */
export class ReauthDto {
  @IsIn(['otp', 'password'])
  method!: 'otp' | 'password';

  /** Required for `otp`: the verified phone / e-mail the code went to. */
  @ValidateIf((o: ReauthDto) => o.method === 'otp')
  @IsString()
  @IsPhoneOrEmailIdentifier()
  identifier?: string;

  /** Required for `otp`: the 6-digit code. */
  @ValidateIf((o: ReauthDto) => o.method === 'otp')
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code?: string;

  /** Required for `password`: the account password. */
  @ValidateIf((o: ReauthDto) => o.method === 'password')
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password?: string;
}
