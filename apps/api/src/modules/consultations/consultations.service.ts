import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Consultation, Prisma } from '@prisma/client';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import {
  addDaysIso,
  isValidTimeZone,
  parseIsoDate,
} from '../../common/utils/zoned-time';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { ChatSystemMessages } from '../chat/chat-system.service';
import type { ChatChange } from '../chat/chat-system.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { generateSlots, localDateOf } from './consultation-slots';
import {
  type ConsultationDto,
  type ConsultationPage,
  type ConsultationSettingsDto,
  type ConsultationSlotsDto,
  type CreateConsultationDto,
  type ConsultationSlotsQueryDto,
  type ConsultationsQueryDto,
  type UpdateConsultationSettingsDto,
} from './consultations.dto';

const PAGE = 20;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A call button shows this long before the start and this long after the end. */
const CALL_LEAD_MS = 10 * 60_000;
const CALL_TAIL_MS = 60 * 60_000;
const ACTIVE = ['pending', 'confirmed'] as const;

/** What a push / the bell says (`notif.consult.<kind>`). */
export type ConsultationNoticeKind =
  | 'requested'
  | 'booked'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'rescheduled'
  | 'expired'
  | 'reminder_day'
  | 'reminder_hour';

function fullName(u: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

/**
 * Owner 2026-10-20: booking a consultation. The attorney publishes weekly
 * hours; a client picks a free slot on the profile; the attorney confirms
 * (or the slot confirms itself). Both sides get it in their Planner and as
 * a line in the chat with a «Call» button; pushes remind a day and an hour
 * before. No payment: client → attorney money is off.
 */
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatSystem: ChatSystemMessages,
    private readonly flags: FeatureFlagsService,
    private readonly limits: UsageLimitsService,
    private readonly settings: AppSettingsService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly blocks: BlocksService,
    private readonly files: FilesService,
  ) {}

  // --- the attorney's schedule ---------------------------------------------

  async getSettings(user: RequestUser): Promise<ConsultationSettingsDto> {
    this.assertAttorney(user);
    return this.settingsOf(user.sub);
  }

  async updateSettings(
    user: RequestUser,
    dto: UpdateConsultationSettingsDto,
  ): Promise<ConsultationSettingsDto> {
    this.assertAttorney(user);
    this.assertMayManage(user);
    if (!isValidTimeZone(dto.timezone)) {
      throw this.invalid('timezone', 'Unknown time zone.');
    }
    this.validateWindows(dto);
    const today = new Date().toISOString().slice(0, 10);
    for (const o of dto.timeOff) {
      if (!parseIsoDate(o.startsOn) || !parseIsoDate(o.endsOn)) {
        throw this.invalid('timeOff', 'Bad date.');
      }
      if (o.endsOn < o.startsOn) {
        throw this.invalid('timeOff', 'A day off ends before it starts.');
      }
      if (o.endsOn < addDaysIso(today, -1)) {
        throw this.invalid('timeOff', 'A day off is already in the past.');
      }
    }
    if (dto.enabled) {
      const profile = await this.prisma.attorneyProfile.findUnique({
        where: { user_id: user.sub },
        select: { verification_status: true },
      });
      if (profile?.verification_status !== 'verified') {
        throw new ForbiddenException({
          code: ErrorCode.ATTORNEY_NOT_VERIFIED,
          message: 'Only a verified attorney takes bookings.',
        });
      }
      if (dto.windows.length === 0) {
        throw this.invalid('windows', 'Add at least one weekly window.');
      }
    }
    await withTxRetry(this.prisma, async (tx) => {
      const data = {
        enabled: dto.enabled,
        slot_minutes: dto.slotMinutes,
        buffer_minutes: dto.bufferMinutes,
        min_notice_hours: dto.minNoticeHours,
        horizon_days: dto.horizonDays,
        auto_confirm: dto.autoConfirm,
      };
      await tx.consultationSettings.upsert({
        where: { attorney_id: user.sub },
        create: { attorney_id: user.sub, ...data },
        update: data,
      });
      await tx.consultationWindow.deleteMany({
        where: { attorney_id: user.sub },
      });
      await tx.consultationWindow.createMany({
        data: dto.windows.map((w) => ({
          attorney_id: user.sub,
          weekday: w.weekday,
          start_minute: w.startMinute,
          end_minute: w.endMinute,
        })),
      });
      await tx.consultationTimeOff.deleteMany({
        where: { attorney_id: user.sub },
      });
      await tx.consultationTimeOff.createMany({
        data: dto.timeOff.map((o) => ({
          attorney_id: user.sub,
          starts_on: new Date(`${o.startsOn}T00:00:00Z`),
          ends_on: new Date(`${o.endsOn}T00:00:00Z`),
          note: o.note?.trim() || null,
        })),
      });
      await tx.user.update({
        where: { id: user.sub },
        data: { timezone: dto.timezone },
      });
    });
    return this.settingsOf(user.sub);
  }

  private validateWindows(dto: UpdateConsultationSettingsDto): void {
    for (const w of dto.windows) {
      if (w.endMinute <= w.startMinute) {
        throw this.invalid('windows', 'A window ends before it starts.');
      }
      if (w.endMinute - w.startMinute < dto.slotMinutes) {
        throw this.invalid('windows', 'A window is shorter than one slot.');
      }
    }
    for (let day = 1; day <= 7; day++) {
      const list = dto.windows
        .filter((w) => w.weekday === day)
        .sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < list.length; i++) {
        if (list[i].startMinute < list[i - 1].endMinute) {
          throw this.invalid('windows', 'Two windows overlap.');
        }
      }
    }
  }

  private async settingsOf(attorneyId: string): Promise<ConsultationSettingsDto> {
    const [row, windows, timeOff, user, profile, subscribed] =
      await Promise.all([
        this.prisma.consultationSettings.findUnique({
          where: { attorney_id: attorneyId },
        }),
        this.prisma.consultationWindow.findMany({
          where: { attorney_id: attorneyId },
          orderBy: [{ weekday: 'asc' }, { start_minute: 'asc' }],
        }),
        this.prisma.consultationTimeOff.findMany({
          where: {
            attorney_id: attorneyId,
            ends_on: { gte: new Date(Date.now() - DAY_MS) },
          },
          orderBy: { starts_on: 'asc' },
        }),
        this.prisma.user.findUnique({
          where: { id: attorneyId },
          select: { timezone: true },
        }),
        this.prisma.attorneyProfile.findUnique({
          where: { user_id: attorneyId },
          select: { verification_status: true },
        }),
        this.subscriptions.isActive(attorneyId),
      ]);
    const timezone = user?.timezone ?? null;
    const enabled = row?.enabled ?? false;
    let reason: string | null = null;
    if (enabled) {
      if (profile?.verification_status !== 'verified') reason = 'not_verified';
      else if (!subscribed) reason = 'no_subscription';
      else if (windows.length === 0) reason = 'no_hours';
      else if (!timezone) reason = 'no_timezone';
    }
    return {
      enabled,
      slotMinutes: row?.slot_minutes ?? 30,
      bufferMinutes: row?.buffer_minutes ?? 0,
      minNoticeHours: row?.min_notice_hours ?? 12,
      horizonDays: row?.horizon_days ?? 30,
      autoConfirm: row?.auto_confirm ?? false,
      timezone,
      windows: windows.map((w) => ({
        weekday: w.weekday,
        startMinute: w.start_minute,
        endMinute: w.end_minute,
      })),
      timeOff: timeOff.map((o) => ({
        startsOn: o.starts_on.toISOString().slice(0, 10),
        endsOn: o.ends_on.toISOString().slice(0, 10),
        ...(o.note ? { note: o.note } : {}),
      })),
      bookable: enabled && reason === null,
      notBookableReason: reason,
    };
  }

  /** True when the attorney takes bookings right now (profile badge). */
  async isBookable(attorneyId: string): Promise<boolean> {
    return (await this.settingsOf(attorneyId)).bookable;
  }

  /** The profile screens ask this for many attorneys at once. */
  async bookableAmong(attorneyIds: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (attorneyIds.length === 0) return out;
    const rows = await this.prisma.consultationSettings.findMany({
      where: { attorney_id: { in: attorneyIds }, enabled: true },
      select: { attorney_id: true },
    });
    for (const r of rows) {
      if (await this.isBookable(r.attorney_id)) out.add(r.attorney_id);
    }
    return out;
  }

  // --- free slots ---------------------------------------------------------

  async slots(
    user: RequestUser,
    q: ConsultationSlotsQueryDto,
  ): Promise<ConsultationSlotsDto> {
    await this.assertEnabled();
    const attorney = await this.loadBookable(q.attorneyId);
    await this.blocks.assertNotBlocked(user.sub, q.attorneyId);
    const days = q.days ?? 7;
    const now = new Date();
    const today = localDateOf(now, attorney.timezone);
    const last = addDaysIso(today, attorney.horizonDays);
    let from = q.from ?? today;
    if (!parseIsoDate(from)) throw this.invalid('from', 'Bad date.');
    if (from < today) from = today;
    let to = addDaysIso(from, days - 1);
    if (to > last) to = last;
    const slots =
      from > last
        ? []
        : await this.slotsBetween(attorney, from, to, now, undefined);
    return {
      attorneyId: q.attorneyId,
      timezone: attorney.timezone,
      slotMinutes: attorney.slotMinutes,
      autoConfirm: attorney.autoConfirm,
      from,
      days,
      slots: slots.map((s) => s.toISOString()),
    };
  }

  private async slotsBetween(
    a: BookableAttorney,
    from: string,
    to: string,
    now: Date,
    ignoreId: string | undefined,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Date[]> {
    const lo = new Date(`${from}T00:00:00Z`);
    const busy = await db.consultation.findMany({
      where: {
        attorney_id: a.id,
        status: { in: [...ACTIVE] },
        starts_at: {
          gte: new Date(lo.getTime() - DAY_MS),
          lte: new Date(new Date(`${to}T00:00:00Z`).getTime() + 3 * DAY_MS),
        },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { starts_at: true, ends_at: true },
    });
    return generateSlots({
      timeZone: a.timezone,
      rules: {
        slotMinutes: a.slotMinutes,
        bufferMinutes: a.bufferMinutes,
        minNoticeHours: a.minNoticeHours,
        horizonDays: a.horizonDays,
      },
      windows: a.windows,
      timeOff: a.timeOff,
      busy: busy.map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at })),
      now,
      fromDate: from,
      toDate: to,
    });
  }

  private async loadBookable(
    attorneyId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<BookableAttorney> {
    const s = await this.settingsOf(attorneyId);
    const user = await db.user.findFirst({
      where: { id: attorneyId, role: 'attorney', status: 'active' },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attorney not found.',
      });
    }
    if (!s.bookable || !s.timezone) {
      throw new ConflictException({
        code: ErrorCode.CONSULTATION_NOT_AVAILABLE,
        message: 'This attorney does not take bookings now.',
      });
    }
    return {
      id: attorneyId,
      timezone: s.timezone,
      slotMinutes: s.slotMinutes,
      bufferMinutes: s.bufferMinutes,
      minNoticeHours: s.minNoticeHours,
      horizonDays: s.horizonDays,
      autoConfirm: s.autoConfirm,
      windows: s.windows,
      timeOff: s.timeOff,
    };
  }

  // --- bookings -----------------------------------------------------------

  async create(
    user: RequestUser,
    dto: CreateConsultationDto,
  ): Promise<ConsultationDto> {
    await this.assertEnabled();
    if (user.role !== 'client' || user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only a client books a consultation.',
      });
    }
    await this.limits.consume('consultation_book', user.sub);
    const attorney = await this.loadBookable(dto.attorneyId);
    await this.blocks.assertNotBlocked(user.sub, dto.attorneyId);
    const startsAt = new Date(dto.startsAt);
    const now = new Date();

    const max = await this.settings.number('consultations.max_active_per_client');
    const held = await this.prisma.consultation.count({
      where: {
        client_id: user.sub,
        status: { in: [...ACTIVE] },
        ends_at: { gt: now },
      },
    });
    if (max > 0 && held >= max) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many upcoming consultations.',
          details: { reason: 'active_limit', max },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (dto.caseId) {
      const mine = await this.prisma.case.findFirst({
        where: { id: dto.caseId, client_id: user.sub },
        select: { id: true },
      });
      if (!mine) {
        throw new NotFoundException({
          code: ErrorCode.CASE_NOT_FOUND,
          message: 'Case not found.',
        });
      }
    }

    const changes: ChatChange[] = [];
    const row = await withTxRetry(this.prisma, async (tx) => {
      changes.length = 0;
      await this.assertSlotFree(tx, attorney, startsAt, now, undefined);
      const client = await tx.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { first_name: true, last_name: true },
      });
      const attorneyUser = await tx.user.findUniqueOrThrow({
        where: { id: attorney.id },
        select: { first_name: true, last_name: true },
      });
      const confirmed = attorney.autoConfirm;
      const created = await tx.consultation.create({
        data: {
          attorney_id: attorney.id,
          client_id: user.sub,
          starts_at: startsAt,
          ends_at: new Date(startsAt.getTime() + attorney.slotMinutes * 60_000),
          status: confirmed ? 'confirmed' : 'pending',
          confirmed_at: confirmed ? now : null,
          note: dto.note?.trim() || null,
          case_id: dto.caseId ?? null,
        },
      });
      const conversationId = await this.ensureChat(tx, created, confirmed);
      const withChat = await tx.consultation.update({
        where: { id: created.id },
        data: { conversation_id: conversationId },
      });
      changes.push(
        ...(await this.chatSystem.post(
          tx,
          { id: conversationId },
          'consult',
          { param: created.id },
        )),
      );
      await this.syncMirrors(tx, withChat, {
        attorneyName: fullName(attorneyUser),
        clientName: fullName(client),
      });
      return withChat;
    });
    this.chatSystem.publish(changes);
    await this.notify(
      row.attorney_id,
      row.attorney_id === row.client_id ? null : user.sub,
      row,
      row.status === 'confirmed' ? 'booked' : 'requested',
    );
    if (row.status === 'confirmed') {
      await this.notify(row.client_id, row.attorney_id, row, 'confirmed');
    }
    return this.one(row.id, user.sub);
  }

  /** The slot must be one the attorney offers right now (not just free). */
  private async assertSlotFree(
    tx: Prisma.TransactionClient,
    a: BookableAttorney,
    startsAt: Date,
    now: Date,
    ignoreId: string | undefined,
  ): Promise<void> {
    const day = localDateOf(startsAt, a.timezone);
    const free = await this.slotsBetween(a, day, day, now, ignoreId, tx);
    if (!free.some((s) => s.getTime() === startsAt.getTime())) {
      throw new ConflictException({
        code: ErrorCode.CONSULTATION_SLOT_TAKEN,
        message: 'This time is no longer available.',
      });
    }
  }

  /** The direct chat of the pair (created when new) and the booking line. */
  private async ensureChat(
    tx: Prisma.TransactionClient,
    c: Consultation,
    confirmed: boolean,
  ): Promise<string> {
    const pair = {
      attorney_id: c.attorney_id,
      client_id: c.client_id,
      pair_kind: 'attorney_client' as const,
      case_id: null,
    };
    const existing = await tx.conversation.findFirst({ where: pair });
    if (existing) {
      if (confirmed) await this.unlockChat(tx, existing.id);
      return existing.id;
    }
    const created = await tx.conversation.create({
      data: {
        ...pair,
        status: 'active',
        // The attorney offered the slots: no message request to accept.
        request_status: 'accepted',
        requested_by: c.client_id,
        contacts_unlocked: confirmed,
        participants: {
          create: [{ user_id: c.attorney_id }, { user_id: c.client_id }],
        },
      },
    });
    return created.id;
  }

  /** A confirmed consultation opens calls in the pair's direct chat. */
  private async unlockChat(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<void> {
    await tx.conversation.updateMany({
      where: { id: conversationId, status: { not: 'closed' } },
      data: { contacts_unlocked: true, request_status: 'accepted' },
    });
  }

  async list(
    user: RequestUser,
    q: ConsultationsQueryDto,
  ): Promise<ConsultationPage> {
    const view = q.view ?? 'upcoming';
    const now = new Date();
    const mine: Prisma.ConsultationWhereInput = {
      OR: [{ attorney_id: user.sub }, { client_id: user.sub }],
    };
    const where: Prisma.ConsultationWhereInput[] = [mine];
    const asc = view !== 'past';
    if (view === 'upcoming') {
      where.push({ status: { in: [...ACTIVE] }, ends_at: { gt: now } });
    } else if (view === 'pending') {
      where.push({ status: 'pending', ends_at: { gt: now } });
    } else {
      where.push({
        OR: [
          { status: { in: ['declined', 'cancelled'] } },
          { ends_at: { lte: now } },
        ],
      });
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      where.push(
        asc
          ? {
              OR: [
                { starts_at: { gt: c.createdAt } },
                { starts_at: c.createdAt, id: { gt: c.id } },
              ],
            }
          : {
              OR: [
                { starts_at: { lt: c.createdAt } },
                { starts_at: c.createdAt, id: { lt: c.id } },
              ],
            },
      );
    }
    const rows = await this.prisma.consultation.findMany({
      where: { AND: where },
      orderBy: [{ starts_at: asc ? 'asc' : 'desc' }, { id: asc ? 'asc' : 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page, user.sub),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.starts_at, id: last.id })
          : null,
    };
  }

  async get(user: RequestUser, id: string): Promise<ConsultationDto> {
    return this.one(id, user.sub);
  }

  async confirm(user: RequestUser, id: string): Promise<ConsultationDto> {
    this.assertAttorney(user);
    this.assertMayManage(user);
    const changes: ChatChange[] = [];
    const now = new Date();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const c = await this.mineAs(tx, id, user.sub, 'attorney');
      if (c.status !== 'pending' || c.ends_at <= now) {
        throw this.stateConflict();
      }
      const updated = await tx.consultation.update({
        where: { id },
        data: { status: 'confirmed', confirmed_at: now },
      });
      if (updated.conversation_id) {
        await this.unlockChat(tx, updated.conversation_id);
      }
      await this.syncMirrors(tx, updated);
      return updated;
    });
    this.chatSystem.publish(changes);
    await this.notify(row.client_id, row.attorney_id, row, 'confirmed');
    return this.one(id, user.sub);
  }

  async decline(
    user: RequestUser,
    id: string,
    reason?: string,
  ): Promise<ConsultationDto> {
    this.assertAttorney(user);
    this.assertMayManage(user);
    const row = await withTxRetry(this.prisma, async (tx) => {
      const c = await this.mineAs(tx, id, user.sub, 'attorney');
      if (c.status !== 'pending') throw this.stateConflict();
      const updated = await tx.consultation.update({
        where: { id },
        data: {
          status: 'declined',
          cancelled_by_id: user.sub,
          cancel_reason: reason?.trim() || null,
        },
      });
      await this.syncMirrors(tx, updated);
      return updated;
    });
    await this.notify(row.client_id, row.attorney_id, row, 'declined');
    return this.one(id, user.sub);
  }

  async cancel(
    user: RequestUser,
    id: string,
    reason?: string,
  ): Promise<ConsultationDto> {
    const now = new Date();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const c = await this.mineAny(tx, id, user.sub);
      if (c.attorney_id === user.sub) this.assertMayManage(user);
      if (!ACTIVE.includes(c.status as (typeof ACTIVE)[number]) || c.ends_at <= now) {
        throw this.stateConflict();
      }
      const updated = await tx.consultation.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelled_by_id: user.sub,
          cancel_reason: reason?.trim() || null,
        },
      });
      await this.syncMirrors(tx, updated);
      return updated;
    });
    const other = row.attorney_id === user.sub ? row.client_id : row.attorney_id;
    await this.notify(other, user.sub, row, 'cancelled');
    return this.one(id, user.sub);
  }

  /**
   * The client moves their booking to another free slot (it needs the
   * attorney's confirmation again unless bookings confirm themselves); the
   * attorney moves it to any time that does not clash — the client is told.
   */
  async reschedule(
    user: RequestUser,
    id: string,
    startsAtIso: string,
  ): Promise<ConsultationDto> {
    const startsAt = new Date(startsAtIso);
    const now = new Date();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const c = await this.mineAny(tx, id, user.sub);
      const asAttorney = c.attorney_id === user.sub;
      if (asAttorney) this.assertMayManage(user);
      if (!ACTIVE.includes(c.status as (typeof ACTIVE)[number]) || c.ends_at <= now) {
        throw this.stateConflict();
      }
      const durationMs = c.ends_at.getTime() - c.starts_at.getTime();
      let status = c.status;
      if (asAttorney) {
        if (startsAt.getTime() <= now.getTime()) {
          throw this.invalid('startsAt', 'The new time is in the past.');
        }
        const clash = await tx.consultation.count({
          where: {
            attorney_id: c.attorney_id,
            id: { not: c.id },
            status: { in: [...ACTIVE] },
            starts_at: { lt: new Date(startsAt.getTime() + durationMs) },
            ends_at: { gt: startsAt },
          },
        });
        if (clash > 0) {
          throw new ConflictException({
            code: ErrorCode.CONSULTATION_SLOT_TAKEN,
            message: 'This time clashes with another booking.',
          });
        }
      } else {
        const attorney = await this.loadBookable(c.attorney_id, tx);
        await this.assertSlotFree(tx, attorney, startsAt, now, c.id);
        status = attorney.autoConfirm ? 'confirmed' : 'pending';
      }
      const updated = await tx.consultation.update({
        where: { id },
        data: {
          starts_at: startsAt,
          ends_at: new Date(startsAt.getTime() + durationMs),
          status,
          confirmed_at: status === 'confirmed' ? (c.confirmed_at ?? now) : null,
          rescheduled_at: now,
          reminded_day_at: null,
          reminded_hour_at: null,
        },
      });
      await this.syncMirrors(tx, updated);
      return updated;
    });
    const other = row.attorney_id === user.sub ? row.client_id : row.attorney_id;
    await this.notify(
      other,
      user.sub,
      row,
      row.attorney_id === other && row.status === 'pending'
        ? 'requested'
        : 'rescheduled',
    );
    return this.one(id, user.sub);
  }

  // --- planner mirrors, chat, notices ---------------------------------------

  /**
   * One Planner entry per side, kind «consultation», at the booking's time.
   * The booking owns the time: the entry follows every change; a declined
   * or cancelled booking cancels it (archive).
   */
  async syncMirrors(
    tx: Prisma.TransactionClient,
    c: Consultation,
    names?: { attorneyName: string; clientName: string },
  ): Promise<void> {
    const active = ACTIVE.includes(c.status as (typeof ACTIVE)[number]);
    const people =
      names ??
      (await (async () => {
        const [a, cl] = await Promise.all([
          tx.user.findUnique({
            where: { id: c.attorney_id },
            select: { first_name: true, last_name: true },
          }),
          tx.user.findUnique({
            where: { id: c.client_id },
            select: { first_name: true, last_name: true },
          }),
        ]);
        return {
          attorneyName: a ? fullName(a) : '',
          clientName: cl ? fullName(cl) : '',
        };
      })());
    const sides = [
      { userId: c.attorney_id, title: people.clientName, caseId: null },
      { userId: c.client_id, title: people.attorneyName, caseId: c.case_id },
    ];
    for (const side of sides) {
      const data = {
        kind: 'consultation' as const,
        title: side.title || 'Consultation',
        notes: c.note,
        due_at: c.starts_at,
        case_id: side.caseId,
        remind_before_min: null,
        remind_at: null,
        reminded_at: null,
        status: active ? ('open' as const) : ('cancelled' as const),
        archived_at: active ? null : new Date(),
      };
      const existing = await tx.attorneyTask.findFirst({
        where: { attorney_id: side.userId, consultation_id: c.id },
        select: { id: true },
      });
      if (existing) {
        await tx.attorneyTask.update({ where: { id: existing.id }, data });
      } else {
        await tx.attorneyTask.create({
          data: { ...data, attorney_id: side.userId, consultation_id: c.id },
        });
      }
    }
  }

  async notify(
    recipientId: string,
    actorId: string | null,
    c: Pick<Consultation, 'id' | 'starts_at'>,
    kind: ConsultationNoticeKind,
  ): Promise<void> {
    await this.notifications.emit({
      type: 'consultation_update',
      recipientId,
      payload: {
        kind,
        consultationId: c.id,
        startsAt: c.starts_at.toISOString(),
        ...(actorId ? { actorId } : {}),
      },
    });
  }

  // --- presenting -----------------------------------------------------------

  private async one(id: string, viewerId: string): Promise<ConsultationDto> {
    const row = await this.prisma.consultation.findFirst({
      where: {
        id,
        OR: [{ attorney_id: viewerId }, { client_id: viewerId }],
      },
    });
    if (!row) throw this.notFound();
    return (await this.present([row], viewerId))[0];
  }

  private async present(
    rows: Consultation[],
    viewerId: string,
  ): Promise<ConsultationDto[]> {
    if (rows.length === 0) return [];
    const otherOf = (c: Consultation) =>
      c.attorney_id === viewerId ? c.client_id : c.attorney_id;
    const ids = [
      ...new Set([
        ...rows.map(otherOf),
        ...rows.map((c) => c.attorney_id),
      ]),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        timezone: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    const now = Date.now();
    return rows.map((c) => {
      const other = byId.get(otherOf(c));
      const attorney = byId.get(c.attorney_id);
      const cancelledBy =
        c.cancelled_by_id === null
          ? c.status === 'cancelled'
            ? ('system' as const)
            : null
          : c.cancelled_by_id === c.attorney_id
            ? ('attorney' as const)
            : ('client' as const);
      return {
        id: c.id,
        status: c.status,
        startsAt: c.starts_at.toISOString(),
        endsAt: c.ends_at.toISOString(),
        viewerRole: c.attorney_id === viewerId ? 'attorney' : 'client',
        counterpart: {
          id: otherOf(c),
          displayName: other ? fullName(other) : '',
          username:
            other?.attorney_profile?.username ??
            other?.client_profile?.username ??
            null,
          avatarUrl: other?.avatar_file_id
            ? (avatars.get(other.avatar_file_id)?.url256 ?? null)
            : null,
        },
        attorneyTimezone: attorney?.timezone ?? 'UTC',
        note: c.note,
        caseId: c.case_id,
        conversationId: c.conversation_id,
        cancelReason: c.cancel_reason,
        cancelledBy,
        rescheduledAt: c.rescheduled_at?.toISOString() ?? null,
        canCall:
          c.status === 'confirmed' &&
          c.conversation_id !== null &&
          now >= c.starts_at.getTime() - CALL_LEAD_MS &&
          now <= c.ends_at.getTime() + CALL_TAIL_MS,
        createdAt: c.created_at.toISOString(),
      };
    });
  }

  // --- guards ---------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled('consultations', true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Booking a consultation is switched off.',
      });
    }
  }

  private assertAttorney(user: RequestUser): void {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only an attorney does this.',
      });
    }
  }

  /** The attorney, or an assistant the attorney gave the tasks duty. */
  private assertMayManage(user: RequestUser): void {
    if (user.assistant && !user.assistant.duties.includes('tasks')) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'tasks' },
      });
    }
  }

  private async mineAs(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    side: 'attorney' | 'client',
  ): Promise<Consultation> {
    const c = await tx.consultation.findFirst({
      where: side === 'attorney' ? { id, attorney_id: userId } : { id, client_id: userId },
    });
    if (!c) throw this.notFound();
    return c;
  }

  private async mineAny(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ): Promise<Consultation> {
    const c = await tx.consultation.findFirst({
      where: { id, OR: [{ attorney_id: userId }, { client_id: userId }] },
    });
    if (!c) throw this.notFound();
    return c;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Consultation not found.',
    });
  }

  private stateConflict(): ConflictException {
    return new ConflictException({
      code: ErrorCode.CONSULTATION_STATE_CONFLICT,
      message: 'This booking can no longer be changed that way.',
    });
  }

  private invalid(field: string, message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      details: { field },
    });
  }
}

interface BookableAttorney {
  id: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  autoConfirm: boolean;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
  timeOff: { startsOn: string; endsOn: string }[];
}
