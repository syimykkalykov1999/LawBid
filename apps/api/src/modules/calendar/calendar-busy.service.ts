import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarConfig } from './calendar-config.service';
import {
  asProvider,
  CalendarConnectionsService,
} from './calendar-connections.service';
import { CalendarAuthError, type BusyInterval } from './calendar-providers';

const MAX_CACHE = 2000;

/**
 * Owner 2026-10-28: «a busy attorney cannot be booked». The attorney's
 * Google / Outlook busy time is read (free/busy only — never titles) and
 * treated like another booking when slots are offered and when a slot is
 * taken. It must never slow booking down or break it: answers are reused
 * for `calendar.busy_cache_seconds`, one request is shared by concurrent
 * callers, the wait is capped by `calendar.busy_timeout_ms`, and any
 * failure means «no extra busy time» (booking goes on as it does today).
 */
@Injectable()
export class CalendarBusyService {
  private readonly cache = new Map<
    string,
    { at: number; value: Promise<BusyInterval[]> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: CalendarConfig,
    private readonly connections: CalendarConnectionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarBusyService.name);
  }

  /**
   * @param ignore a booking being moved: the event we wrote for it is not
   *               a conflict with itself.
   */
  async busyFor(
    attorneyId: string,
    from: Date,
    to: Date,
    ignore?: BusyInterval,
  ): Promise<BusyInterval[]> {
    try {
      const [g, m] = await Promise.all([
        this.cfg.providerEnabled('google'),
        this.cfg.providerEnabled('microsoft'),
      ]);
      if (!g && !m) return [];
      const key = `${attorneyId}|${from.toISOString().slice(0, 13)}|${to.toISOString().slice(0, 13)}`;
      const ttl = await this.cfg.busyCacheMs();
      let hit = this.cache.get(key);
      if (!hit || Date.now() - hit.at > ttl) {
        hit = { at: Date.now(), value: this.load(attorneyId, from, to, g, m) };
        if (this.cache.size > MAX_CACHE) this.cache.clear();
        this.cache.set(key, hit);
      }
      const timeout = await this.cfg.busyTimeoutMs();
      const all = await Promise.race([
        hit.value,
        new Promise<BusyInterval[]>((resolve) =>
          setTimeout(() => resolve([]), timeout).unref?.(),
        ),
      ]);
      return ignore
        ? all.filter(
            (b) =>
              !(
                b.startsAt.getTime() === ignore.startsAt.getTime() &&
                b.endsAt.getTime() === ignore.endsAt.getTime()
              ),
          )
        : all;
    } catch (e) {
      this.logger.warn({ err: String(e) }, 'external busy time unavailable');
      return [];
    }
  }

  private async load(
    attorneyId: string,
    from: Date,
    to: Date,
    google: boolean,
    microsoft: boolean,
  ): Promise<BusyInterval[]> {
    const providers = [
      ...(google ? ['google'] : []),
      ...(microsoft ? ['microsoft'] : []),
    ];
    const rows = await this.prisma.calendarConnection.findMany({
      where: {
        user_id: attorneyId,
        read_busy: true,
        status: 'active',
        provider: { in: providers },
      },
    });
    const out: BusyInterval[] = [];
    await Promise.all(
      rows.map(async (c) => {
        try {
          const token = await this.connections.accessTokenFor(c);
          const api = this.connections.apiFor(asProvider(c.provider));
          out.push(...(await api.freeBusy(token, c.calendar_id, from, to)));
        } catch (e) {
          // A refused access token is dropped; the next read refreshes it
          // (and only a refused REFRESH parks the connection).
          if (e instanceof CalendarAuthError) this.connections.forget(c.id);
          this.logger.warn(
            { provider: c.provider, err: String(e) },
            'free/busy read failed',
          );
        }
      }),
    );
    return out;
  }
}
