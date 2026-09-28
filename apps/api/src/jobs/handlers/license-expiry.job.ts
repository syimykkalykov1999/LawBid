import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows per read (docs/02 §1.1: short statements, batched sweeps). */
export const LICENSE_EXPIRY_BATCH = 500;

/** `verification_update` payload kinds written by this job; the app maps
 * them to `notif.verification.<kind>` texts. */
export const LICENSE_NOTIFICATION_KIND = {
  expiring: 'license_expiring',
  expired: 'license_expired',
  profileUnverified: 'profile_unverified',
} as const;

export interface LicenseExpiryResult {
  expired: number;
  unverifiedProfiles: number;
  reminders: number;
}

/** UTC midnight of [now] — `attorney_licenses.expires_at` is a DATE. */
export function utcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Which reminder a license [daysLeft] days from expiry is due, given the
 * `verification.license_expiry_notify_days` thresholds: the smallest
 * threshold ≥ daysLeft (so after a missed night the attorney still gets
 * the current reminder, and never two at once); null when none applies.
 */
export function reminderThreshold(
  daysLeft: number,
  thresholds: readonly number[],
): number | null {
  if (daysLeft <= 0) return null;
  const due = thresholds.filter((t) => t > 0 && daysLeft <= t);
  return due.length > 0 ? Math.min(...due) : null;
}

/**
 * docs/03 §2.6 nightly license expiry (stage 3.5):
 *  - a `verified` license whose `expires_at` is today or earlier becomes
 *    `expired` (so the §5.4 cases query, which only uses verified
 *    licenses, stops showing that state's cases);
 *  - when the attorney has no verified license left, a `verified`
 *    profile becomes `unverified` (a suspended/pending one keeps its
 *    status — suspension and open requests are decided by a verifier);
 *  - reminders at `verification.license_expiry_notify_days` (30 and 7)
 *    days before expiry.
 * Every event is a `verification_update` notification via
 * NotificationsService.emit(), in the same transaction as the change.
 *
 * Idempotent: the expiry update is conditional on `verified`, and a
 * reminder is skipped when one with the same license + threshold exists.
 */
@Injectable()
export class LicenseExpiryJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicenseExpiryJob.name);
  }

  async run(now: Date = new Date()): Promise<LicenseExpiryResult> {
    const today = utcDay(now);
    const result: LicenseExpiryResult = {
      expired: 0,
      unverifiedProfiles: 0,
      reminders: 0,
    };
    await this.expire(today, result);
    await this.remind(today, result);
    this.logger.info({ ...result }, 'license expiry finished');
    return result;
  }

  private async expire(
    today: Date,
    result: LicenseExpiryResult,
  ): Promise<void> {
    for (;;) {
      // Each processed row leaves the `verified` set, so re-reading the
      // first batch always makes progress.
      const due = await this.prisma.attorneyLicense.findMany({
        where: { license_status: 'verified', expires_at: { lte: today } },
        select: {
          id: true,
          attorney_id: true,
          state_code: true,
          expires_at: true,
        },
        orderBy: { id: 'asc' },
        take: LICENSE_EXPIRY_BATCH,
      });
      if (due.length === 0) return;
      for (const license of due) {
        await withTxRetry(this.prisma, async (tx) => {
          const { count } = await tx.attorneyLicense.updateMany({
            where: { id: license.id, license_status: 'verified' },
            data: { license_status: 'expired' },
          });
          if (count === 0) return;
          result.expired += 1;
          await this.notifications.emit(
            {
              userId: license.attorney_id,
              type: 'verification_update',
              payload: {
                kind: LICENSE_NOTIFICATION_KIND.expired,
                licenseId: license.id,
                stateCode: license.state_code,
                expiresAt: dateOnly(license.expires_at),
              },
            },
            tx,
          );
          const left = await tx.attorneyLicense.count({
            where: {
              attorney_id: license.attorney_id,
              license_status: 'verified',
            },
          });
          if (left > 0) return;
          const downgraded = await tx.attorneyProfile.updateMany({
            where: {
              user_id: license.attorney_id,
              verification_status: 'verified',
            },
            data: { verification_status: 'unverified' },
          });
          if (downgraded.count === 0) return;
          result.unverifiedProfiles += 1;
          await this.notifications.emit(
            {
              userId: license.attorney_id,
              type: 'verification_update',
              payload: { kind: LICENSE_NOTIFICATION_KIND.profileUnverified },
            },
            tx,
          );
        });
      }
      if (due.length < LICENSE_EXPIRY_BATCH) return;
    }
  }

  private async remind(
    today: Date,
    result: LicenseExpiryResult,
  ): Promise<void> {
    const thresholds = (
      await this.settings.numberList('verification.license_expiry_notify_days')
    ).filter((d) => Number.isInteger(d) && d > 0);
    if (thresholds.length === 0) return;
    const horizon = new Date(
      today.getTime() + Math.max(...thresholds) * DAY_MS,
    );
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.attorneyLicense.findMany({
        where: {
          license_status: 'verified',
          expires_at: { gt: today, lte: horizon },
          ...(cursor && { id: { gt: cursor } }),
        },
        select: {
          id: true,
          attorney_id: true,
          state_code: true,
          expires_at: true,
        },
        orderBy: { id: 'asc' },
        take: LICENSE_EXPIRY_BATCH,
      });
      for (const license of batch) {
        if (!license.expires_at) continue;
        const daysLeft = Math.round(
          (utcDay(license.expires_at).getTime() - today.getTime()) / DAY_MS,
        );
        const threshold = reminderThreshold(daysLeft, thresholds);
        if (threshold === null) continue;
        const expiresAt = dateOnly(license.expires_at);
        if (
          await this.reminded(today, license.attorney_id, {
            licenseId: license.id,
            expiresAt,
            threshold,
          })
        ) {
          continue;
        }
        await this.notifications.emit({
          userId: license.attorney_id,
          type: 'verification_update',
          payload: {
            kind: LICENSE_NOTIFICATION_KIND.expiring,
            licenseId: license.id,
            stateCode: license.state_code,
            expiresAt,
            daysLeft,
            thresholdDays: threshold,
          },
        });
        result.reminders += 1;
      }
      if (batch.length < LICENSE_EXPIRY_BATCH) return;
      cursor = batch[batch.length - 1].id;
    }
  }

  /** A reminder for this license, expiry date and threshold already
   * exists. It can only have been sent within the last [threshold] days,
   * so the read is bounded: the attorney's recent verification
   * notifications (index notifications(user_id, created_at DESC)). A
   * renewed license (new expires_at) gets fresh reminders. */
  private async reminded(
    today: Date,
    userId: string,
    key: { licenseId: string; expiresAt: string | null; threshold: number },
  ): Promise<boolean> {
    const since = new Date(today.getTime() - (key.threshold + 1) * DAY_MS);
    const rows = await this.prisma.notification.findMany({
      where: {
        user_id: userId,
        type: 'verification_update',
        created_at: { gte: since },
      },
      select: { payload: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.some((r) => {
      const p = r.payload as Record<string, unknown> | null;
      return (
        p !== null &&
        typeof p === 'object' &&
        p.kind === LICENSE_NOTIFICATION_KIND.expiring &&
        p.licenseId === key.licenseId &&
        p.expiresAt === key.expiresAt &&
        p.thresholdDays === key.threshold
      );
    });
  }
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
