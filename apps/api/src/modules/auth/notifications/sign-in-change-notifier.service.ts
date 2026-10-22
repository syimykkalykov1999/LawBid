import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.public';
import { emailFlowsOn } from '../../feature-flags/email-flows';
import { EMAIL_PROVIDER } from '../providers/provider.tokens';
import type { EmailProvider } from '../providers/email/email-provider.interface';
import { buildSignInChangedEmail } from './email-templates';

export type SignInChangeKind =
  'phone' | 'email' | 'google' | 'apple' | 'password';

export interface SignInChange {
  userId: string;
  kind: SignInChangeKind;
  /** The verified e-mail the account had BEFORE the change (null: none). */
  previousEmail: string | null;
}

/** A sign-up is not a "change": the person is setting the account up. */
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

/**
 * Owner 2026-10-22 (security audit #3, finding 2): when a phone, an e-mail,
 * a Google / Apple sign-in or the password is added or changed, the owner
 * hears about it on what they had before — a push to every device of the
 * account (the old phone included) and an e-mail to the previous verified
 * address. An intruder who adds their own e-mail cannot hide it.
 *
 * Never throws and never blocks the change: delivery problems are logged.
 * Skipped for an account younger than an hour (its own sign-up).
 */
@Injectable()
export class SignInChangeNotifier {
  private readonly appLinkBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly costGuard: CostGuardService,
    private readonly logger: PinoLogger,
    config: ConfigService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {
    this.logger.setContext(SignInChangeNotifier.name);
    this.appLinkBaseUrl = config.get<string>('APP_LINK_BASE_URL');
  }

  async notify(change: SignInChange): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: change.userId },
        select: { created_at: true },
      });
      if (!user || Date.now() - user.created_at.getTime() < NEW_ACCOUNT_MS) {
        return;
      }
      await this.notifications.emit({
        type: 'security_sign_in_changed',
        recipientId: change.userId,
        payload: { kind: change.kind },
      });
      await this.mail(change);
    } catch (error) {
      this.logger.warn(
        { err: error, userId: change.userId, kind: change.kind },
        'sign-in change notice failed',
      );
    }
  }

  private async mail(change: SignInChange): Promise<void> {
    if (!change.previousEmail) return;
    if (!(await emailFlowsOn(this.flags))) return;
    try {
      await this.costGuard.consume('email');
    } catch {
      return; // Budget exhausted: the push above still went out.
    }
    await this.emailProvider.sendEmail(
      buildSignInChangedEmail({
        email: change.previousEmail,
        what: change.kind,
        at: new Date(),
        appLinkBaseUrl: this.appLinkBaseUrl,
      }),
    );
  }
}
