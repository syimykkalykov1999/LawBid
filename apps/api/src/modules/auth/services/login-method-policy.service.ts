import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';

export type LoginMethod = 'phone' | 'email' | 'apple' | 'google';

/** feature_flags keys seeded by prisma/seed.ts (docs/02 §4.B). */
export const LOGIN_METHOD_FLAGS: Record<LoginMethod, string> = {
  phone: 'phone_login',
  email: 'email_login',
  apple: 'apple_login',
  google: 'google_login',
};

/**
 * Server-side enforcement of the login-method flags. The client hides a
 * disabled button (it reads the same flags from /config/bootstrap), but
 * that is UX, not control: an operator turning `phone_login` off during
 * an SMS-pumping incident needs the API itself to stop sending codes.
 *
 * A missing flag row counts as enabled — the seed ships all four as
 * true, and an unseeded environment shouldn't lock everyone out.
 */
@Injectable()
export class LoginMethodPolicy {
  constructor(private readonly flags: FeatureFlagsService) {}

  async assertEnabled(method: LoginMethod): Promise<void> {
    const enabled = await this.flags.isEnabled(
      LOGIN_METHOD_FLAGS[method],
      true,
    );
    if (enabled) return;
    throw new ForbiddenException({
      code: ErrorCode.AUTH_PROVIDER_DISABLED,
      message: 'This sign-in method is currently unavailable.',
      details: { method },
    });
  }
}
