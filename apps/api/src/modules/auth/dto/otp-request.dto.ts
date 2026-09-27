import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { IsIdentifierForChannel } from './validators';

export class OtpRequestDto {
  @IsIn(['phone', 'email'])
  channel!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('channel')
  identifier!: string;

  /** Magic-link binding (email login only): base64url SHA-256 of a random
   * verifier that stays on the requesting device. The emailed link then
   * carries a one-time token redeemable only together with that verifier
   * (POST /auth/otp/verify-link), so a leaked link is useless. Omit it and
   * the email contains the code only. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  linkChallenge?: string;
}
