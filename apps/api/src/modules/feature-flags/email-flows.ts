import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { FeatureFlagsService } from './services/feature-flags.service';

/**
 * Owner 2026-10-07: Admin → Система → Функции → «Вход и письма по почте».
 * ONE switch for every user-facing place that asks for an e-mail or relies
 * on a code / link reaching one: e-mail sign-in and sign-up, adding or
 * changing the account e-mail, the client's e-mail in onboarding (and
 * before a first case), the firm e-mail check, e-mail notifications, the
 * data-export e-mail and the country waiting list. Off while Amazon SES
 * keeps the account in its sandbox (mail reaches only pre-verified
 * addresses). Phone, Google and Apple sign-in, demo codes and the admin
 * panel's own staff e-mail login do not depend on it.
 *
 * The key stays `email_login` (seeded in stage 1.3, read by every app
 * build since) so the store build already hides the e-mail button.
 */
export const EMAIL_FLOWS_FLAG = 'email_login';

/** `feature_flags.description` (English, like the other rows; the admin
 * page shows its own Russian title and text). */
export const EMAIL_FLOWS_DESCRIPTION =
  'E-mail sign-in and every e-mail flow in the app (add e-mail, client e-mail step, firm e-mail, e-mail notifications, waiting list). Off: phone, Google and Apple only.';

/** A missing row counts as on, like the other login-method flags; the
 * migration `20261007090000_email_flows_off` seeds it off on prod. */
export async function emailFlowsOn(
  flags: FeatureFlagsService | undefined,
): Promise<boolean> {
  return flags ? flags.isEnabled(EMAIL_FLOWS_FLAG, true) : true;
}

export function emailFlowsOffError(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FEATURE_DISABLED,
    message: 'E-mail is not available yet. Please use your phone number.',
    details: { feature: EMAIL_FLOWS_FLAG },
  });
}

export async function assertEmailFlowsOn(
  flags: FeatureFlagsService | undefined,
): Promise<void> {
  if (!(await emailFlowsOn(flags))) throw emailFlowsOffError();
}
