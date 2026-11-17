import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import type { HotlineKeys } from './hotline.store';

/** DI tokens: tests swap the clock, the key prefix and the notifier. */
export const HOTLINE_NOTIFIER = Symbol('HOTLINE_NOTIFIER');
export const HOTLINE_KEYS = Symbol('HOTLINE_KEYS');
export const HOTLINE_CLOCK = Symbol('HOTLINE_CLOCK');

export interface LawyerAvailableNotice {
  userId: string;
  requestId: string;
  /** Echoed by «Позвонить сейчас» (`POST /hotline/requests/:id/claim`). */
  token: string;
  expiresAt: number;
}

export interface HotlineNotifier {
  lawyerAvailable(n: LawyerAvailableNotice): Promise<void>;
}

export type { HotlineKeys };

/**
 * «Адвокат на линии — позвонить сейчас?» over the socket: reaches every open
 * app / web tab of the client. The push to a closed app is
 * PushHotlineNotifier (plan PR 5, hotline-push-notifier.ts), which sends this
 * event too; the sweeper paces both at `hotline.notify_rate_per_sec`.
 */
export class RealtimeHotlineNotifier implements HotlineNotifier {
  constructor(private readonly realtime: RealtimePublisher) {}

  lawyerAvailable(n: LawyerAvailableNotice): Promise<void> {
    this.realtime.toUsers([n.userId], 'hotline:notify', {
      requestId: n.requestId,
      token: n.token,
      expiresAt: n.expiresAt,
      textKey: 'notif.messages.hotline_attorney_available.title',
    });
    return Promise.resolve();
  }
}
