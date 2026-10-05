import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma, SupportTicket } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { parsePermissions } from '../admin-auth/admin-permissions';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import {
  afterHoursText,
  escalate,
  isOpen,
  nextOpening,
  slaDueAt,
  slaMinutesFor,
  type SupportHours,
} from './support-hours';
import type {
  SupportDeskSettingsDto,
  SupportInfoDto,
  UpdateSupportDeskSettingsDto,
} from './support.dto';
import { nameOf } from './support.rules';

type Tx = Prisma.TransactionClient;

/** Bounded sweep: a burst of late tickets is handled over a few runs. */
const SWEEP_BATCH = 200;

/**
 * Owner 2026-10-05 — support 24/7: opening hours, SLA deadlines,
 * auto-assignment to agents on shift, the after-hours auto-reply, alerts
 * on a missed SLA (with one priority step up) and the auto-close of
 * resolved tickets. Every switch lives in Связь → Поддержка → Настройки.
 */
@Injectable()
export class SupportDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly writer: AppSettingsWriter,
    private readonly logger: PinoLogger,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
  ) {
    this.logger.setContext(SupportDeskService.name);
  }

  // --- settings ------------------------------------------------------------

  async hours(): Promise<SupportHours> {
    const [alwaysOpen, days, fromHour, toHour, timeZone] = await Promise.all([
      this.settings.boolean('support.always_open'),
      this.settings.numberList('support.open_days'),
      this.settings.number('support.open_from_hour'),
      this.settings.number('support.open_to_hour'),
      this.settings.string('support.timezone'),
    ]);
    return { alwaysOpen, days, fromHour, toHour, timeZone };
  }

  async getSettings(): Promise<SupportDeskSettingsDto> {
    const [h, autoAssign, sla, urgent, alerts, escalateOn, autoReply, close] =
      await Promise.all([
        this.hours(),
        this.settings.boolean('support.auto_assign'),
        this.settings.number('support.sla_first_response_minutes'),
        this.settings.number('support.sla_urgent_minutes'),
        this.settings.boolean('support.sla_alerts'),
        this.settings.boolean('support.escalate_on_breach'),
        this.settings.boolean('support.auto_reply'),
        this.settings.number('support.auto_close_resolved_days'),
      ]);
    return {
      autoAssign,
      slaFirstResponseMinutes: sla,
      slaUrgentMinutes: urgent,
      slaAlerts: alerts,
      escalateOnBreach: escalateOn,
      alwaysOpen: h.alwaysOpen,
      openDays: h.days,
      openFromHour: h.fromHour,
      openToHour: h.toHour,
      timeZone: h.timeZone,
      autoReply,
      autoCloseResolvedDays: close,
    };
  }

  async updateSettings(
    adminId: string,
    dto: UpdateSupportDeskSettingsDto,
  ): Promise<SupportDeskSettingsDto> {
    const timeZone =
      dto.timeZone !== undefined && validTimeZone(dto.timeZone)
        ? dto.timeZone
        : undefined;
    await this.writer.write(adminId, 'support.settings.update', {
      'support.auto_assign': dto.autoAssign,
      'support.sla_first_response_minutes': dto.slaFirstResponseMinutes,
      'support.sla_urgent_minutes': dto.slaUrgentMinutes,
      'support.sla_alerts': dto.slaAlerts,
      'support.escalate_on_breach': dto.escalateOnBreach,
      'support.always_open': dto.alwaysOpen,
      'support.open_days': dto.openDays
        ? [...new Set(dto.openDays)].sort((a, b) => a - b)
        : undefined,
      'support.open_from_hour': dto.openFromHour,
      'support.open_to_hour': dto.openToHour,
      'support.timezone': timeZone,
      'support.auto_reply': dto.autoReply,
      'support.auto_close_resolved_days': dto.autoCloseResolvedDays,
    });
    return this.getSettings();
  }

  /** What the app shows above "New request". */
  async info(now = new Date()): Promise<SupportInfoDto> {
    const [h, minutes] = await Promise.all([
      this.hours(),
      this.settings.number('support.sla_first_response_minutes'),
    ]);
    const open = isOpen(h, now);
    return {
      open,
      alwaysOpen: h.alwaysOpen,
      expectedReplyMinutes: minutes,
      opensAt: open ? null : nextOpening(h, now).toISOString(),
    };
  }

  // --- ticket lifecycle hooks (called inside the caller's transaction) ------

  /** A new ticket: SLA deadline, an agent on shift, the after-hours
   * answer. Returns the auto-reply message id when one was written. */
  async onCreated(
    tx: Tx,
    ticket: SupportTicket,
    userLanguage: string,
    now = new Date(),
  ): Promise<string | null> {
    const [h, normal, urgent, autoAssign, autoReply] = await Promise.all([
      this.hours(),
      this.settings.number('support.sla_first_response_minutes'),
      this.settings.number('support.sla_urgent_minutes'),
      this.settings.boolean('support.auto_assign'),
      this.settings.boolean('support.auto_reply'),
    ]);
    const due = slaDueAt(
      h,
      now,
      slaMinutesFor(ticket.priority, normal, urgent),
    );
    const assignee = autoAssign ? await this.pickAgent(tx) : null;
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        sla_due_at: due,
        ...(assignee ? { assignee_id: assignee, assigned_at: now } : {}),
      },
    });
    if (!autoReply || isOpen(h, now)) return null;
    const m = await tx.supportMessage.create({
      data: {
        ticket_id: ticket.id,
        auto: true,
        body: afterHoursText(userLanguage, nextOpening(h, now), h.timeZone),
        // Just after the user's message, so the thread reads in order.
        created_at: new Date(now.getTime() + 1),
      },
    });
    return m.id;
  }

  /** The user wrote again: an answer is due (if one isn't already). */
  async onUserMessage(
    tx: Tx,
    ticket: SupportTicket,
    now = new Date(),
  ): Promise<void> {
    if (ticket.sla_due_at) return;
    const [h, normal, urgent] = await Promise.all([
      this.hours(),
      this.settings.number('support.sla_first_response_minutes'),
      this.settings.number('support.sla_urgent_minutes'),
    ]);
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        sla_due_at: slaDueAt(
          h,
          now,
          slaMinutesFor(ticket.priority, normal, urgent),
        ),
        sla_breached_at: null,
      },
    });
  }

  /** The agent on shift with the fewest open tickets (under their cap)
   * who still holds the support right. */
  async pickAgent(
    tx: Tx | PrismaService = this.prisma,
  ): Promise<string | null> {
    const agents = await tx.supportAgent.findMany({
      where: { on_shift: true },
      select: { admin_id: true, max_open: true },
    });
    if (agents.length === 0) return null;
    const admins = await tx.user.findMany({
      where: {
        id: { in: agents.map((a) => a.admin_id) },
        role: 'admin',
        status: 'active',
        deleted_at: null,
      },
      select: {
        id: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
      },
    });
    const allowed = new Set(
      admins.filter((a) => canAnswer(a.admin_profile)).map((a) => a.id),
    );
    if (allowed.size === 0) return null;
    const load = await tx.supportTicket.groupBy({
      by: ['assignee_id'],
      where: {
        assignee_id: { in: [...allowed] },
        status: { in: ['open', 'waiting_user'] },
      },
      _count: { _all: true },
    });
    const open = new Map(load.map((l) => [l.assignee_id, l._count._all]));
    const ranked = agents
      .filter((a) => allowed.has(a.admin_id))
      .map((a) => ({
        id: a.admin_id,
        open: open.get(a.admin_id) ?? 0,
        cap: a.max_open,
      }))
      .filter((a) => a.open < a.cap)
      .sort((a, b) => a.open - b.open || a.id.localeCompare(b.id));
    return ranked[0]?.id ?? null;
  }

  // --- cron ----------------------------------------------------------------

  /** Every 5 minutes: late answers → flagged, one priority up, the team is
   * told; resolved tickets older than N days → closed. */
  async sweep(now = new Date()): Promise<{ breached: number; closed: number }> {
    const [alerts, escalateOn, closeDays] = await Promise.all([
      this.settings.boolean('support.sla_alerts'),
      this.settings.boolean('support.escalate_on_breach'),
      this.settings.number('support.auto_close_resolved_days'),
    ]);
    const late = await this.prisma.supportTicket.findMany({
      where: {
        sla_due_at: { lt: now },
        sla_breached_at: null,
        status: { in: ['open', 'waiting_user'] },
      },
      orderBy: { sla_due_at: 'asc' },
      take: SWEEP_BATCH,
    });
    const flagged: SupportTicket[] = [];
    for (const t of late) {
      const n = await withTxRetry(this.prisma, (tx) =>
        tx.supportTicket.updateMany({
          where: { id: t.id, sla_breached_at: null },
          data: {
            sla_breached_at: now,
            ...(escalateOn ? { priority: escalate(t.priority) } : {}),
          },
        }),
      );
      if (n.count === 1) flagged.push(t);
    }
    if (alerts && flagged.length > 0) await this.alert(flagged);

    let closed = 0;
    if (closeDays > 0) {
      const r = await this.prisma.supportTicket.updateMany({
        where: {
          status: 'resolved',
          resolved_at: {
            lt: new Date(now.getTime() - closeDays * 86_400_000),
          },
        },
        data: { status: 'closed' },
      });
      closed = r.count;
    }
    return { breached: flagged.length, closed };
  }

  /** One e-mail per person: the assignee hears about their tickets; the
   * unassigned ones go to the agents on shift (or the super admins). */
  private async alert(tickets: SupportTicket[]): Promise<void> {
    if (!this.email) return;
    const byAdmin = new Map<string, SupportTicket[]>();
    const add = (id: string, ts: SupportTicket[]) =>
      byAdmin.set(id, [...(byAdmin.get(id) ?? []), ...ts]);
    for (const t of tickets) if (t.assignee_id) add(t.assignee_id, [t]);
    const unassigned = tickets.filter((t) => !t.assignee_id);
    if (unassigned.length > 0) {
      const onShift = await this.prisma.supportAgent.findMany({
        where: { on_shift: true },
        select: { admin_id: true },
      });
      let to = onShift.map((a) => a.admin_id);
      if (to.length === 0) {
        const owners = await this.prisma.adminProfile.findMany({
          where: { admin_role: 'super_admin' },
          select: { user_id: true },
        });
        to = owners.map((o) => o.user_id);
      }
      for (const id of to) add(id, unassigned);
    }
    const people = await this.prisma.user.findMany({
      where: { id: { in: [...byAdmin.keys()] }, deleted_at: null },
      select: { id: true, email: true, first_name: true, last_name: true },
    });
    for (const p of people) {
      const list = byAdmin.get(p.id) ?? [];
      if (!p.email || list.length === 0) continue;
      const lines = list
        .slice(0, 20)
        .map((t) => `• ${t.subject} (${t.priority})`)
        .join('\n');
      try {
        await this.email.sendEmail({
          to: p.email,
          subject: `LawBid Support: ${list.length} late answer${list.length === 1 ? '' : 's'}`,
          text: `${nameOf(p)}, these requests wait longer than the SLA:\n\n${lines}\n\nAdmin → Связь → Поддержка → «Просрочено».`,
        });
      } catch (e) {
        this.logger.warn({ err: e, adminId: p.id }, 'support SLA alert failed');
      }
    }
  }
}

/** The super admin, or an admin with the support area at `manage`. */
export function canAnswer(
  profile: { admin_role: string; permissions: unknown } | null,
): boolean {
  if (!profile) return false;
  return (
    profile.admin_role === 'super_admin' ||
    parsePermissions(profile.permissions).support === 'manage'
  );
}

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
