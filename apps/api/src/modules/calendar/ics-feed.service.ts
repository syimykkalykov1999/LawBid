import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { DeadlinesService } from '../deadlines/deadlines.service';
import { CalendarConfig } from './calendar-config.service';
import { buildIcs, type IcsCategory, type IcsEvent } from './ics-builder';

const DAY_MS = 86_400_000;
/** The feed looks back and ahead this far. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;
const CAP = 500;
const MIN_MS = 60_000;
/** A poll updates «last used» at most this often. */
const TOUCH_EVERY_MS = 10 * MIN_MS;

const COURT_KINDS = new Set([
  'court',
  'hearing_prep',
  'deposition',
  'mediation',
  'jail_visit',
]);
const DEADLINE_KINDS = new Set(['deadline', 'filing']);

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface FeedStatus {
  hasLink: boolean;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export interface BuiltFeed {
  body: string;
  etag: string;
  lastModified: Date;
}

/** Pure: how a planner task shows in the calendar. */
export function taskShape(kind: string): {
  category: IcsCategory;
  minutes: number;
  alarmSeconds: number;
} {
  if (COURT_KINDS.has(kind)) {
    return { category: 'court', minutes: 90, alarmSeconds: DAY_MS / 1000 };
  }
  if (DEADLINE_KINDS.has(kind)) {
    return { category: 'deadline', minutes: 30, alarmSeconds: DAY_MS / 1000 };
  }
  return { category: 'task', minutes: 30, alarmSeconds: 15 * 60 };
}

/**
 * Owner 2026-10-28: a person's read-only calendar feed (RFC 5545). Content:
 * confirmed / pending consultations (cancelled ones of the last two weeks go
 * out as CANCELLED so calendars drop them), planner tasks and court dates,
 * the case's own date (whole day) and open case tasks. Everything is the
 * person's own data; the link is a secret (hash stored, revocable).
 */
@Injectable()
export class IcsFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: CalendarConfig,
    private readonly deadlines: DeadlinesService,
  ) {}

  // --- the secret link --------------------------------------------------------

  async status(userId: string): Promise<FeedStatus> {
    const row = await this.prisma.calendarFeedToken.findUnique({
      where: { user_id: userId },
    });
    return {
      hasLink: row !== null,
      createdAt: row?.created_at ?? null,
      lastUsedAt: row?.last_used_at ?? null,
    };
  }

  /** Makes a link, replacing the old one (which stops working at once). */
  async rotate(
    userId: string,
  ): Promise<{ url: string; webcalUrl: string; createdAt: Date }> {
    if (!(await this.cfg.feedEnabled())) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'The calendar link is switched off.',
      });
    }
    const token = `lbc_${randomBytes(32).toString('base64url')}`;
    const now = new Date();
    await this.prisma.calendarFeedToken.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        token_hash: hashToken(token),
        created_at: now,
      },
      update: {
        token_hash: hashToken(token),
        created_at: now,
        last_used_at: null,
        use_count: 0,
      },
    });
    const url = `${this.cfg.apiBase()}/calendar/feed/${token}.ics`;
    return {
      url,
      webcalUrl: url.replace(/^https?:/, 'webcal:'),
      createdAt: now,
    };
  }

  async revoke(userId: string): Promise<void> {
    await this.prisma.calendarFeedToken.deleteMany({
      where: { user_id: userId },
    });
  }

  /** The owner of a link, or null for an unknown / revoked / switched-off one. */
  async userForToken(token: string): Promise<string | null> {
    if (!/^lbc_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    if (!(await this.cfg.feedEnabled())) return null;
    const row = await this.prisma.calendarFeedToken.findUnique({
      where: { token_hash: hashToken(token) },
    });
    if (!row) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: row.user_id, status: 'active' },
      select: { id: true },
    });
    if (!user) return null;
    const now = Date.now();
    if (
      !row.last_used_at ||
      now - row.last_used_at.getTime() > TOUCH_EVERY_MS
    ) {
      await this.prisma.calendarFeedToken
        .updateMany({
          where: { id: row.id },
          data: { last_used_at: new Date(now), use_count: { increment: 1 } },
        })
        .catch(() => undefined);
    }
    return row.user_id;
  }

  // --- the calendar -----------------------------------------------------------

  async build(userId: string, now: Date = new Date()): Promise<BuiltFeed> {
    const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
    const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
    const [user, consultations, tasks, caseItems] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      }),
      this.prisma.consultation.findMany({
        where: {
          AND: [
            { OR: [{ attorney_id: userId }, { client_id: userId }] },
            {
              OR: [
                { status: { in: ['confirmed', 'pending'] } },
                { updated_at: { gte: new Date(now.getTime() - 14 * DAY_MS) } },
              ],
            },
          ],
          ends_at: { gte: from },
          starts_at: { lte: to },
        },
        take: CAP,
        orderBy: { starts_at: 'asc' },
      }),
      this.prisma.attorneyTask.findMany({
        where: {
          attorney_id: userId,
          consultation_id: null,
          case_task_id: null,
          archived_at: null,
          status: { in: ['open', 'taken'] },
          due_at: { gte: from, lte: to },
        },
        orderBy: { due_at: 'asc' },
        take: CAP,
      }),
      this.deadlines.calendarEvents(userId, from, to),
    ]);

    const names = await this.names(
      consultations.map((c) =>
        c.attorney_id === userId ? c.client_id : c.attorney_id,
      ),
    );
    const events: IcsEvent[] = [];
    const recentCancel = now.getTime() - 14 * DAY_MS;
    for (const c of consultations) {
      const live = c.status === 'confirmed' || c.status === 'pending';
      if (!live && c.updated_at.getTime() < recentCancel) continue;
      const other = names.get(
        c.attorney_id === userId ? c.client_id : c.attorney_id,
      );
      events.push({
        uid: `consultation-${c.id}@lawbid.app`,
        title: `Consultation${other ? `: ${other}` : ''}${c.status === 'pending' ? ' (to confirm)' : ''}`,
        description: 'Booked in LawBid. Open the chat in the app to call.',
        category: 'consultation',
        start: c.starts_at,
        end: c.ends_at,
        status: live
          ? c.status === 'confirmed'
            ? 'confirmed'
            : 'tentative'
          : 'cancelled',
        updatedAt: c.updated_at,
        alarmSeconds: 30 * 60,
      });
    }
    for (const t of tasks) {
      if (!t.due_at) continue;
      const shape = taskShape(t.kind);
      events.push({
        uid: `task-${t.id}@lawbid.app`,
        title: t.title.slice(0, 200),
        description: t.notes?.slice(0, 1000) ?? undefined,
        category: shape.category,
        start: t.due_at,
        end: new Date(t.due_at.getTime() + shape.minutes * MIN_MS),
        updatedAt: t.updated_at,
        alarmSeconds: shape.alarmSeconds,
      });
    }
    for (const e of caseItems) {
      if (e.date) {
        events.push({
          uid: `${e.uid}@lawbid.app`,
          title: e.title,
          category: 'deadline',
          date: e.date,
          updatedAt: e.updatedAt,
          alarmSeconds: DAY_MS / 1000,
        });
      } else if (e.dueAt) {
        events.push({
          uid: `${e.uid}@lawbid.app`,
          title: e.title,
          category: 'task',
          start: e.dueAt,
          end: new Date(e.dueAt.getTime() + 30 * MIN_MS),
          updatedAt: e.updatedAt,
          alarmSeconds: 15 * 60,
        });
      }
    }
    events.sort(
      (a, b) =>
        (a.start?.getTime() ?? Date.parse(a.date ?? '')) -
        (b.start?.getTime() ?? Date.parse(b.date ?? '')),
    );

    const body = buildIcs(events, {
      name: 'LawBid',
      timezone: user?.timezone ?? null,
      refreshSeconds: 3600,
    });
    const lastModified = events.reduce(
      (m, e) => (e.updatedAt > m ? e.updatedAt : m),
      new Date(0),
    );
    return {
      body,
      etag: `"${createHash('sha1').update(body).digest('hex')}"`,
      lastModified,
    };
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, first_name: true, last_name: true },
    });
    for (const u of users) {
      out.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' '));
    }
    return out;
  }
}
