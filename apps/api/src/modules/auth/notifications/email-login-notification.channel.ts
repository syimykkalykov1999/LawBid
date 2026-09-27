import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { EMAIL_PROVIDER } from '../providers/provider.tokens';
import type { EmailProvider } from '../providers/email/email-provider.interface';
import { buildNewDeviceEmail } from './email-templates';
import type {
  ChannelResult,
  LoginNotificationChannel,
  NewDeviceLoginNotice,
} from './login-notification-channel';

/** Email leg of the new-device alert. Paid provider call, so it goes
 * through CostGuardService like every OTP email (docs/COST_PROTECTION.md,
 * OQ-001): an exhausted budget skips the alert, it never blocks a login. */
@Injectable()
export class EmailLoginNotificationChannel implements LoginNotificationChannel {
  readonly name = 'email';
  private readonly appLinkBaseUrl: string | undefined;

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly costGuard: CostGuardService,
    config: ConfigService,
  ) {
    this.appLinkBaseUrl = config.get<string>('APP_LINK_BASE_URL');
  }

  async notifyNewDevice(notice: NewDeviceLoginNotice): Promise<ChannelResult> {
    if (!notice.verifiedEmail) {
      return { channel: this.name, status: 'skipped', reason: 'no_email' };
    }
    try {
      await this.costGuard.consume('email');
    } catch {
      return { channel: this.name, status: 'skipped', reason: 'budget' };
    }
    await this.emailProvider.sendEmail(
      buildNewDeviceEmail({
        email: notice.verifiedEmail,
        deviceName: notice.deviceName,
        platform: notice.platform,
        at: notice.at,
        appLinkBaseUrl: this.appLinkBaseUrl,
      }),
    );
    return { channel: this.name, status: 'sent' };
  }
}
