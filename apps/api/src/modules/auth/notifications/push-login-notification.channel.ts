import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import type {
  ChannelResult,
  LoginNotificationChannel,
  NewDeviceLoginNotice,
} from './login-notification-channel';

/**
 * Push leg of docs/01 §10.6's new-device alert: a `security_new_device`
 * notification (docs/05 §9.2, `system` category — can't be turned off,
 * ignores quiet hours). The email leg stays EmailLoginNotificationChannel.
 */
@Injectable()
export class PushLoginNotificationChannel implements LoginNotificationChannel {
  readonly name = 'push';

  constructor(private readonly notifications: NotificationsService) {}

  async notifyNewDevice(notice: NewDeviceLoginNotice): Promise<ChannelResult> {
    try {
      await this.notifications.emit({
        type: 'security_new_device',
        recipientId: notice.userId,
        payload: {
          ...(notice.deviceName ? { deviceName: notice.deviceName } : {}),
          ...(notice.platform ? { platform: notice.platform } : {}),
        },
      });
      return { channel: this.name, status: 'sent' };
    } catch {
      return { channel: this.name, status: 'failed' };
    }
  }
}
