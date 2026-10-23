import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import type { IncidentEventKind } from './incident-texts';
import type { ProbeResult } from './status-probes.service';

/** Two bad (or good) checks in a row change the state: one blip is noise. */
export const STREAK_TO_CHANGE = 2;
/** While an incident is open, the team is reminded this often. */
export const REMINDER_MS = 15 * 60_000;
const STREAK_TTL_SEC = 600;

export interface IncidentRow {
  id: string;
  component: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  openedAt: Date;
  closedAt: Date | null;
}

export interface IncidentEvent {
  kind: IncidentEventKind;
  incident: IncidentRow;
  /** Counts the notices of this incident (job ids stay unique). */
  seq: number;
}

function toRow(r: {
  id: string;
  component: string;
  severity: string;
  title: string;
  detail: Prisma.JsonValue;
  opened_at: Date;
  closed_at: Date | null;
}): IncidentRow {
  return {
    id: r.id,
    component: r.component,
    severity: r.severity,
    title: r.title,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
  };
}

/**
 * Owner 2026-10-22: incidents of the status board. State machine only —
 * the watchdog job calls [reconcile] once a minute and delivers the events
 * it returns. De-dup is by the database: one open row per component (a
 * partial unique index), and a reminder is «claimed» by a conditional
 * UPDATE, so two watchdogs running at once notify once.
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async bump(
    component: string,
    bad: boolean,
  ): Promise<{ bad: number; ok: number }> {
    const kBad = `ops:inc:bad:${component}`;
    const kOk = `ops:inc:ok:${component}`;
    const [inc, del] = bad ? [kBad, kOk] : [kOk, kBad];
    const pipe = this.redis.multi();
    pipe.incr(inc);
    pipe.expire(inc, STREAK_TTL_SEC);
    pipe.del(del);
    const r = await pipe.exec();
    const n = Number(r?.[0]?.[1] ?? 0);
    return bad ? { bad: n, ok: 0 } : { bad: 0, ok: n };
  }

  async reconcile(
    results: ProbeResult[],
    now = new Date(),
  ): Promise<IncidentEvent[]> {
    const events: IncidentEvent[] = [];
    for (const r of results) {
      const streak = await this.bump(r.key, r.status === 'red');
      const open = await this.prisma.systemIncident.findFirst({
        where: { component: r.key, closed_at: null },
      });
      if (r.status === 'red') {
        if (!open) {
          if (streak.bad < STREAK_TO_CHANGE) continue;
          try {
            const row = await this.prisma.systemIncident.create({
              data: {
                component: r.key,
                title: r.key,
                detail: r.detail as Prisma.InputJsonObject,
                opened_at: now,
                last_notified_at: now,
                notify_count: 1,
              },
            });
            events.push({ kind: 'opened', incident: toRow(row), seq: 1 });
          } catch {
            // The other watchdog opened it first (unique index): fine.
          }
          continue;
        }
        const due = new Date(now.getTime() - REMINDER_MS);
        const claimed = await this.prisma.systemIncident.updateMany({
          where: {
            id: open.id,
            closed_at: null,
            OR: [
              { last_notified_at: null },
              { last_notified_at: { lte: due } },
            ],
          },
          data: {
            last_notified_at: now,
            notify_count: { increment: 1 },
            detail: r.detail as Prisma.InputJsonObject,
          },
        });
        if (claimed.count === 1) {
          events.push({
            kind: 'reminder',
            incident: toRow({ ...open, detail: r.detail as Prisma.JsonValue }),
            seq: open.notify_count + 1,
          });
        }
        continue;
      }
      if (open && streak.ok >= STREAK_TO_CHANGE) {
        const closed = await this.prisma.systemIncident.updateMany({
          where: { id: open.id, closed_at: null },
          data: { closed_at: now },
        });
        if (closed.count === 1) {
          events.push({
            kind: 'resolved',
            incident: toRow({ ...open, closed_at: now }),
            seq: open.notify_count + 1,
          });
        }
      }
    }
    return events;
  }

  /** Incidents opened or still open in the last [hours] hours, newest first. */
  async recent(hours = 24, now = new Date()): Promise<IncidentRow[]> {
    const since = new Date(now.getTime() - hours * 3_600_000);
    const rows = await this.prisma.systemIncident.findMany({
      where: { OR: [{ opened_at: { gte: since } }, { closed_at: null }] },
      orderBy: { opened_at: 'desc' },
      take: 100,
    });
    return rows.map(toRow);
  }

  /** Admins who get the alerts: on-call switch on and the right held (the
   * owner always holds it). */
  async recipients(): Promise<
    { userId: string; email: string | null; lang: 'ru' | 'en' }[]
  > {
    const profiles = await this.prisma.adminProfile.findMany({
      where: { on_call_enabled: true },
      select: {
        admin_role: true,
        permissions: true,
        user: {
          select: { id: true, email: true, ui_language: true, status: true },
        },
      },
    });
    return profiles
      .filter((p) => p.user.status === 'active')
      .filter((p) => {
        if (p.admin_role === 'super_admin') return true;
        const perms = (p.permissions ?? {}) as Record<string, unknown>;
        return perms.on_call === 'view' || perms.on_call === 'manage';
      })
      .map((p) => ({
        userId: p.user.id,
        email: p.user.email,
        lang: (p.user.ui_language ?? '').startsWith('ru') ? 'ru' : 'en',
      }));
  }
}
