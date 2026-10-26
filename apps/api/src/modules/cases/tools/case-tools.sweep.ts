import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import {
  balanceCents,
  becomesOverdue,
  dueReminder,
  lateFeeFor,
} from '../../../common/case-invoice-status';
import { CaseJournalService } from '../../journal/case-journal.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CaseToolsSettings } from './case-tools.settings';
import type { ToolsKind } from './case-tools.support';
import { signReminderDue } from './signing.lifecycle';

const DAY_MS = 86_400_000;

/**
 * Owner 2026-10-25: the hourly job `case-tools.sweep`.
 *
 * Invoices: an open one past its due date becomes overdue; the late fee
 * (admin percent, 0 = off) is added once after the grace days; reminders
 * follow the admin's schedule. Signing requests: past their expiry they are
 * closed (status `canceled` with `expired_at` set, so the apps need no new
 * status) and both sides told; the side that has not signed is reminded
 * every N days up to a cap. Every step is claimed with a conditional update,
 * so overlapping runs never send or charge twice. With the defaults (no due
 * dates, no expiry, reminders off) it does nothing.
 *
 * Self-contained on purpose (prisma, settings, notifications, journal): the
 * worker process does not load the case workspace.
 */
@Injectable()
export class CaseToolsSweepService {
  private readonly log = new Logger(CaseToolsSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CaseToolsSettings,
    private readonly notifications: NotificationsService,
    private readonly journal: CaseJournalService,
  ) {}

  async run(now = new Date()) {
    const invoices = await this.sweepInvoices(now);
    const signing = await this.sweepSigning(now);
    return { invoices, signing };
  }

  /** The bell + push "something in the case" (same payload as the tools). */
  private async tell(
    actorId: string,
    recipientId: string,
    caseId: string,
    kind: ToolsKind,
  ): Promise<void> {
    await this.notifications.emit({
      type: 'case_workspace_activity',
      recipientId,
      payload: { caseId, actorId, kind },
    });
  }

  async sweepInvoices(
    now = new Date(),
  ): Promise<{ overdue: number; lateFees: number; reminded: number }> {
    const result = { overdue: 0, lateFees: 0, reminded: 0 };
    const cfg = await this.settings.get();
    const rows = await this.prisma.caseInvoice.findMany({
      where: {
        status: { in: ['sent', 'viewed', 'partially_paid', 'overdue'] },
        due_at: { not: null },
      },
      orderBy: { due_at: 'asc' },
      take: 1000,
    });
    for (const inv of rows) {
      if (!inv.due_at) continue;
      let status = inv.status;
      const money = {
        totalCents: inv.total_cents,
        lateFeeCents: inv.late_fee_cents,
        paidCents: inv.paid_cents,
      };
      if (becomesOverdue(status, inv.due_at, money, now)) {
        const { count } = await this.prisma.caseInvoice.updateMany({
          where: { id: inv.id, status: inv.status },
          data: { status: 'overdue' },
        });
        if (count === 0) continue;
        status = 'overdue';
        result.overdue += 1;
      }
      let lateFee = inv.late_fee_cents;
      const graceEnds = inv.due_at.getTime() + cfg.lateFeeGraceDays * DAY_MS;
      if (
        cfg.lateFeePercent > 0 &&
        !inv.late_fee_applied_at &&
        now.getTime() >= graceEnds &&
        balanceCents(money) > 0
      ) {
        const fee = lateFeeFor(inv.total_cents, cfg.lateFeePercent);
        if (fee > 0) {
          const { count } = await this.prisma.caseInvoice.updateMany({
            where: { id: inv.id, late_fee_applied_at: null },
            data: { late_fee_cents: fee, late_fee_applied_at: now },
          });
          if (count > 0) {
            lateFee = fee;
            result.lateFees += 1;
            // The open pay link carries the fee too.
            await this.prisma.paymentRequest.updateMany({
              where: { invoice_id: inv.id, status: 'open' },
              data: { amount_cents: { increment: fee } },
            });
          }
        }
      }
      if (!inv.reminders_enabled) continue;
      const kind = dueReminder({
        dueAt: inv.due_at,
        now,
        lastRemindedAt: inv.last_reminded_at,
        remindersSent: inv.reminders_sent,
        beforeDays: cfg.invoiceReminderDays,
        overdueEveryDays: cfg.invoiceOverdueEveryDays,
        maxReminders: cfg.invoiceMaxReminders,
      });
      if (!kind || balanceCents({ ...money, lateFeeCents: lateFee }) === 0) {
        continue;
      }
      const { count } = await this.prisma.caseInvoice.updateMany({
        where: { id: inv.id, last_reminded_at: inv.last_reminded_at },
        data: { last_reminded_at: now, reminders_sent: { increment: 1 } },
      });
      if (count === 0) continue;
      try {
        await this.tell(inv.attorney_id, inv.client_id, inv.case_id, kind);
        result.reminded += 1;
      } catch (e) {
        // Not sent: released, the next run tries again.
        await this.prisma.caseInvoice.updateMany({
          where: { id: inv.id, last_reminded_at: now },
          data: {
            last_reminded_at: inv.last_reminded_at,
            reminders_sent: { decrement: 1 },
          },
        });
        this.log.warn(`reminder of invoice ${inv.id} failed: ${String(e)}`);
      }
    }
    return result;
  }

  async sweepSigning(
    now = new Date(),
  ): Promise<{ expired: number; reminded: number }> {
    const result = { expired: 0, reminded: 0 };
    const cfg = await this.settings.get();
    const lapsed = await this.prisma.caseSignRequest.findMany({
      where: { status: 'pending', expires_at: { lte: now } },
      take: 500,
    });
    for (const r of lapsed) {
      const side = await this.sideOf(r.case_id);
      if (!side) continue;
      const done = await withTxRetry(this.prisma, async (tx) => {
        const won = await tx.caseSignRequest.updateMany({
          where: { id: r.id, status: 'pending' },
          data: { status: 'canceled', expired_at: now },
        });
        if (won.count === 0) return false;
        await this.journal.append(tx, {
          caseId: r.case_id,
          clientId: side.clientId,
          actor: {
            userId: r.created_by,
            role: r.created_by === side.clientId ? 'client' : 'attorney',
          },
          attorneyId: side.attorneyId,
          event: 'signature_expired',
          payload: {
            requestId: r.id,
            expiresAt: r.expires_at?.toISOString() ?? null,
          },
        });
        return true;
      });
      if (!done) continue;
      result.expired += 1;
      for (const id of [side.clientId, side.attorneyId]) {
        await this.tell(r.created_by, id, r.case_id, 'sign_expired').catch(
          (e: unknown) =>
            this.log.warn(`expiry notice for ${r.id} failed: ${String(e)}`),
        );
      }
    }
    if (cfg.signReminderEveryDays <= 0) return result;
    const waiting = await this.prisma.caseSignRequest.findMany({
      where: {
        status: 'pending',
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        reminders_sent: { lt: cfg.signMaxReminders },
      },
      include: { signatures: { select: { signer_id: true } } },
      orderBy: { created_at: 'asc' },
      take: 500,
    });
    for (const r of waiting) {
      if (
        !signReminderDue({
          now,
          createdAt: r.created_at,
          lastRemindedAt: r.last_reminded_at,
          remindersSent: r.reminders_sent,
          everyDays: cfg.signReminderEveryDays,
          max: cfg.signMaxReminders,
        })
      ) {
        continue;
      }
      const side = await this.sideOf(r.case_id);
      if (!side) continue;
      const { count } = await this.prisma.caseSignRequest.updateMany({
        where: {
          id: r.id,
          status: 'pending',
          last_reminded_at: r.last_reminded_at,
        },
        data: { last_reminded_at: now, reminders_sent: { increment: 1 } },
      });
      if (count === 0) continue;
      const signed = new Set(r.signatures.map((x) => x.signer_id));
      for (const id of [side.clientId, side.attorneyId]) {
        if (signed.has(id)) continue;
        await this.tell(r.created_by, id, r.case_id, 'sign_reminder').catch(
          (e: unknown) =>
            this.log.warn(`reminder for ${r.id} failed: ${String(e)}`),
        );
      }
      result.reminded += 1;
    }
    return result;
  }

  private async sideOf(
    caseId: string,
  ): Promise<{ clientId: string; attorneyId: string } | null> {
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    if (!c?.accepted_bid) return null;
    return { clientId: c.client_id, attorneyId: c.accepted_bid.attorney_id };
  }
}
