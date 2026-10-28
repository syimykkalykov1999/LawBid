import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import {
  effectiveUrgency,
  loadUrgencyThresholds,
  URGENT_LEVELS,
} from '../../cases/cases.public';
import { PrismaService } from '../../../prisma/prisma.service';
import { readsAreSplit } from '../../../sharding/split-reads';
import type { FanoutCandidate } from './case-fanout.scoring';

/** Safety bound on the audience query (the old LIMIT had no ORDER BY; now
 * everyone is scored and the waves decide who goes first). */
export const AUDIENCE_QUERY_MAX = 20_000;

export interface CaseAudience {
  /** The case is open for alerts at all. */
  found: boolean;
  urgent: boolean;
  clientId: string;
  candidates: FanoutCandidate[];
}

interface Row {
  id: string;
  exact_practice: boolean;
  primary_state: boolean;
  trust_level: number;
  rating_avg: number;
  rating_count: number;
}

/**
 * Owner 2026-10-01 / 10-05 / 10-15: who may be alerted about a new case —
 * the qualifications the attorney chose for alerts (a category covers its
 * subcategories; "not sure" cases also reach General Practice), only in
 * states with a verified licence, verified profile, "New cases" push on,
 * urgent-only respected, no blocks either way. Moved here from
 * SubscriptionAlertsService unchanged in what it selects; it now also
 * returns what the scoring needs (exact practice, primary state, trust,
 * rating) and no longer cuts the list at random.
 */
@Injectable()
export class CaseAudienceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  async forCase(caseId: string): Promise<CaseAudience> {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { urgency: true, deadline_at: true, client_id: true },
    });
    if (!kase)
      return { found: false, urgent: false, clientId: '', candidates: [] };
    // Algo audit 2026-10-27 (H-3): "today" is the client's day, not UTC's
    // (a separate read: users are the global family, cases a shard).
    const client = await this.prisma.user.findUnique({
      where: { id: kase.client_id },
      select: { timezone: true },
    });
    const level = effectiveUrgency(
      kase.urgency,
      kase.deadline_at,
      new Date(),
      await loadUrgencyThresholds(this.settings),
      client?.timezone,
    );
    const urgent = level !== null && URGENT_LEVELS.includes(level);
    const defaultOn = await this.defaultOn();
    const candidates = readsAreSplit(this.prisma)
      ? await this.split(caseId, urgent, defaultOn)
      : await this.single(caseId, urgent, defaultOn);
    return { found: true, urgent, clientId: kase.client_id, candidates };
  }

  /** Algo audit 2026-10-27 (C-2): an attorney without a `new_cases`
   * settings row (never opened the toggle) counts as ON while
   * `case_alerts.default_enabled` is on — else nobody hears about a case
   * at the release. Off = the old opt-in audience. */
  private async defaultOn(): Promise<boolean> {
    if (!this.settings) return APP_SETTINGS['case_alerts.default_enabled'];
    return this.settings.boolean('case_alerts.default_enabled');
  }

  private async single(
    caseId: string,
    urgent: boolean,
    defaultOn: boolean,
  ): Promise<FanoutCandidate[]> {
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH c AS (
        SELECT c.id, c.client_id, c.practice_area_id, c.primary_state_code,
               pa.parent_id, pa.code
        FROM cases c
        JOIN practice_areas pa ON pa.id = c.practice_area_id
        WHERE c.id = ${caseId}::UUID
      ), chosen AS (
        SELECT ap.attorney_id, ap.practice_area_id
        FROM attorney_practice_areas ap
        JOIN attorney_profiles p ON p.user_id = ap.attorney_id
         AND NOT p.new_case_alerts_custom
        UNION ALL
        SELECT n.attorney_id, n.practice_area_id
        FROM new_case_alert_practices n
        JOIN attorney_profiles p ON p.user_id = n.attorney_id
         AND p.new_case_alerts_custom
      )
      SELECT ch.attorney_id::TEXT AS id,
             bool_or(ch.practice_area_id = c.practice_area_id) AS exact_practice,
             bool_or(l.state_code = c.primary_state_code) AS primary_state,
             max(p.trust_level)::INT AS trust_level,
             max(p.rating_avg)::FLOAT8 AS rating_avg,
             max(p.rating_count)::INT AS rating_count
      FROM c
      JOIN chosen ch ON ch.practice_area_id = c.practice_area_id
                     OR ch.practice_area_id = c.parent_id
                     -- Owner 2026-10-15: any of the case's other topics.
                     OR ch.practice_area_id IN (
                       SELECT x.practice_area_id FROM case_extra_practices x
                       WHERE x.case_id = c.id)
                     -- Audit 2026-10-01: like the case feed (§4.1), "Not
                     -- sure" cases also go to General Practice attorneys.
                     OR (c.code = 'general_practice.not_sure_or_other'
                         AND ch.practice_area_id = (
                           SELECT id FROM practice_areas
                           WHERE code = 'general_practice.general_practice'))
      JOIN attorney_profiles p ON p.user_id = ch.attorney_id
       AND p.verification_status = 'verified'
       AND (NOT p.new_case_alerts_urgent_only OR ${urgent})
      JOIN case_states cs ON cs.case_id = c.id
      JOIN attorney_licenses l ON l.attorney_id = ch.attorney_id
       AND l.state_code = cs.state_code AND l.license_status = 'verified'
      LEFT JOIN notification_settings s
        ON s.user_id = ch.attorney_id AND s.category = 'new_cases'
      JOIN users u ON u.id = ch.attorney_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE COALESCE(s.push_enabled, ${defaultOn}::BOOLEAN)
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ch.attorney_id AND b.blocked_id = c.client_id)
             OR (b.blocker_id = c.client_id AND b.blocked_id = ch.attorney_id))
      GROUP BY ch.attorney_id
      LIMIT ${AUDIENCE_QUERY_MAX}`;
    return rows.map((r) => ({
      id: r.id,
      exactPractice: r.exact_practice,
      primaryState: r.primary_state,
      trustLevel: r.trust_level,
      ratingAvg: Number(r.rating_avg),
      ratingCount: r.rating_count,
    }));
  }

  /** The same audience for several databases: the case from its shard,
   * then attorneys from the global family. */
  private async split(
    caseId: string,
    urgent: boolean,
    defaultOn: boolean,
  ): Promise<FanoutCandidate[]> {
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        practice_area_id: true,
        primary_state_code: true,
        states: { select: { state_code: true } },
        extra_practices: { select: { practice_area_id: true } },
      },
    });
    if (!c) return [];
    const pa = await this.prisma.practiceArea.findUnique({
      where: { id: c.practice_area_id },
      select: { parent_id: true, code: true },
    });
    const matching = new Set<string>([
      c.practice_area_id,
      ...(pa?.parent_id ? [pa.parent_id] : []),
      ...c.extra_practices.map((x) => x.practice_area_id),
    ]);
    if (pa?.code === 'general_practice.not_sure_or_other') {
      const general = await this.prisma.practiceArea.findFirst({
        where: { code: 'general_practice.general_practice' },
        select: { id: true },
      });
      if (general) matching.add(general.id);
    }
    const areas = [...matching];
    const states = c.states.map((x) => x.state_code);
    if (states.length === 0) return [];
    const profiles = await this.prisma.attorneyProfile.findMany({
      where: {
        verification_status: 'verified',
        ...(urgent ? {} : { new_case_alerts_urgent_only: false }),
        OR: [
          {
            new_case_alerts_custom: false,
            practice_areas: { some: { practice_area_id: { in: areas } } },
          },
          {
            new_case_alerts_custom: true,
            new_case_alert_practices: {
              some: { practice_area_id: { in: areas } },
            },
          },
        ],
        licenses: {
          some: { license_status: 'verified', state_code: { in: states } },
        },
      },
      select: {
        user_id: true,
        trust_level: true,
        rating_avg: true,
        rating_count: true,
        new_case_alerts_custom: true,
        practice_areas: { select: { practice_area_id: true } },
        new_case_alert_practices: { select: { practice_area_id: true } },
        licenses: {
          where: { license_status: 'verified' },
          select: { state_code: true },
        },
      },
      take: AUDIENCE_QUERY_MAX,
    });
    const ids = profiles.map((p) => p.user_id);
    if (ids.length === 0) return [];
    const [settings, users, blocks] = await Promise.all([
      this.prisma.notificationSetting.findMany({
        where: { user_id: { in: ids }, category: 'new_cases' },
        select: { user_id: true, push_enabled: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids }, status: 'active', deleted_at: null },
        select: { id: true },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blocker_id: { in: ids }, blocked_id: c.client_id },
            { blocker_id: c.client_id, blocked_id: { in: ids } },
          ],
        },
        select: { blocker_id: true, blocked_id: true },
      }),
    ]);
    const explicit = new Map(settings.map((x) => [x.user_id, x.push_enabled]));
    const pushOn = (id: string) => explicit.get(id) ?? defaultOn;
    const active = new Set(users.map((x) => x.id));
    const blocked = new Set(
      blocks.map((b) =>
        b.blocker_id === c.client_id ? b.blocked_id : b.blocker_id,
      ),
    );
    return profiles
      .filter(
        (p) =>
          pushOn(p.user_id) && active.has(p.user_id) && !blocked.has(p.user_id),
      )
      .map((p) => {
        const chosen = (
          p.new_case_alerts_custom
            ? p.new_case_alert_practices
            : p.practice_areas
        ).map((x) => x.practice_area_id);
        return {
          id: p.user_id,
          exactPractice: chosen.includes(c.practice_area_id),
          primaryState: p.licenses.some(
            (l) => l.state_code === c.primary_state_code,
          ),
          trustLevel: p.trust_level,
          ratingAvg: Number(p.rating_avg),
          ratingCount: p.rating_count,
        };
      });
  }
}
