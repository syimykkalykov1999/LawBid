import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizeGuardrails,
  parseVariants,
  type Guardrails,
} from './experiment-definition';
import {
  differenceOf,
  inImpressionSample,
  meanInterval,
  ratioInterval,
  srmCheck,
  wilsonInterval,
  type Difference,
  type Interval,
  type RatioStats,
  type SrmResult,
  type VariantWeight,
} from './experiment-math';

/** A variant needs this many subjects (users / cases) before we judge a metric. */
export const MIN_SUBJECTS = 100;
/** Guardrails are checked every night: a stricter z than 95% pays for peeking. */
export const GUARDRAIL_Z = 3.09;

export type MetricUnit = 'share' | 'per1000' | 'hours';

export interface MetricVariantValue extends Interval {
  /** Denominator volume (impressions / bids / searches / cases). */
  volume: number;
}

export interface MetricVsControl extends Difference {
  verdict: 'better' | 'worse' | 'same' | 'few';
}

export interface MetricResult {
  key: string;
  label: string;
  unit: MetricUnit;
  better: 'up' | 'down';
  variants: Record<string, MetricVariantValue>;
  vsControl: Record<string, MetricVsControl>;
}

export interface ExperimentReport {
  windowFrom: string;
  windowTo: string;
  exposures: Record<string, number>;
  srm: SrmResult;
  metrics: MetricResult[];
  guardrail: { tripped: boolean; reasons: string[] };
  /** Plain Russian lines for the admin page. */
  summary: string[];
}

interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  better: 'up' | 'down';
  /** SQL conditions (fixed text, never user input) on ranking_events columns. */
  x: string;
  y: string;
  scale?: number;
}

/**
 * Per-user ratio metrics: numerator y / denominator x, counted over the
 * experiment's events. Users with no denominator event are left out, which
 * also keeps sampled impressions and always-kept events on the same users.
 */
function ratioDefs(k: number): MetricDef[] {
  return [
    {
      key: 'ctr',
      label: `Клики среди показов на местах 1-${k} (CTR@${k})`,
      unit: 'share',
      better: 'up',
      x: `kind = 'impression' AND position <= ${k}`,
      y: `kind = 'click' AND position <= ${k}`,
    },
    {
      key: 'bid_rate',
      label: 'Отклики на показанные дела (дело → отклик)',
      unit: 'share',
      better: 'up',
      x: `kind = 'impression'`,
      y: `kind = 'bid'`,
    },
    {
      key: 'accept_rate',
      label: 'Принятые отклики среди всех откликов (отклик → принят)',
      unit: 'share',
      better: 'up',
      x: `kind = 'bid'`,
      y: `kind = 'accept'`,
    },
    {
      key: 'zero_search',
      label: 'Поиски без единого результата',
      unit: 'share',
      better: 'down',
      x: `kind = 'search'`,
      y: `kind = 'search' AND value = 0`,
    },
    {
      key: 'reports',
      label: 'Жалобы на 1000 показов',
      unit: 'per1000',
      better: 'down',
      x: `kind = 'impression'`,
      y: `kind = 'report'`,
      scale: 1000,
    },
    {
      key: 'errors',
      label: 'Ошибки на 1000 показов',
      unit: 'per1000',
      better: 'down',
      x: `kind = 'impression'`,
      y: `kind = 'error'`,
      scale: 1000,
    },
  ];
}

const MIN_AGE_HOURS_FOR_CASES = 24;
/** A new attorney = signed up in the 30 days before the first exposure. */
const NEW_ATTORNEY_DAYS = 30;
const OPPORTUNITY_CHUNK = 5000;
const OPPORTUNITY_MAX_UNITS = 200_000;

@Injectable()
export class ExperimentMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  /** Computes the report of one experiment from the stored events. */
  async compute(exp: {
    id: string;
    key: string;
    variants: unknown;
    guardrails: unknown;
    started_at: Date | null;
    created_at: Date;
  }): Promise<ExperimentReport> {
    const variants = parseVariants(exp.variants);
    const from = exp.started_at ?? exp.created_at;
    const to = new Date();
    const k = Math.max(
      1,
      Math.round(await this.settings.number('experiments.ctr_k')),
    );

    const exposures = await this.exposureCounts(exp.id, variants);
    const srm = srmCheck(exposures, variants);
    const metrics: MetricResult[] = [];

    for (const def of ratioDefs(k)) {
      const stats = await this.ratioStats(exp.key, from, def);
      metrics.push(
        this.buildMetric(def, variants, (v) => {
          const s = stats.get(v);
          if (!s) return null;
          const iv = ratioInterval(s);
          const scale = def.scale ?? 1;
          return {
            value: iv.value * scale,
            low: iv.low * scale,
            high: iv.high * scale,
            n: iv.n,
            volume: s.sx,
          };
        }),
      );
    }

    const cases = await this.caseStats(exp.key, from);
    if (cases.size > 0) {
      metrics.push(
        this.buildMetric(
          {
            key: 'first_bid_hours',
            label: 'Часов до первого отклика на дело (максимум 24)',
            unit: 'hours',
            better: 'down',
          },
          variants,
          (v) => {
            const c = cases.get(v);
            if (!c) return null;
            const iv = meanInterval(c.n, c.sum, c.sumSq);
            return { ...iv, volume: c.n };
          },
        ),
        this.buildMetric(
          {
            key: 'no_bid_24h',
            label: 'Дела без откликов за первые 24 часа',
            unit: 'share',
            better: 'down',
          },
          variants,
          (v) => {
            const c = cases.get(v);
            if (!c) return null;
            return { ...wilsonInterval(c.noBid, c.n), volume: c.n };
          },
        ),
      );
    }

    const fair = await this.newAttorneyOpportunity(exp.id, exp.key, from);
    if (fair.size > 0) {
      metrics.push(
        this.buildMetric(
          {
            key: 'new_attorney_opportunity',
            label:
              'Новые адвокаты, которым показали хотя бы одно дело (справедливость)',
            unit: 'share',
            better: 'up',
          },
          variants,
          (v) => {
            const f = fair.get(v);
            if (!f) return null;
            return { ...wilsonInterval(f.hit, f.n), volume: f.n };
          },
        ),
      );
    }

    const guardrail = this.guardrails(
      metrics,
      variants,
      normalizeGuardrails(exp.guardrails as Partial<Guardrails>),
    );
    return {
      windowFrom: from.toISOString(),
      windowTo: to.toISOString(),
      exposures,
      srm,
      metrics,
      guardrail,
      summary: summarize(metrics, variants, srm, guardrail),
    };
  }

  private async exposureCounts(
    experimentId: string,
    variants: VariantWeight[],
  ): Promise<Record<string, number>> {
    const rows = await this.prisma.experimentExposure.groupBy({
      by: ['variant'],
      where: { experiment_id: experimentId },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const v of variants) out[v.key] = 0;
    for (const r of rows) out[r.variant] = r._count._all;
    return out;
  }

  private async ratioStats(
    key: string,
    from: Date,
    def: MetricDef,
  ): Promise<Map<string, RatioStats>> {
    const rows = await this.prisma.$queryRaw<
      {
        variant: string;
        n: number;
        sx: number;
        sy: number;
        sxx: number;
        syy: number;
        sxy: number;
      }[]
    >(Prisma.sql`
      SELECT variant,
             count(*)::int AS n,
             sum(x)::float8 AS sx, sum(y)::float8 AS sy,
             sum(x * x)::float8 AS sxx, sum(y * y)::float8 AS syy,
             sum(x * y)::float8 AS sxy
        FROM (
          SELECT variant,
                 COALESCE(user_id::text, item_id, 'anon') AS subject,
                 (count(*) FILTER (WHERE ${Prisma.raw(def.x)}))::float8 AS x,
                 (count(*) FILTER (WHERE ${Prisma.raw(def.y)}))::float8 AS y
            FROM ranking_events
           WHERE experiment_key = ${key}
             AND created_at >= ${from}
             AND variant IS NOT NULL
           GROUP BY variant, COALESCE(user_id::text, item_id, 'anon')
        ) t
       WHERE x > 0
       GROUP BY variant`);
    return new Map(rows.map((r) => [r.variant, { ...r }]));
  }

  /** Per variant: cases posted at least 24 h ago, time to first bid (cap 24 h). */
  private async caseStats(
    key: string,
    from: Date,
  ): Promise<
    Map<string, { n: number; sum: number; sumSq: number; noBid: number }>
  > {
    const rows = await this.prisma.$queryRaw<
      { variant: string; n: number; s: number; ss: number; nobid: number }[]
    >(Prisma.sql`
      SELECT variant,
             count(*)::int AS n,
             sum(h)::float8 AS s,
             sum(h * h)::float8 AS ss,
             (count(*) FILTER (WHERE h >= 24))::int AS nobid
        FROM (
          SELECT c.variant,
                 least(
                   COALESCE(extract(epoch FROM (b.first_bid - c.created_at)) / 3600.0, 24),
                   24
                 )::float8 AS h
            FROM ranking_events c
            LEFT JOIN LATERAL (
              SELECT min(r.created_at) AS first_bid
                FROM ranking_events r
               WHERE r.kind = 'bid'
                 AND r.experiment_key = c.experiment_key
                 AND r.item_id = c.item_id
                 AND r.created_at >= c.created_at
                 AND r.created_at < c.created_at + interval '24 hours'
            ) b ON true
           WHERE c.kind = 'case_posted'
             AND c.experiment_key = ${key}
             AND c.created_at >= ${from}
             AND c.created_at <= now() - make_interval(hours => ${MIN_AGE_HOURS_FOR_CASES})
             AND c.variant IS NOT NULL
        ) t
       GROUP BY variant`);
    return new Map(
      rows.map((r) => [
        r.variant,
        { n: r.n, sum: r.s, sumSq: r.ss, noBid: r.nobid },
      ]),
    );
  }

  /**
   * Fairness: of the attorneys who signed up shortly before they entered the
   * experiment, how many were shown at least one case. Only users whose
   * impressions are stored (the sample) can be judged, so the others are left
   * out of both sides.
   */
  private async newAttorneyOpportunity(
    experimentId: string,
    key: string,
    from: Date,
  ): Promise<Map<string, { n: number; hit: number }>> {
    const out = new Map<string, { n: number; hit: number }>();
    const sample = await this.settings.number(
      'ranking.impression_sample_percent',
    );
    const units = await this.prisma.$queryRaw<
      { variant: string; id: string }[]
    >(
      Prisma.sql`
      SELECT e.variant, u.id::text AS id
        FROM experiment_exposures e
        JOIN users u
          ON u.id = CASE WHEN e.unit_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN e.unit_id::uuid END
       WHERE e.experiment_id = ${experimentId}::uuid
         AND u.role = 'attorney'
         AND u.created_at >= e.first_at - make_interval(days => ${NEW_ATTORNEY_DAYS})
       LIMIT ${OPPORTUNITY_MAX_UNITS}`,
    );
    const sampled = units.filter((u) => inImpressionSample(u.id, sample));
    if (sampled.length === 0) return out;
    const hits = new Set<string>();
    for (let i = 0; i < sampled.length; i += OPPORTUNITY_CHUNK) {
      const ids = sampled.slice(i, i + OPPORTUNITY_CHUNK).map((u) => u.id);
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT user_id::text AS id
          FROM ranking_events
         WHERE experiment_key = ${key}
           AND kind = 'impression'
           AND created_at >= ${from}
           AND user_id = ANY(${ids}::uuid[])`);
      for (const r of rows) hits.add(r.id);
    }
    for (const u of sampled) {
      const cur = out.get(u.variant) ?? { n: 0, hit: 0 };
      cur.n++;
      if (hits.has(u.id)) cur.hit++;
      out.set(u.variant, cur);
    }
    return out;
  }

  private buildMetric(
    def: Pick<MetricDef, 'key' | 'label' | 'unit' | 'better'>,
    variants: VariantWeight[],
    valueOf: (variant: string) => MetricVariantValue | null,
  ): MetricResult {
    const byVariant: Record<string, MetricVariantValue> = {};
    for (const v of variants) {
      const val = valueOf(v.key);
      if (val) byVariant[v.key] = val;
    }
    const vsControl: Record<string, MetricVsControl> = {};
    const control = byVariant['control'];
    if (control) {
      for (const v of variants) {
        const t = byVariant[v.key];
        if (v.key === 'control' || !t) continue;
        const d = differenceOf(control, t);
        let verdict: MetricVsControl['verdict'] = 'same';
        if (control.n < MIN_SUBJECTS || t.n < MIN_SUBJECTS) verdict = 'few';
        else if (d.low > 0) verdict = def.better === 'up' ? 'better' : 'worse';
        else if (d.high < 0) verdict = def.better === 'up' ? 'worse' : 'better';
        vsControl[v.key] = { ...d, verdict };
      }
    }
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      better: def.better,
      variants: byVariant,
      vsControl,
    };
  }

  /**
   * Reports and errors per 1000 impressions: stop when a variant is worse
   * than control by more than the allowed percent AND the whole (peeking-
   * corrected) interval of the difference is above zero.
   */
  private guardrails(
    metrics: MetricResult[],
    variants: VariantWeight[],
    g: Guardrails,
  ): { tripped: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const rules: [string, number, string][] = [
      ['reports', g.reportsRelIncreasePct, 'жалоб'],
      ['errors', g.errorsRelIncreasePct, 'ошибок'],
    ];
    for (const [key, maxPct, what] of rules) {
      const m = metrics.find((x) => x.key === key);
      const control = m?.variants['control'];
      if (!m || !control) continue;
      for (const v of variants) {
        const t = m.variants[v.key];
        if (v.key === 'control' || !t) continue;
        if (control.volume < g.minImpressions || t.volume < g.minImpressions)
          continue;
        const d = differenceOf(control, t, GUARDRAIL_Z);
        if (d.relative !== null && d.relative * 100 > maxPct && d.low > 0) {
          reasons.push(
            `«${v.key}»: ${what} на 1000 показов выросло на ${Math.round(d.relative * 100)}% против «control» (порог ${maxPct}%)`,
          );
        }
      }
    }
    return { tripped: reasons.length > 0, reasons };
  }
}

// ---- plain-Russian summary ----------------------------------------------

function fmt(unit: MetricUnit, v: number): string {
  if (unit === 'share') return `${(v * 100).toFixed(1).replace('.', ',')}%`;
  if (unit === 'hours') return `${v.toFixed(1).replace('.', ',')} ч`;
  return `${v.toFixed(1).replace('.', ',')}`;
}

export function summarize(
  metrics: MetricResult[],
  variants: VariantWeight[],
  srm: SrmResult,
  guardrail: { tripped: boolean; reasons: string[] },
): string[] {
  const lines: string[] = [];
  if (srm.flag) {
    lines.push(
      'Внимание: людей в вариантах разделилось не так, как задумано (проверка SRM). Результатам верить нельзя, пока причина не найдена: остановите тест.',
    );
  }
  if (guardrail.tripped) {
    for (const r of guardrail.reasons)
      lines.push(`Тест остановлен защитой: ${r}.`);
  }
  const head =
    metrics.find(
      (m) => m.key === 'ctr' && Object.keys(m.vsControl).length > 0,
    ) ??
    metrics.find(
      (m) => m.key === 'bid_rate' && Object.keys(m.vsControl).length > 0,
    ) ??
    metrics.find(
      (m) => m.key === 'accept_rate' && Object.keys(m.vsControl).length > 0,
    );
  if (!head) {
    lines.push('Пока мало данных: сравнивать варианты рано.');
    return lines;
  }
  for (const v of variants) {
    const d = head.vsControl[v.key];
    if (!d) continue;
    const t = head.variants[v.key];
    const c = head.variants['control'];
    const pct =
      d.relative === null
        ? ''
        : ` (${d.relative >= 0 ? '+' : ''}${Math.round(d.relative * 100)}%)`;
    const base = `«${v.key}»: ${head.label.toLowerCase()} — ${fmt(head.unit, t.value)} против ${fmt(head.unit, c.value)} у «control»${pct}`;
    if (d.verdict === 'few')
      lines.push(`${base}. Данных ещё мало, вывода нет.`);
    else if (d.verdict === 'better') lines.push(`${base}. Лучше надёжно.`);
    else if (d.verdict === 'worse') lines.push(`${base}. Хуже надёжно.`);
    else lines.push(`${base}. Разницы пока не видно.`);
  }
  for (const m of metrics) {
    if (m === head) continue;
    for (const [vk, d] of Object.entries(m.vsControl)) {
      if (d.verdict === 'worse') {
        lines.push(
          `«${vk}»: хуже по показателю «${m.label.toLowerCase()}». Проверьте перед включением.`,
        );
      }
    }
  }
  return lines;
}
