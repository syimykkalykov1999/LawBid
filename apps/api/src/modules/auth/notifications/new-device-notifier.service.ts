import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import {
  AuthEventService,
  AUTH_EVENT_TYPES,
} from '../services/auth-event.service';
import type { DeviceInfo, RequestMeta } from '../services/session.service';
import {
  LOGIN_NOTIFICATION_CHANNELS,
  type ChannelResult,
  type LoginNotificationChannel,
  type NewDeviceLoginNotice,
} from './login-notification-channel';

export interface LoginContext {
  user: Pick<User, 'id' | 'email' | 'email_verified_at'>;
  isNewUser: boolean;
  isNewDevice: boolean;
  device: DeviceInfo;
  meta: RequestMeta;
}

/** Upper bound on how long shutdown waits for in-flight alerts. */
const DRAIN_TIMEOUT_MS = 5000;

/**
 * docs/01_FOUNDATION_AUTH.md §10.6: "Логи входов ... в auth_events.
 * Уведомление пользователю о входе с нового устройства (push/email)."
 *
 * Fires when a login (OTP verify or social) creates a session for a
 * device_id this EXISTING user has never had a session on
 * (SessionService.isNewDevice). A brand-new account's first device is
 * not "new" to anyone, so sign-ups are skipped.
 *
 * Never fails or slows the login beyond one audit insert:
 * - the `new_device` auth_events row is written inline (errors logged
 *   and swallowed — an audit hiccup must not lock people out);
 * - delivery to every LoginNotificationChannel runs detached, each
 *   channel isolated from the others' failures. In-flight deliveries are
 *   tracked so a graceful shutdown (enableShutdownHooks) lets them finish.
 */
@Injectable()
export class NewDeviceNotifier implements OnApplicationShutdown {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(LOGIN_NOTIFICATION_CHANNELS)
    private readonly channels: LoginNotificationChannel[],
    private readonly authEvents: AuthEventService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NewDeviceNotifier.name);
  }

  async onLogin(ctx: LoginContext): Promise<void> {
    const deviceId = ctx.device.deviceId;
    if (!ctx.isNewDevice || ctx.isNewUser || !deviceId) return;

    const notice: NewDeviceLoginNotice = {
      userId: ctx.user.id,
      verifiedEmail:
        ctx.user.email && ctx.user.email_verified_at
          ? ctx.user.email
          : undefined,
      deviceId,
      deviceName: ctx.device.deviceName,
      platform: ctx.device.platform,
      at: new Date(),
    };

    try {
      await this.authEvents.record({
        userId: ctx.user.id,
        eventType: AUTH_EVENT_TYPES.NEW_DEVICE,
        success: true,
        deviceId,
        ip: ctx.meta.ip,
        userAgent: ctx.meta.userAgent,
        meta: {
          deviceName: ctx.device.deviceName ?? null,
          platform: ctx.device.platform ?? null,
          channels: this.channels.map((c) => c.name),
        },
      });
    } catch (error) {
      this.logger.error(
        { err: error, userId: ctx.user.id },
        'new_device auth event not recorded',
      );
    }

    const delivery = this.deliver(notice).finally(() => {
      this.inFlight.delete(delivery);
    });
    this.inFlight.add(delivery);
  }

  /** Resolves once every alert started so far has settled. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.race([
      this.drain(),
      new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS).unref()),
    ]);
  }

  private async deliver(notice: NewDeviceLoginNotice): Promise<void> {
    const results = await Promise.all(
      this.channels.map(async (channel): Promise<ChannelResult> => {
        try {
          return await channel.notifyNewDevice(notice);
        } catch (error) {
          this.logger.warn(
            { err: error, channel: channel.name, userId: notice.userId },
            'new-device notification failed',
          );
          return { channel: channel.name, status: 'failed' };
        }
      }),
    );
    this.logger.info(
      { userId: notice.userId, results },
      'new-device notification dispatched',
    );
  }
}
