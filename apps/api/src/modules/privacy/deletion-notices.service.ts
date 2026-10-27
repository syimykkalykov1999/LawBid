import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import type { DeletionNotices } from '../../common/privacy/privacy.ports';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAccountDeletionEmail } from '../auth/notifications/email-templates';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { emailFlowsOn } from '../feature-flags/email-flows';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_EMAIL } from '../notifications/push/push.constants';
import { DeletionStepsService } from './deletion-steps.service';
import { DELETION_GRACE_DAYS } from './privacy.constants';

const DAY_MS = 86_400_000;
/** The cancel link works for the whole grace period. */
const TOKEN_TTL_MS = (DELETION_GRACE_DAYS + 1) * DAY_MS;

export type NoticeKind = 'day0' | 'day13';

interface CancelPayload {
  /** user id */
  u: string;
  /** deletion_requested_at, ms: a newer request voids older links. */
  r: number;
  /** expiry, ms */
  e: number;
}

/**
 * Owner 2026-10-25 (privacy round 13, S13-14): an erasure request is never
 * silent. At day 0 (right after the request) and day 13 (one day before the
 * anonymization) the person gets a push and an e-mail saying when the
 * account will be deleted, with a one-tap cancel link; nothing else (no
 * sign-in) is needed to cancel. Each notice is sent once (`deletion_steps`
 * `notice_day0` / `notice_day13`). A sign-in no longer cancels the request
 * on its own (setting `privacy.login_cancels_deletion`), so these messages
 * and `POST /users/me/deletion/cancel` are the way back.
 */
@Injectable()
export class DeletionNoticesService implements DeletionNotices {
  private readonly key: Buffer;
  private readonly base: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
    private readonly steps: DeletionStepsService,
    @Inject(NOTIFICATION_EMAIL) private readonly email: EmailProvider,
    private readonly logger: PinoLogger,
    @Optional() private readonly costGuard?: CostGuardService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(DeletionNoticesService.name);
    this.key = createHmac(
      'sha256',
      config.getOrThrow<string>('OTP_CODE_SECRET'),
    )
      .update('deletion-cancel:v1')
      .digest();
    this.base = (
      config.get<string>('WEB_APP_URL') ??
      config.get<string>('APP_LINK_BASE_URL') ??
      'https://lawbid.dev'
    ).replace(/\/+$/, '');
  }

  // --- token ---------------------------------------------------------------

  sign(payload: CancelPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** The payload of a valid, unexpired token, else null. */
  verify(token: string, now: number = Date.now()): CancelPayload | null {
    const [body, sig] = (token ?? '').split('.');
    if (!body || !sig) return null;
    const want = createHmac('sha256', this.key).update(body).digest();
    let got: Buffer;
    try {
      got = Buffer.from(sig, 'base64url');
    } catch {
      return null;
    }
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as CancelPayload;
      if (
        typeof p.u !== 'string' ||
        typeof p.r !== 'number' ||
        typeof p.e !== 'number' ||
        p.e < now
      ) {
        return null;
      }
      return p;
    } catch {
      return null;
    }
  }

  cancelUrl(userId: string, requestedAt: Date): string {
    const token = this.sign({
      u: userId,
      r: requestedAt.getTime(),
      e: requestedAt.getTime() + TOKEN_TTL_MS,
    });
    return `${this.base}/api/v1/privacy/deletion/cancel/${token}`;
  }

  /** Cancels the request named by the link: true when it was pending. */
  async cancelByToken(
    token: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<boolean> {
    const p = this.verify(token);
    if (!p) return false;
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: p.u,
        status: 'deletion_pending',
        deletion_requested_at: new Date(p.r),
        anonymized_at: null,
      },
      data: { status: 'active', deletion_requested_at: null },
    });
    if (count === 0) return false;
    await this.prisma.authEvent.create({
      data: {
        user_id: p.u,
        event_type: 'account_deletion_cancelled',
        success: true,
        ip: meta.ip,
        user_agent: meta.userAgent,
        meta: { via: 'email_link' },
      },
    });
    return true;
  }

  // --- notices -------------------------------------------------------------

  /** Day 0: called right after the request. Never throws. */
  async onRequested(userId: string): Promise<void> {
    try {
      // A new request after a cancelled one starts the notices over.
      await this.prisma.deletionStep.deleteMany({
        where: {
          user_id: userId,
          step: { in: ['notice_day0', 'notice_day13'] },
        },
      });
      await this.send(userId, 'day0');
    } catch (err) {
      this.logger.warn({ err, userId }, 'deletion notice (day 0) failed');
    }
  }

  /** Daily: the day-13 notice for every request in its last day. */
  async sendDay13Due(
    now: Date = new Date(),
  ): Promise<{ sent: number; failed: number }> {
    // Cost gate: one run sends at most this many notices; the rest follow
    // on the next run (the person still has a day).
    const cap = Math.max(
      1,
      (await this.settings?.number('privacy.deletion_notices_per_day')) ?? 2000,
    );
    const due = await this.prisma.user.findMany({
      where: {
        status: 'deletion_pending',
        anonymized_at: null,
        deletion_requested_at: {
          lt: new Date(now.getTime() - (DELETION_GRACE_DAYS - 1) * DAY_MS),
        },
      },
      select: { id: true },
      orderBy: { deletion_requested_at: 'asc' },
      take: cap,
    });
    let sent = 0;
    let failed = 0;
    for (const u of due) {
      try {
        if (await this.send(u.id, 'day13')) sent += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn({ err, userId: u.id }, 'deletion notice (day 13)');
      }
    }
    return { sent, failed };
  }

  /** True when a notice went out now (false: already sent / not pending). */
  private async send(userId: string, kind: NoticeKind): Promise<boolean> {
    const step = `notice_${kind}`;
    if (await this.steps.has(userId, step)) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        email: true,
        email_verified_at: true,
        ui_language: true,
        deletion_requested_at: true,
      },
    });
    if (
      !user ||
      user.status !== 'deletion_pending' ||
      !user.deletion_requested_at
    ) {
      return false;
    }
    const deletesOn = new Date(
      user.deletion_requested_at.getTime() + DELETION_GRACE_DAYS * DAY_MS,
    );
    // The push (a `system` text without personal data); the e-mail below
    // carries the cancel link.
    await this.notifications.emit({
      type: 'account_deletion_scheduled',
      recipientId: userId,
      payload: { kind, deletesOn: deletesOn.toISOString() },
    });
    let detail = 'push';
    if (
      user.email &&
      user.email_verified_at &&
      (await emailFlowsOn(this.flags))
    ) {
      try {
        await this.costGuard?.consume('email');
        await this.email.sendEmail(
          buildAccountDeletionEmail({
            email: user.email,
            kind,
            deletesOn,
            cancelUrl: this.cancelUrl(userId, user.deletion_requested_at),
            locale: user.ui_language,
          }),
        );
        detail = 'push+email';
      } catch (err) {
        // The push went out; the e-mail is best effort (budget, provider).
        this.logger.warn({ err, userId, kind }, 'deletion e-mail failed');
      }
    }
    await this.steps.record(userId, step, 'ok', detail);
    return true;
  }
}
