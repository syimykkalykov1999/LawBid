import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CalendarConnection, Consultation } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarConfig } from './calendar-config.service';
import {
  asProvider,
  CalendarConnectionsService,
} from './calendar-connections.service';
import { CalendarAuthError } from './calendar-providers';

const CONNECTIONS_PER_RUN = 25;
const CONSULTATIONS_PER_CONNECTION = 20;
const DAY_MS = 86_400_000;

/** Pure: should the consultation exist in the outside calendar? */
export function wantsExternalEvent(
  c: Pick<Consultation, 'status' | 'ends_at'>,
  now: Date,
): boolean {
  return (
    c.status === 'confirmed' && c.ends_at.getTime() > now.getTime() - DAY_MS
  );
}

export function eventHash(
  c: Pick<Consultation, 'starts_at' | 'ends_at'>,
  title: string,
): string {
  return createHash('sha256')
    .update(`${c.starts_at.toISOString()}|${c.ends_at.toISOString()}|${title}`)
    .digest('hex');
}

/**
 * Owner 2026-10-28: writes confirmed consultations into the linked Google /
 * Outlook calendar and removes them when cancelled or moved. Runs inside the
 * existing every-minute consultation sweep, only for people who linked a
 * calendar while the matching admin switch is ON: with everything OFF the
 * cost is two cached settings reads. Per connection the sweep walks the
 * consultations changed since `sync_cursor`; a vendor error stops that
 * connection (cursor stays) and it is retried next minute.
 */
@Injectable()
export class CalendarSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: CalendarConfig,
    private readonly connections: CalendarConnectionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarSyncService.name);
  }

  /** Returns how many events were written or removed. */
  async sweep(now: Date = new Date()): Promise<number> {
    const [g, m] = await Promise.all([
      this.cfg.providerEnabled('google'),
      this.cfg.providerEnabled('microsoft'),
    ]);
    const providers = [...(g ? ['google'] : []), ...(m ? ['microsoft'] : [])];
    if (providers.length === 0 || !this.cfg.canSeal) return 0;
    const rows = await this.prisma.calendarConnection.findMany({
      where: {
        provider: { in: providers },
        status: 'active',
        write_events: true,
      },
      orderBy: [{ last_sync_at: { sort: 'asc', nulls: 'first' } }],
      take: CONNECTIONS_PER_RUN,
    });
    let n = 0;
    for (const c of rows) {
      try {
        n += await this.syncOne(c, now);
      } catch (e) {
        const msg = String(e).slice(0, 300);
        if (e instanceof CalendarAuthError) {
          await this.connections.park(c.id, msg);
        } else {
          await this.prisma.calendarConnection
            .updateMany({
              where: { id: c.id },
              data: { last_error: msg, last_sync_at: now },
            })
            .catch(() => undefined);
        }
        this.logger.warn(
          { provider: c.provider, err: msg },
          'calendar sync failed',
        );
      }
    }
    return n;
  }

  private async syncOne(c: CalendarConnection, now: Date): Promise<number> {
    const due = await this.prisma.consultation.findMany({
      where: {
        OR: [{ attorney_id: c.user_id }, { client_id: c.user_id }],
        updated_at: { gt: c.sync_cursor },
        ends_at: { gt: new Date(now.getTime() - DAY_MS) },
      },
      orderBy: { updated_at: 'asc' },
      take: CONSULTATIONS_PER_CONNECTION,
    });
    let cursor = c.sync_cursor;
    let n = 0;
    if (due.length > 0) {
      const token = await this.connections.accessTokenFor(c);
      const api = this.connections.apiFor(asProvider(c.provider));
      for (const k of due) {
        const link = await this.prisma.calendarEventLink.findUnique({
          where: {
            connection_id_consultation_id: {
              connection_id: c.id,
              consultation_id: k.id,
            },
          },
        });
        if (wantsExternalEvent(k, now)) {
          const title = await this.titleFor(k, c.user_id);
          const hash = eventHash(k, title);
          if (link?.content_hash !== hash) {
            const externalId = await api.upsertEvent(
              token,
              c.calendar_id,
              link?.external_id ?? null,
              {
                key: k.id,
                title,
                description: 'Booked in LawBid.',
                startsAt: k.starts_at,
                endsAt: k.ends_at,
              },
            );
            await this.prisma.calendarEventLink.upsert({
              where: {
                connection_id_consultation_id: {
                  connection_id: c.id,
                  consultation_id: k.id,
                },
              },
              create: {
                connection_id: c.id,
                consultation_id: k.id,
                external_id: externalId,
                content_hash: hash,
              },
              update: {
                external_id: externalId,
                content_hash: hash,
                synced_at: now,
              },
            });
            n += 1;
          }
        } else if (link) {
          await api.deleteEvent(token, c.calendar_id, link.external_id);
          await this.prisma.calendarEventLink.delete({
            where: { id: link.id },
          });
          n += 1;
        }
        cursor = k.updated_at;
      }
    }
    await this.prisma.calendarConnection.update({
      where: { id: c.id },
      data: {
        sync_cursor: cursor,
        last_sync_at: now,
        last_error: null,
      },
    });
    return n;
  }

  private async titleFor(k: Consultation, viewerId: string): Promise<string> {
    const otherId = k.attorney_id === viewerId ? k.client_id : k.attorney_id;
    const u = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { first_name: true, last_name: true },
    });
    const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
    return name ? `LawBid consultation: ${name}` : 'LawBid consultation';
  }
}
