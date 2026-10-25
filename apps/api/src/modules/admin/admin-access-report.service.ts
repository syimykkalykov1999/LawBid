import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PRIVATE_READ_ACTION_PREFIX } from '../admin-auth/admin-private-content';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';

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
  ) {}

  async build(month: string): Promise<AccessReport | null> {
    const range = monthRange(month);
    if (!range) return null;
    const where = {
      action: { startsWith: PRIVATE_READ_ACTION_PREFIX },
      created_at: { gte: range.from, lt: range.to },
    };
    const by = ['admin_id', 'action', 'reason_code'] as const;
    const all = await this.prisma.auditLog.groupBy({
      by: [...by],
      where,
      _count: { _all: true },
    });
    // A refused attempt (outcome: failed) is logged too, but is not a read.
    const failed = await this.prisma.auditLog.groupBy({
      by: [...by],
      where: { ...where, after: { path: ['outcome'], equals: 'failed' } },
      _count: { _all: true },
    });
    const keyOf = (g: {
      admin_id: string;
      action: string;
      reason_code: string | null;
    }) => `${g.admin_id}|${g.action}|${g.reason_code ?? ''}`;
    const failedBy = new Map(failed.map((g) => [keyOf(g), g._count._all]));
    const groups = all
      .map((g) => ({
        ...g,
        _count: { _all: g._count._all - (failedBy.get(keyOf(g)) ?? 0) },
      }))
      .filter((g) => g._count._all > 0);
    const ids = [...new Set(groups.map((g) => g.admin_id))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true },
        })
      : [];
    const email = new Map(users.map((u) => [u.id, u.email]));
    const rows = groups
      .map((g) => ({
        adminId: g.admin_id,
        adminEmail: email.get(g.admin_id) ?? null,
        kind: g.action.slice(PRIVATE_READ_ACTION_PREFIX.length),
        reasonCode: g.reason_code,
        count: g._count._all,
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
    const report = await this.build(month);
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
