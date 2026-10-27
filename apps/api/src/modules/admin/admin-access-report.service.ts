import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { dailyDue } from '../../common/admin-summary/snapshot-gate';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PRIVATE_READ_ACTION_PREFIX } from '../admin-auth/admin-private-content';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import {
  type AccessReadGroup,
  countAccessReads,
  TOTALS_BUTTON_COOLDOWN_MS,
} from './dashboard.service';

/** Stored groups of one month: `access-report:YYYY-MM` (AdminSummaryService). */
export const ACCESS_REPORT_SUMMARY_KEY = 'access-report';
export const accessReportKey = (month: string) =>
  `${ACCESS_REPORT_SUMMARY_KEY}:${month}`;

export interface AccessReportRow {
  adminId: string;
  adminEmail: string | null;
  kind: string;
  reasonCode: string | null;
  count: number;
}

export interface AccessReport {
  /** `YYYY-MM` (UTC). */
  month: string;
  from: string;
  to: string;
  total: number;
  /** Reads by an admin, kind of content and coded reason. */
  rows: AccessReportRow[];
}

/** `YYYY-MM` → the UTC month [from, to). Null when malformed. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return {
    from: new Date(Date.UTC(y, mo, 1)),
    to: new Date(Date.UTC(y, mo + 1, 1)),
  };
}

export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Owner 2026-10-28: the monthly admin-access report — who read private
 * content (chats, call metadata, case files, documents), how many times and
 * why. Built from the audit rows `admin.private_read.*`; shown in the audit
 * log page and e-mailed to the owner on the 1st (`admin.access-report`).
 * Snapshot rule 2026-10-25: the groups are not counted on request — the
 * compute is countAccessReads (dashboard.service.ts); a closed month is
 * counted once and kept, the running month is recounted once a day
 * (`admin.summaries`, or the first read of the day) and by the admin
 * button «Обновить» at most once per 10 minutes.
 */
@Injectable()
export class AdminAccessReportService {
  private readonly logger = new Logger(AdminAccessReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly email?: EmailProvider,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  /** [fresh]: recount now (the monthly e-mail job, the day the month closes). */
  async build(
    month: string,
    opts: { fresh?: boolean } = {},
  ): Promise<AccessReport | null> {
    const range = monthRange(month);
    if (!range) return null;
    const groups = await this.groups(month, range, opts);
    const ids = [...new Set(groups.map((g) => g.adminId))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true },
        })
      : [];
    const email = new Map(users.map((u) => [u.id, u.email]));
    const rows = groups
      .map((g) => ({
        adminId: g.adminId,
        adminEmail: email.get(g.adminId) ?? null,
        kind: g.action.slice(PRIVATE_READ_ACTION_PREFIX.length),
        reasonCode: g.reasonCode,
        count: g.count,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      month,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      total: rows.reduce((n, r) => n + r.count, 0),
      rows,
    };
  }

  /** The stored groups of the month; counted when nothing usable is stored. */
  private async groups(
    month: string,
    range: { from: Date; to: Date },
    opts: { fresh?: boolean },
  ): Promise<AccessReadGroup[]> {
    const compute = () => countAccessReads(this.prisma, range.from, range.to);
    if (!this.summary) return compute();
    const key = accessReportKey(month);
    if (!opts.fresh) {
      const hit = await this.summary.peek<AccessReadGroup[]>(key);
      // A month counted after its end cannot change; a running month is
      // recounted once a day (the quiet hour, see dailyDue).
      const closed = hit && Date.parse(hit.computedAt) >= range.to.getTime();
      if (hit && (closed || !dailyDue(hit.computedAt))) return hit.data;
    }
    return (await this.summary.refresh(key, compute, !opts.fresh)).data;
  }

  /** `admin.summaries`: the running month, when the daily recount is due. */
  async refreshDaily(now = new Date()): Promise<void> {
    if (this.summary) await this.build(now.toISOString().slice(0, 7));
  }

  /** The admin button «Обновить»: recount the running month, at most once per 10 min. */
  async refresh(now = new Date()): Promise<void> {
    const month = now.toISOString().slice(0, 7);
    const range = monthRange(month);
    if (!range || !this.summary) return;
    const hit = await this.summary.peek(accessReportKey(month));
    if (
      hit &&
      now.getTime() - Date.parse(hit.computedAt) < TOTALS_BUTTON_COOLDOWN_MS
    )
      return;
    await this.summary.refresh(accessReportKey(month), () =>
      countAccessReads(this.prisma, range.from, range.to),
    );
  }

  /** `admin.access-report`: e-mail last month's report to the owners. */
  async sendMonthly(
    now = new Date(),
  ): Promise<
    { month: string; total: number; sent: number } | { skipped: string }
  > {
    if (
      this.settings &&
      !(await this.settings.boolean('admin.access_report_enabled'))
    ) {
      return { skipped: 'switched off' };
    }
    const month = previousMonth(now);
    const report = await this.build(month, { fresh: true });
    if (!report) return { skipped: 'bad month' };
    if (!this.email) return { skipped: 'no e-mail provider' };
    const owners = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        status: 'active',
        deleted_at: null,
        admin_profile: { admin_role: 'super_admin' },
        email: { not: null },
      },
      select: { email: true },
    });
    const lines = report.rows.map(
      (r) =>
        `${r.adminEmail ?? r.adminId}: ${r.count} x ${r.kind} (${r.reasonCode ?? 'no code'})`,
    );
    const text = `Admin access to private content in ${month}: ${report.total} read(s).\n\n${
      lines.length ? lines.join('\n') : 'Nobody read private content.'
    }\n\nFull list: admin panel, Audit log, filter "admin.private_read".`;
    let sent = 0;
    for (const o of owners) {
      if (!o.email) continue;
      try {
        await this.email.sendEmail({
          to: o.email,
          subject: `LawBid: admin access to private content, ${month}`,
          text,
        });
        sent += 1;
      } catch (e) {
        this.logger.warn(`access report e-mail failed: ${String(e)}`);
      }
    }
    return { month, total: report.total, sent };
  }
}
