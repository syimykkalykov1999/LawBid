import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { DayCounters } from './staff-counters.service';
import type { DailyRow } from './staff-daily-stats.service';
import { median } from './staff-rating.formulas';

/** Fewer decisions in a day say nothing about speed or sameness. */
const MIN_DECIDED = 10;
/** «Always the same answer»: this share of a day's decisions. */
const IDENTICAL_SHARE = 0.98;
const IDENTICAL_MIN_DECIDED = 30;
/** Night access: hours (UTC) counted as night, minimum decisions, share. */
const NIGHT_HOURS = [1, 2, 3, 4, 5];
const NIGHT_MIN = 10;
const NIGHT_MIN_SHARE = 0.5;
/** Bulk views: cards taken but hardly decided. */
const BULK_MIN_TAKEN = 30;
const BULK_RATIO = 3;
/** Rows kept per day (the owner sees the top `staff.anomalies.top_n`). */
const MAX_PER_DAY = 100;

export const ANOMALY_RULES = [
  'too_fast',
  'identical_answers',
  'rushing',
  'night_access',
  'bulk_views',
] as const;

export interface AnomalyRow {
  adminId: string;
  rule: (typeof ANOMALY_RULES)[number];
  score: number;
  detail: Record<string, number | string>;
}

const score = (ratio: number) =>
  Math.max(1, Math.min(100, Math.round(ratio * 100)));

/**
 * Pure detector: every threshold is relative to the person's own group (the
 * workspace), never to a model. Inputs are the day's rows, the Redis
 * counters (outcomes, hours) and the number of cards each person took.
 */
export function detectAnomalies(
  rows: readonly DailyRow[],
  counters: readonly DayCounters[],
  taken: ReadonlyMap<string, number>,
  fastPct: number,
): AnomalyRow[] {
  const out: AnomalyRow[] = [];
  const byAdmin = new Map(counters.map((c) => [c.adminId, c]));
  const groups = new Map<string, DailyRow[]>();
  for (const r of rows) {
    if (r.workspace === 'owner') continue;
    (
      groups.get(r.workspace) ?? groups.set(r.workspace, []).get(r.workspace)!
    ).push(r);
  }
  for (const group of groups.values()) {
    const active = group.filter((r) => r.decided >= MIN_DECIDED);
    const avgs = active
      .filter((r) => r.avgHandleSec > 0)
      .map((r) => r.avgHandleSec);
    const med = median(avgs);
    const nightShare = (c?: DayCounters) =>
      c && c.decided > 0
        ? NIGHT_HOURS.reduce((a, h) => a + (c.hours[h] ?? 0), 0) / c.decided
        : 0;
    const nightMed = median(
      active.map((r) => nightShare(byAdmin.get(r.adminId))),
    );
    const takenMed = median(group.map((r) => taken.get(r.adminId) ?? 0));
    for (const r of group) {
      const c = byAdmin.get(r.adminId);
      let fast = false;
      let same = false;
      // 1. Too fast: handling time under fastPct % of the group's median.
      if (
        r.decided >= MIN_DECIDED &&
        r.avgHandleSec > 0 &&
        med > 0 &&
        r.avgHandleSec < (med * fastPct) / 100
      ) {
        fast = true;
        out.push({
          adminId: r.adminId,
          rule: 'too_fast',
          score: score(1 - r.avgHandleSec / ((med * fastPct) / 100)),
          detail: {
            avgSec: r.avgHandleSec,
            medianSec: med,
            decided: r.decided,
          },
        });
      }
      // 2. Identical answers: (nearly) every decision the same word.
      if (c && c.decided >= IDENTICAL_MIN_DECIDED) {
        const [word, n] = Object.entries(c.outcomes).sort(
          (a, b) => b[1] - a[1],
        )[0] ?? ['', 0];
        const share = n / c.decided;
        if (share >= IDENTICAL_SHARE) {
          same = true;
          out.push({
            adminId: r.adminId,
            rule: 'identical_answers',
            score: score(share),
            detail: {
              answer: word,
              share: Math.round(share * 100),
              decided: c.decided,
            },
          });
        }
      }
      // 3. Hurry: both at once is the obvious sign (feeds the red flag).
      if (fast && same) {
        out.push({
          adminId: r.adminId,
          rule: 'rushing',
          score: 100,
          detail: { avgSec: r.avgHandleSec, medianSec: med },
        });
      }
      // 4. Night access: most of the day's work in the small hours while the
      // group's median is far lower.
      const night = nightShare(c);
      const nightCount = c
        ? NIGHT_HOURS.reduce((a, h) => a + (c.hours[h] ?? 0), 0)
        : 0;
      if (
        nightCount >= NIGHT_MIN &&
        night >= NIGHT_MIN_SHARE &&
        night >= nightMed * 3
      ) {
        out.push({
          adminId: r.adminId,
          rule: 'night_access',
          score: score(night),
          detail: {
            nightDecisions: nightCount,
            sharePct: Math.round(night * 100),
          },
        });
      }
      // 5. Bulk views: many cards opened, few decided, far above the group.
      const t = taken.get(r.adminId) ?? 0;
      if (
        t >= BULK_MIN_TAKEN &&
        t >= BULK_RATIO * Math.max(r.decided, 1) &&
        t >= BULK_RATIO * Math.max(takenMed, 1)
      ) {
        out.push({
          adminId: r.adminId,
          rule: 'bulk_views',
          score: score(1 - Math.max(r.decided, 1) / t),
          detail: { taken: t, decided: r.decided, groupMedian: takenMed },
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_PER_DAY);
}

/**
 * Staff package T5: the daily anomaly pass → staff_anomalies (one row per
 * day, person and rule; a re-run replaces the same rows). It reads what the
 * daily-stats job already has in hand plus ONE groupBy over the day's
 * `taken` lease events; no new heavy query. Gated by
 * `staff.anomalies_enabled`.
 */
@Injectable()
export class StaffAnomalyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
  ) {}

  async detect(
    day: string,
    rows: readonly DailyRow[],
    counters: readonly DayCounters[],
  ): Promise<number> {
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 86_400_000);
    const takenRows = await this.prisma.workLeaseEvent.groupBy({
      by: ['admin_id'],
      where: {
        created_at: { gte: from, lt: to },
        event: 'taken',
        admin_id: { not: null },
      },
      _count: { _all: true },
    });
    const taken = new Map(
      takenRows.flatMap((t) =>
        t.admin_id ? [[t.admin_id, t._count._all] as const] : [],
      ),
    );
    const fastPct = await this.settings.number('staff.anomalies.fast_pct');
    const found = detectAnomalies(rows, counters, taken, fastPct);
    await this.prisma.$transaction([
      // Only this pass's own rules: rows another detector wrote stay.
      this.prisma.staffAnomaly.deleteMany({
        where: { day: from, rule: { in: [...ANOMALY_RULES] } },
      }),
      this.prisma.staffAnomaly.createMany({
        data: found.map((a) => ({
          day: from,
          admin_id: a.adminId,
          rule: a.rule,
          score: a.score,
          detail: a.detail,
        })),
        skipDuplicates: true,
      }),
    ]);
    return found.length;
  }
}
