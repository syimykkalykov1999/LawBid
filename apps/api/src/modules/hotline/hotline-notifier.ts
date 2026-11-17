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
 * «Адвокат на линии — позвонить сейчас?» Today: the realtime event (reaches
 * every open app / web tab of the client). The push to a closed app needs a
 * new notification type (a migration + the app's handler) and goes with the
 * client screens (plan PR 5); the sweeper already paces notices at
 * `hotline.notify_rate_per_sec`, so the push queue gets the same rate.
 */
export class RealtimeHotlineNotifier implements HotlineNotifier {
  constructor(private readonly realtime: RealtimePublisher) {}

  lawyerAvailable(n: LawyerAvailableNotice): Promise<void> {
    this.realtime.toUsers([n.userId], 'hotline:notify', {
      requestId: n.requestId,
      token: n.token,
      expiresAt: n.expiresAt,
      textKey: 'hotline.notice.lawyer_available',
    });
    return Promise.resolve();
  }
}
