import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSummaryService,
  type Summary,
} from '../../common/admin-summary/admin-summary.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type {
  StaffTodayAnomaliesDto,
  StaffTodayAppealsDto,
  StaffTodayDto,
  StaffTodayPersonDto,
  StaffTodaySuggestionDto,
} from './staff-home.dto';
import {
  STAFF_RECOMMENDATION_TEMPLATE,
  type StaffRecommendationTemplate,
} from './staff-recommendation.template';
import {
  ANOMALY_LABEL,
  pickDecisionOfDay,
  personName,
  SUGGESTION_ORDER,
} from './staff-today.logic';

/** Redis key of the snapshot (AdminSummaryService prefixes it). */
export const STAFF_TODAY_KEY = 'staff.today';
/** The page may be this old before a read starts a background refresh. */
export const STAFF_TODAY_FRESH_SEC = 120;

const NEWEST_APPEALS = 3;
const SHORT = 5;

type Row = { t: string; d: Record<string, unknown> };
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const int = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
const iso = (v: unknown): string => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
};
const nameOf = (d: Record<string, unknown>): string =>
  personName(str(d.first) || null, str(d.last) || null);

/** Latest rating snapshot date: an index-only MAX. */
const LATEST_RATING = Prisma.sql`s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)`;
const FULL_NAME = Prisma.sql`'first', u.first_name, 'last', u.last_name`;

/**
 * Staff package T10 (plan B4): the owner's «Сегодня». ONE snapshot built from
 * the small tables the nightly jobs fill — the open complaints, the red marks,
 * the short list, the open suggestions, the anomalies, the held pay days — in
 * ONE query (every block a bounded sub-select with LIMIT, joined only to
 * `users` for the name). It is built by the `staff.today` job every two
 * minutes and read from Redis (AdminSummaryService: one refresher for the
 * whole team, stale-while-revalidate), so opening the page costs no query. A
 * block whose switch is off is `null` and is not even selected.
 */
@Injectable()
export class StaffTodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly summary: AdminSummaryService,
    @Inject(STAFF_RECOMMENDATION_TEMPLATE)
    private readonly template: StaffRecommendationTemplate,
  ) {}

  /** What a request gets: the stored snapshot (computed once if none). */
  async read(): Promise<StaffTodayDto> {
    const s = await this.summary.get(
      STAFF_TODAY_KEY,
      () => this.build(),
      STAFF_TODAY_FRESH_SEC,
    );
    return withTime(s);
  }

  /** The `staff.today` job: recount and store. */
  async refresh(): Promise<StaffTodayDto> {
    return withTime(
      await this.summary.refresh(STAFF_TODAY_KEY, () => this.build()),
    );
  }

  /** One query (or none when every block is off). */
  async build(): Promise<StaffTodayDto> {
    const sw = (await this.staff.get()).switches;
    const appealsOn = sw['staff.appeals_enabled'];
    const ratingOn = sw['staff.rating_enabled'];
    const sugOn = sw['staff.suggestions_enabled'] && ratingOn;
    const anomOn = sw['staff.anomalies_enabled'];
    const payOn = sw['staff.piecework_enabled'];

    const parts: Prisma.Sql[] = [];
    if (appealsOn) {
      parts.push(Prisma.sql`
        (SELECT 'appeal' AS t, jsonb_build_object('id', a.id, 'number', a.author_alias,
           'kind', a.kind, 'status', a.status, 'createdAt', a.created_at, ${FULL_NAME},
           'total', (SELECT count(*) FROM admin_appeals WHERE status IN ('new', 'seen'))) AS d
         FROM admin_appeals a JOIN users u ON u.id = a.head_admin_id
         WHERE a.status IN ('new', 'seen')
         ORDER BY a.created_at DESC LIMIT ${NEWEST_APPEALS})`);
      parts.push(Prisma.sql`
        (SELECT 'flags' AS t, jsonb_build_object('open', count(*)) AS d
         FROM staff_retaliation_flags WHERE state = 'open')`);
    }
    if (ratingOn) {
      parts.push(Prisma.sql`
        (SELECT 'worst' AS t, jsonb_build_object('adminId', s.admin_id, 'workspace', s.workspace,
           'rating', s.rating, 'status', s.status, 'flags', s.flags, 'decisions', s.n_decisions,
           'snapshotDate', s.snapshot_date, ${FULL_NAME}) AS d
         FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
         WHERE ${LATEST_RATING} AND s.status IN ('red', 'yellow')
         ORDER BY (s.status = 'red') DESC, s.rating ASC NULLS LAST, s.admin_id LIMIT ${SHORT})`);
      parts.push(Prisma.sql`
        (SELECT 'best' AS t, jsonb_build_object('adminId', s.admin_id, 'workspace', s.workspace,
           'rating', s.rating, 'status', s.status, 'flags', s.flags, 'decisions', s.n_decisions,
           'snapshotDate', s.snapshot_date, ${FULL_NAME}) AS d
         FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
         WHERE ${LATEST_RATING} AND s.status = 'green'
         ORDER BY s.rating DESC, s.admin_id LIMIT ${SHORT})`);
    }
    if (sugOn) {
      parts.push(Prisma.sql`
        (SELECT 'suggestion' AS t, jsonb_build_object('id', g.id, 'adminId', g.admin_id,
           'workspace', p.workspace, 'kind', g.kind, 'evidence', g.evidence,
           'createdAt', g.created_at, ${FULL_NAME},
           'total', (SELECT count(*) FROM staff_suggestions WHERE status = 'open')) AS d
         FROM staff_suggestions g
         JOIN admin_profiles p ON p.user_id = g.admin_id
         JOIN users u ON u.id = g.admin_id
         WHERE g.status = 'open'
         ORDER BY CASE g.kind WHEN 'replace' THEN 0 WHEN 'pull' THEN 1 WHEN 'pause' THEN 2
           WHEN 'warn' THEN 3 WHEN 'retrain' THEN 4 WHEN 'more_review' THEN 5 ELSE 6 END,
           g.created_at DESC, g.id LIMIT ${SHORT})`);
    }
    if (anomOn) {
      parts.push(Prisma.sql`
        (SELECT 'anomaly' AS t, jsonb_build_object('adminId', n.admin_id, 'rule', n.rule,
           'score', n.score, 'day', n.day, ${FULL_NAME},
           'total', (SELECT count(*) FROM staff_anomalies
                      WHERE day = (SELECT MAX(day) FROM staff_anomalies))) AS d
         FROM staff_anomalies n JOIN users u ON u.id = n.admin_id
         WHERE n.day = (SELECT MAX(day) FROM staff_anomalies)
         ORDER BY n.score DESC, n.admin_id LIMIT ${SHORT})`);
    }
    if (payOn) {
      parts.push(Prisma.sql`
        (SELECT 'piecework' AS t, jsonb_build_object('disputed', count(*)) AS d
         FROM staff_piecework_days
         WHERE day >= (CURRENT_DATE - 31) AND status = 'disputed')`);
    }
    const rows =
      parts.length === 0
        ? []
        : await this.prisma.$queryRaw<Row[]>(
            Prisma.sql`${Prisma.join(parts, ' UNION ALL ')}`,
          );

    const of = (t: string) => rows.filter((r) => r.t === t).map((r) => r.d);
    const appealRows = of('appeal');
    const appeals: StaffTodayAppealsDto | null = appealsOn
      ? {
          open: int(appealRows[0]?.total),
          newest: appealRows.map((d) => ({
            id: str(d.id),
            number: int(d.number),
            kind: str(d.kind),
            status: str(d.status),
            headName: nameOf(d),
            createdAt: iso(d.createdAt),
          })),
        }
      : null;
    const flags = appealsOn ? { open: int(of('flags')[0]?.open) } : null;
    const person = (d: Record<string, unknown>): StaffTodayPersonDto => ({
      adminId: str(d.adminId),
      name: nameOf(d),
      workspace: str(d.workspace),
      rating: typeof d.rating === 'number' ? d.rating : null,
      status: str(d.status),
      flags: Array.isArray(d.flags)
        ? d.flags.filter((f): f is string => typeof f === 'string')
        : [],
      decisions: int(d.decisions),
    });
    const worst = of('worst');
    const best = of('best');
    const firstDate = str((worst[0] ?? best[0])?.snapshotDate);
    const shortlist = ratingOn
      ? {
          snapshotDate: firstDate ? firstDate.slice(0, 10) : null,
          worst: worst.map(person),
          best: best.map(person),
        }
      : null;
    const sugRows = of('suggestion');
    const suggestions = sugOn
      ? {
          open: int(sugRows[0]?.total),
          items: sugRows
            .map((d): StaffTodaySuggestionDto => ({
              id: str(d.id),
              adminId: str(d.adminId),
              name: nameOf(d),
              workspace: str(d.workspace),
              kind: str(d.kind),
              createdAt: iso(d.createdAt),
              recommendation: this.template.render({
                kind: str(d.kind),
                evidence:
                  d.evidence && typeof d.evidence === 'object'
                    ? (d.evidence as Record<string, unknown>)
                    : {},
              }),
            }))
            .sort(
              (a, b) =>
                SUGGESTION_ORDER.indexOf(a.kind as never) -
                SUGGESTION_ORDER.indexOf(b.kind as never),
            ),
        }
      : null;
    const anomRows = of('anomaly');
    const anomalies: StaffTodayAnomaliesDto | null = anomOn
      ? {
          day: anomRows[0] ? str(anomRows[0].day).slice(0, 10) : null,
          total: int(anomRows[0]?.total),
          items: anomRows.map((d) => ({
            adminId: str(d.adminId),
            name: nameOf(d),
            rule: str(d.rule),
            ruleLabel: ANOMALY_LABEL[str(d.rule)] ?? 'необычное поведение',
            score: int(d.score),
          })),
        }
      : null;
    const piecework = payOn
      ? { disputedDays: int(of('piecework')[0]?.disputed) }
      : null;
    return {
      computedAt: new Date().toISOString(),
      decision: pickDecisionOfDay({
        appeals,
        flags,
        suggestions,
        anomalies,
        piecework,
      }),
      appeals,
      flags,
      shortlist,
      suggestions,
      anomalies,
      piecework,
    };
  }
}

function withTime(s: Summary<StaffTodayDto>): StaffTodayDto {
  return { ...s.data, computedAt: s.computedAt };
}
