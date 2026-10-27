import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Consultation, ConsultationNoShow, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { NO_SHOW_STATES } from './calendar.dto';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
/** The call may run a little over; look only after this. */
const AUTO_TAIL_MS = 5 * MIN_MS;
const AUTO_LOOKBACK_MS = 24 * HOUR_MS;
const BATCH = 200;

export type Side = 'attorney' | 'client';

export interface NoShowView {
  id: string;
  absentSide: Side;
  state: (typeof NO_SHOW_STATES)[number];
  source: 'attorney' | 'client' | 'auto';
  markedAt: string;
  disputeUntil: string;
  disputeReason: string | null;
  /** The viewer is the person marked absent. */
  viewerIsAbsent: boolean;
  canDispute: boolean;
  canWithdraw: boolean;
}

export interface NoShowInfo {
  noShows: NoShowView[];
  canMarkNoShow: boolean;
}

export interface NoShowSweepResult {
  finalized: number;
  detected: number;
}

interface CallRow {
  caller_id: string;
  callee_id: string;
  answered_at: Date | null;
}

/**
 * Pure: who did not take part in the call(s) of a consultation? An answered
 * call = both were there. A call nobody answered = the caller was there, the
 * other side was not. No call at all = nobody (could also be a phone call
 * outside the app — which is why such a mark is only a suggestion until the
 * other side confirms it).
 */
export function absentSides(
  calls: CallRow[],
  attorneyId: string,
  clientId: string,
): Side[] {
  const present = new Set<string>();
  for (const c of calls) {
    present.add(c.caller_id);
    if (c.answered_at) present.add(c.callee_id);
  }
  const out: Side[] = [];
  if (!present.has(attorneyId)) out.push('attorney');
  if (!present.has(clientId)) out.push('client');
  return out;
}

/**
 * Owner 2026-10-28: consultation no-shows. Either side may mark the other as
 * absent after a grace window; the marked person can dispute within a window;
 * an undisputed mark becomes final and goes into the person's reliability
 * counters (STORED ONLY — the ranking packages will read them). A sweep can
 * also suggest a mark when nobody joined the call (admin switch, OFF at
 * first); such a suggestion counts only after the other side confirms it.
 * A disputed mark does not count until an admin upholds it.
 */
@Injectable()
export class NoShowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NoShowService.name);
  }

  // --- people ---------------------------------------------------------------

  async list(user: RequestUser, consultationId: string): Promise<NoShowInfo> {
    const c = await this.mine(consultationId, user.sub);
    return (await this.forConsultations([c], user.sub)).get(c.id)!;
  }

  async mark(user: RequestUser, consultationId: string): Promise<NoShowInfo> {
    await this.assertEnabled();
    const now = new Date();
    const [grace, markHours, disputeHours] = await Promise.all([
      this.settings.number('consultations.no_show_grace_minutes'),
      this.settings.number('consultations.no_show_mark_hours'),
      this.settings.number('consultations.no_show_dispute_hours'),
    ]);
    const c = await this.mine(consultationId, user.sub);
    const me: Side = c.attorney_id === user.sub ? 'attorney' : 'client';
    if (me === 'attorney') this.assertMayManage(user);
    const absent: Side = me === 'attorney' ? 'client' : 'attorney';
    if (c.status !== 'confirmed') throw this.conflict();
    if (
      now.getTime() < c.starts_at.getTime() + grace * MIN_MS ||
      now.getTime() > c.ends_at.getTime() + markHours * HOUR_MS
    ) {
      throw this.conflict();
    }
    const absentUser = absent === 'attorney' ? c.attorney_id : c.client_id;
    const disputeUntil = new Date(now.getTime() + disputeHours * HOUR_MS);
    await withTxRetry(this.prisma, async (tx) => {
      const existing = await tx.consultationNoShow.findUnique({
        where: {
          consultation_id_absent_side: {
            consultation_id: c.id,
            absent_side: absent,
          },
        },
      });
      if (!existing) {
        await tx.consultationNoShow.create({
          data: {
            consultation_id: c.id,
            absent_side: absent,
            absent_user_id: absentUser,
            source: me,
            marked_by_id: user.sub,
            dispute_until: disputeUntil,
          },
        });
        return;
      }
      // The sweep's suggestion that nobody confirmed yet: the person who
      // was there now confirms it.
      if (
        existing.source === 'auto' &&
        (existing.state === 'open' || existing.state === 'unconfirmed')
      ) {
        await tx.consultationNoShow.update({
          where: { id: existing.id },
          data: {
            source: me,
            marked_by_id: user.sub,
            state: 'open',
            marked_at: now,
            dispute_until: disputeUntil,
          },
        });
        return;
      }
      throw this.conflict();
    });
    await this.notify(absentUser, c, 'no_show');
    return (await this.forConsultations([c], user.sub)).get(c.id)!;
  }

  async dispute(
    user: RequestUser,
    consultationId: string,
    reason?: string,
  ): Promise<NoShowInfo> {
    const now = new Date();
    const c = await this.mine(consultationId, user.sub);
    const side: Side = c.attorney_id === user.sub ? 'attorney' : 'client';
    if (side === 'attorney') this.assertMayManage(user);
    const marker = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.consultationNoShow.findUnique({
        where: {
          consultation_id_absent_side: {
            consultation_id: c.id,
            absent_side: side,
          },
        },
      });
      if (!row) throw this.notFound();
      if (row.state !== 'open' || row.dispute_until.getTime() < now.getTime()) {
        throw this.conflict();
      }
      await tx.consultationNoShow.update({
        where: { id: row.id },
        data: {
          state: 'disputed',
          dispute_reason: reason?.trim().slice(0, 500) || null,
          disputed_at: now,
        },
      });
      await this.bump(tx, row.absent_user_id, { disputed_count: 1 });
      return row.marked_by_id;
    });
    if (marker) await this.notify(marker, c, 'no_show_disputed');
    return (await this.forConsultations([c], user.sub)).get(c.id)!;
  }

  /** The person who marked takes it back (a mistake). */
  async withdraw(
    user: RequestUser,
    consultationId: string,
  ): Promise<NoShowInfo> {
    const c = await this.mine(consultationId, user.sub);
    const absent = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.consultationNoShow.findFirst({
        where: {
          consultation_id: c.id,
          marked_by_id: user.sub,
          state: { in: ['open', 'disputed', 'confirmed'] },
        },
      });
      if (!row) throw this.notFound();
      await tx.consultationNoShow.update({
        where: { id: row.id },
        data: { state: 'withdrawn', resolved_at: new Date() },
      });
      await this.uncount(tx, row);
      return row.absent_user_id;
    });
    await this.notify(absent, c, 'no_show_resolved');
    return (await this.forConsultations([c], user.sub)).get(c.id)!;
  }

  // --- presenting (used by the consultation DTO) ---------------------------------

  async forConsultations(
    rows: Consultation[],
    viewerId: string,
  ): Promise<Map<string, NoShowInfo>> {
    const out = new Map<string, NoShowInfo>();
    if (rows.length === 0) return out;
    const [enabled, grace, markHours] = await Promise.all([
      this.settings.boolean('consultations.no_show_enabled'),
      this.settings.number('consultations.no_show_grace_minutes'),
      this.settings.number('consultations.no_show_mark_hours'),
    ]);
    const found = await this.prisma.consultationNoShow.findMany({
      where: { consultation_id: { in: rows.map((r) => r.id) } },
    });
    const by = new Map<string, ConsultationNoShow[]>();
    for (const f of found) {
      by.set(f.consultation_id, [...(by.get(f.consultation_id) ?? []), f]);
    }
    const now = Date.now();
    for (const c of rows) {
      const mine = by.get(c.id) ?? [];
      const me: Side = c.attorney_id === viewerId ? 'attorney' : 'client';
      const other: Side = me === 'attorney' ? 'client' : 'attorney';
      const already = mine.some(
        (m) =>
          m.absent_side === other &&
          m.state !== 'withdrawn' &&
          m.state !== 'overturned' &&
          m.source !== 'auto',
      );
      out.set(c.id, {
        noShows: mine.map((m) => this.view(m, viewerId, now)),
        canMarkNoShow:
          enabled &&
          c.status === 'confirmed' &&
          !already &&
          now >= c.starts_at.getTime() + grace * MIN_MS &&
          now <= c.ends_at.getTime() + markHours * HOUR_MS,
      });
    }
    return out;
  }

  private view(
    m: ConsultationNoShow,
    viewerId: string,
    now: number,
  ): NoShowView {
    const isAbsent = m.absent_user_id === viewerId;
    return {
      id: m.id,
      absentSide: m.absent_side as Side,
      state: m.state as NoShowView['state'],
      source: m.source as NoShowView['source'],
      markedAt: m.marked_at.toISOString(),
      disputeUntil: m.dispute_until.toISOString(),
      disputeReason: m.dispute_reason,
      viewerIsAbsent: isAbsent,
      canDispute:
        isAbsent && m.state === 'open' && m.dispute_until.getTime() >= now,
      canWithdraw:
        m.marked_by_id === viewerId &&
        (m.state === 'open' ||
          m.state === 'disputed' ||
          m.state === 'confirmed'),
    };
  }

  // --- the sweep (called from the every-minute consultation job) -------------------

  async sweep(now: Date = new Date()): Promise<NoShowSweepResult> {
    const finalized = await this.finalizeDue(now);
    const detected = (await this.settings.boolean(
      'consultations.no_show_auto_detect',
    ))
      ? await this.detect(now)
      : 0;
    return { finalized, detected };
  }

  /** Dispute window over, nobody objected: the mark becomes final. */
  private async finalizeDue(now: Date): Promise<number> {
    const due = await this.prisma.consultationNoShow.findMany({
      where: { state: 'open', dispute_until: { lte: now } },
      take: BATCH,
    });
    let n = 0;
    for (const row of due) {
      const done = await withTxRetry(this.prisma, async (tx) => {
        const next = row.source === 'auto' ? 'unconfirmed' : 'confirmed';
        const { count } = await tx.consultationNoShow.updateMany({
          where: { id: row.id, state: 'open' },
          data: { state: next, resolved_at: now },
        });
        if (count === 0) return false;
        if (next === 'confirmed') await this.count(tx, row, now);
        return true;
      });
      if (done) n += 1;
    }
    return n;
  }

  /** Nobody joined a call: a suggestion for the people to confirm or dispute. */
  private async detect(now: Date): Promise<number> {
    const [disputeHours, grace] = await Promise.all([
      this.settings.number('consultations.no_show_dispute_hours'),
      this.settings.number('consultations.no_show_grace_minutes'),
    ]);
    const cs = await this.prisma.consultation.findMany({
      where: {
        status: 'confirmed',
        attendance_checked_at: null,
        ends_at: {
          lte: new Date(now.getTime() - AUTO_TAIL_MS),
          gt: new Date(now.getTime() - AUTO_LOOKBACK_MS),
        },
      },
      take: BATCH,
    });
    let n = 0;
    for (const c of cs) {
      const { count } = await this.prisma.consultation.updateMany({
        where: { id: c.id, attendance_checked_at: null },
        data: { attendance_checked_at: now },
      });
      if (count === 0 || !c.conversation_id) continue;
      const calls = await this.prisma.call.findMany({
        where: {
          conversation_id: c.conversation_id,
          created_at: {
            gte: new Date(c.starts_at.getTime() - 15 * MIN_MS),
            lte: new Date(c.ends_at.getTime() + HOUR_MS),
          },
        },
        select: { caller_id: true, callee_id: true, answered_at: true },
        take: 50,
      });
      // Too short a slot to judge (less than the grace window).
      if (c.ends_at.getTime() - c.starts_at.getTime() < grace * MIN_MS)
        continue;
      for (const side of absentSides(calls, c.attorney_id, c.client_id)) {
        const absentUser = side === 'attorney' ? c.attorney_id : c.client_id;
        const made = await this.prisma.consultationNoShow.createMany({
          data: [
            {
              consultation_id: c.id,
              absent_side: side,
              absent_user_id: absentUser,
              source: 'auto',
              dispute_until: new Date(now.getTime() + disputeHours * HOUR_MS),
            },
          ],
          skipDuplicates: true,
        });
        if (made.count > 0) {
          n += 1;
          await this.notify(absentUser, c, 'no_show_auto');
        }
      }
    }
    return n;
  }

  // --- admin ----------------------------------------------------------------------

  async adminList(state: string | undefined, take = 50) {
    return this.prisma.consultationNoShow.findMany({
      where: state ? { state } : { state: 'disputed' },
      orderBy: { marked_at: 'desc' },
      take: Math.min(take, 200),
    });
  }

  /** One decision, no second approval (the controller checks the fresh 2FA). */
  async adminResolve(
    id: string,
    decision: 'uphold' | 'overturn',
    adminId: string,
    note?: string,
  ): Promise<ConsultationNoShow> {
    const now = new Date();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const cur = await tx.consultationNoShow.findUnique({ where: { id } });
      if (!cur) throw this.notFound();
      if (cur.state === 'withdrawn') throw this.conflict();
      const upheld = decision === 'uphold';
      const updated = await tx.consultationNoShow.update({
        where: { id },
        data: {
          state: upheld ? 'confirmed' : 'overturned',
          resolved_at: now,
          resolved_by_admin: adminId,
          resolution_note: note?.trim().slice(0, 500) || null,
        },
      });
      if (upheld) await this.count(tx, cur, now);
      else {
        await this.uncount(tx, cur);
        await this.bump(tx, cur.absent_user_id, { overturned_count: 1 });
      }
      return updated;
    });
    const c = await this.prisma.consultation.findUnique({
      where: { id: row.consultation_id },
    });
    if (c) {
      await this.notify(row.absent_user_id, c, 'no_show_resolved');
      if (row.marked_by_id)
        await this.notify(row.marked_by_id, c, 'no_show_resolved');
    }
    return row;
  }

  // --- counters (stored only) ------------------------------------------------------

  private async count(
    tx: Prisma.TransactionClient,
    row: ConsultationNoShow,
    now: Date,
  ): Promise<void> {
    const { count } = await tx.consultationNoShow.updateMany({
      where: { id: row.id, counted_at: null },
      data: { counted_at: now },
    });
    if (count === 0) return;
    await tx.consultationAttendanceStat.upsert({
      where: { user_id: row.absent_user_id },
      create: {
        user_id: row.absent_user_id,
        no_show_count: 1,
        last_no_show_at: now,
      },
      update: { no_show_count: { increment: 1 }, last_no_show_at: now },
    });
  }

  private async uncount(
    tx: Prisma.TransactionClient,
    row: ConsultationNoShow,
  ): Promise<void> {
    const { count } = await tx.consultationNoShow.updateMany({
      where: { id: row.id, counted_at: { not: null } },
      data: { counted_at: null },
    });
    if (count === 0) return;
    await tx.consultationAttendanceStat.updateMany({
      where: { user_id: row.absent_user_id, no_show_count: { gt: 0 } },
      data: { no_show_count: { decrement: 1 } },
    });
  }

  private async bump(
    tx: Prisma.TransactionClient,
    userId: string,
    inc: { disputed_count?: number; overturned_count?: number },
  ): Promise<void> {
    await tx.consultationAttendanceStat.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...inc },
      update: Object.fromEntries(
        Object.entries(inc).map(([k, v]) => [k, { increment: v }]),
      ),
    });
  }

  // --- helpers ----------------------------------------------------------------------

  private async notify(
    recipientId: string,
    c: Pick<Consultation, 'id' | 'starts_at'>,
    kind: string,
  ): Promise<void> {
    await this.notifications
      .emit({
        type: 'consultation_update',
        recipientId,
        payload: {
          kind,
          consultationId: c.id,
          startsAt: c.starts_at.toISOString(),
        },
      })
      .catch((e: unknown) =>
        this.logger.warn({ err: String(e) }, 'no-show notice failed'),
      );
  }

  private async mine(id: string, userId: string): Promise<Consultation> {
    const c = await this.prisma.consultation.findFirst({
      where: { id, OR: [{ attorney_id: userId }, { client_id: userId }] },
    });
    if (!c) throw this.notFound();
    return c;
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.settings.boolean('consultations.no_show_enabled'))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Marking a missed consultation is switched off.',
      });
    }
  }

  private assertMayManage(user: RequestUser): void {
    if (user.assistant && !user.assistant.duties.includes('tasks')) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'tasks' },
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }

  private conflict(): ConflictException {
    return new ConflictException({
      code: ErrorCode.CONSULTATION_STATE_CONFLICT,
      message: 'This cannot be done now.',
    });
  }
}
