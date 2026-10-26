import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  AnalyticsEventsDto,
  AppEventCountDto,
  AppEventInDto,
} from './app-events.dto';

const TOP = 15;

/**
 * Owner 2026-10-15: events from the app, counted by day. One row per
 * (day, event, screen) with a running count instead of one row per event,
 * so the table stays tiny however many people use the app. Behind the flag
 * `app_events`: when it is off the batch is accepted and dropped.
 */
@Injectable()
export class AppEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async ingest(events: AppEventInDto[]): Promise<void> {
    if (!(await this.flags.isEnabled('app_events', true))) return;
    const counts = new Map<
      string,
      { name: string; screen: string; n: number }
    >();
    for (const e of events.slice(0, 50)) {
      const screen = e.screen ?? '';
      const k = `${e.name}\u0000${screen}`;
      const cur = counts.get(k) ?? { name: e.name, screen, n: 0 };
      cur.n += 1;
      counts.set(k, cur);
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const c of counts.values()) {
      await this.prisma.$executeRaw`
        INSERT INTO app_event_days (day, name, screen, count)
        VALUES (${today}::DATE, ${c.name}, ${c.screen}, ${c.n})
        ON CONFLICT (day, name, screen)
        DO UPDATE SET count = app_event_days.count + EXCLUDED.count`;
    }
  }

  /** The most frequent events and screens of the last [days] days. */
  async top(days: number): Promise<AnalyticsEventsDto> {
    const since = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const [events, screens, enabled] = await Promise.all([
      this.prisma.$queryRaw<{ name: string; n: bigint }[]>`
        SELECT name, sum(count) AS n FROM app_event_days
        WHERE day > ${since}::DATE AND name <> 'screen_view'
        GROUP BY name ORDER BY n DESC LIMIT ${TOP}`,
      this.prisma.$queryRaw<{ screen: string; n: bigint }[]>`
        SELECT screen, sum(count) AS n FROM app_event_days
        WHERE day > ${since}::DATE AND name = 'screen_view' AND screen <> ''
        GROUP BY screen ORDER BY n DESC LIMIT ${TOP}`,
      this.flags.isEnabled('app_events', true),
    ]);
    const topEvents: AppEventCountDto[] = events.map((r) => ({
      name: r.name,
      screen: '',
      count: Number(r.n),
    }));
    const topScreens: AppEventCountDto[] = screens.map((r) => ({
      name: 'screen_view',
      screen: r.screen,
      count: Number(r.n),
    }));
    return { enabled, topEvents, topScreens };
  }
}
