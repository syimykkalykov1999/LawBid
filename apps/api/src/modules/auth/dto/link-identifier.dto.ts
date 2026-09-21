import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * POST /auth/identifiers — attach an additional login method to the
 * CURRENT (already authenticated) account. Two shapes depending on
 * `provider`, both proving ownership before IdentityService.linkIdentifier
 * runs (engineering judgment, docs/CHANGELOG.md stage 1.4 — the spec
 * names the endpoint but not its proof-of-ownership mechanism):
 *  - phone/email: identifier + a code from POST /auth/otp/request
 *    (verified with OtpService, purpose='login', same as sign-in).
 *  - apple/google: idToken + nonce, verified the same way as POST
 *    /auth/social (SocialTokenVerifier), but the resulting providerUid is
 *    linked to the CURRENT user instead of resolving/creating one.
 */
export class LinkIdentifierDto {
  @IsIn(['phone', 'email', 'apple', 'google'])
  provider!: 'phone' | 'email' | 'apple' | 'google';

  @IsOptional()
  @IsString()
  @ValidateIf(
    (o: LinkIdentifierDto) => o.provider === 'phone' || o.provider === 'email',
  )
  identifier?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(
    (o: LinkIdentifierDto) => o.provider === 'phone' || o.provider === 'email',
  )
  code?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(
    (o: LinkIdentifierDto) => o.provider === 'apple' || o.provider === 'google',
  )
  idToken?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(
    (o: LinkIdentifierDto) => o.provider === 'apple' || o.provider === 'google',
  )
  nonce?: string;
}
