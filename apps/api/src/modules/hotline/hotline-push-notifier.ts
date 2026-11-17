import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { quietHoursEnd } from '../notifications/notification-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  type HotlineNotifier,
  type LawyerAvailableNotice,
  RealtimeHotlineNotifier,
} from './hotline-notifier';

/** The notification type of «Адвокат на линии» (plan PR 5). */
export const HOTLINE_NOTICE_TYPE = 'hotline_attorney_available' as const;

/**
 * Owner row 87, plan PR 5: «Сообщите, когда появится адвокат» reaches a
 * CLOSED app. The sweeper already picks whom to tell (oldest first, free
 * attorneys × `hotline.notify_overbook_pct`, `hotline.notify_rate_per_sec`)
 * and keeps the night out (`hotline.notify_quiet_*` in the client's own
 * clock); this notifier delivers one notice:
 *  - the socket event `hotline:notify` (an open app or web tab), as before;
 *  - a stored notification `hotline_attorney_available` → the ordinary push
 *    pipeline (FCM / APNs, the person's «Звонки» switch, the bell list),
 *    with `requestId` + `claimToken` for «Позвонить сейчас».
 * The person's own quiet hours (Настройки → Уведомления → Не беспокоить)
 * hold every other push until morning; this one would be stale by then, so
 * inside them it is not sent at all — the socket event only.
 */
@Injectable()
export class PushHotlineNotifier implements HotlineNotifier {
  private readonly live: RealtimeHotlineNotifier;
  private notificationsSvc?: NotificationsService;

  constructor(
    realtime: RealtimePublisher,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
  ) {
    this.live = new RealtimeHotlineNotifier(realtime);
    this.logger.setContext(PushHotlineNotifier.name);
  }

  /** The app's NotificationsService, looked up once (the hotline module
   * does not import the notifications module: its graph stays as it was). */
  private get notifications(): NotificationsService {
    this.notificationsSvc ??= this.moduleRef.get(NotificationsService, {
      strict: false,
    });
    return this.notificationsSvc;
  }

  async lawyerAvailable(n: LawyerAvailableNotice): Promise<void> {
    await this.live.lawyerAvailable(n);
    const qh = await this.prisma.notificationQuietHours.findUnique({
      where: { user_id: n.userId },
    });
    if (qh && quietHoursEnd(new Date(), qh)) return;
    try {
      await this.notifications.emit({
        type: HOTLINE_NOTICE_TYPE,
        recipientId: n.userId,
        payload: {
          requestId: n.requestId,
          claimToken: n.token,
          expiresAt: n.expiresAt,
        },
      });
    } catch (err) {
      // the socket event went out; a failed push never breaks the sweep
      this.logger.warn(
        { err: err instanceof Error ? err.message : err },
        'hotline notice push failed',
      );
    }
  }
}
