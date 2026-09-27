import { Injectable } from '@nestjs/common';
import type {
  ChannelResult,
  LoginNotificationChannel,
  NewDeviceLoginNotice,
} from './login-notification-channel';

/**
 * Push leg of docs/01 §10.6's new-device alert. Deliberately a no-op
 * seam: push tokens, channels and delivery belong to
 * docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md, and .cursorrules requires
 * every notification to go through NotificationsService.emit(), which
 * doesn't exist yet.
 * TODO(docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md, notifications stage):
 * replace the body with NotificationsService.emit() on the "system"
 * channel for `notice.userId`.
 */
@Injectable()
export class PushLoginNotificationChannel implements LoginNotificationChannel {
  readonly name = 'push';

  notifyNewDevice(notice: NewDeviceLoginNotice): Promise<ChannelResult> {
    void notice;
    return Promise.resolve({
      channel: this.name,
      status: 'skipped',
      reason: 'not_implemented',
    });
  }
}
