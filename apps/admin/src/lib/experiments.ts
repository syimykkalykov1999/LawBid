/** Types and plain-Russian labels for the «Эксперименты» page (owner 2026-10-25). */

export interface ExperimentVariant {
  key: string;
  weight: number;
  /** Formula weight overrides of this variant (none = as now). */
  weights?: Record<string, number>;
}

/**
 * Owner 2026-11-08: where a test can run and the formula weights its new
 * variant may change (same names as «Настройки → reco.<формула>.<вес>»).
 */
export const SURFACE_WEIGHTS: Record<string, readonly string[]> = {
  case_feed: [
    'practice', 'state', 'fresh', 'budget', 'competition', 'urgency',
    'client', 'demand', 'clientActive', 'urgentActive', 'dateNear',
  ],
  people: [
    'contact', 'state', 'practice', 'mutual', 'followsMe', 'quality',
    'activity', 'affinity', 'identity', 'popularity',
  ],
  posts: ['hot', 'interest', 'social', 'fresh', 'language', 'authorQuality', 'state', 'affinity'],
  search: [],
};

/**
 * «urgency=0.3, practice=0.2» → { urgency: 0.3, practice: 0.2 }. Empty text
 * = no overrides. Returns the problem in plain Russian instead when a name
 * is not a weight of [surface] or a value is not a number from 0 to 10.
 */
export function parseVariantWeights(
  text: string,
  surface: string,
): { weights: Record<string, number> } | { error: string } {
  const out: Record<string, number> = {};
  const known = SURFACE_WEIGHTS[surface];
  for (const part of text.split(/[;\n]+|,(?=\s*[a-zA-Z])/)) {
    const t = part.trim();
    if (!t) continue;
    const m = /^([a-zA-Z][a-zA-Z0-9_]*)\s*[=:]\s*(-?[0-9]+(?:[.,][0-9]+)?)$/.exec(t);
    if (!m) return { error: `Не понял «${t}»: пишите «имя=число»` };
    const name = m[1];
    const value = Number(m[2].replace(',', '.'));
    if (known && !known.includes(name)) {
      return { error: `«${name}» — не вес раздела ${surface}` };
    }
    if (!(value >= 0 && value <= 10)) return { error: `«${name}»: число от 0 до 10` };
    out[name] = value;
  }
  return { weights: out };
}

export type MetricUnit = 'share' | 'per1000' | 'hours';

export interface MetricValue {
  value: number;
  low: number;
  high: number;
  n: number;
  volume: number;
}

export interface MetricVsControl {
  diff: number;
  relative: number | null;
  verdict: 'better' | 'worse' | 'same' | 'few';
}

export interface ReportMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  variants: Record<string, MetricValue>;
  vsControl: Record<string, MetricVsControl>;
}

export interface Report {
  metrics: ReportMetric[];
}

export interface Experiment {
  id: string;
  key: string;
  name: string;
  hypothesis: string | null;
  surface: string;
  status: 'draft' | 'running' | 'stopped';
  variants: ExperimentVariant[];
  trafficPercent: number;
  startedAt: string | null;
  endAt: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  stoppedBySystem: boolean;
  exposed: number;
  latest: {
    computedAt: string;
    srmP: number | null;
    srmFlag: boolean;
    guardrailTripped: boolean;
    summary: string[];
    report: Record<string, unknown>;
  } | null;
}

export function statusLabel(s: Experiment['status']): string {
  return s === 'draft' ? 'черновик' : s === 'running' ? 'идёт' : 'остановлен';
}

export function verdictLabel(v: MetricVsControl['verdict']): string {
  switch (v) {
    case 'better':
      return 'лучше';
    case 'worse':
      return 'хуже';
    case 'same':
      return 'разницы не видно';
    default:
      return 'мало данных';
  }
}

const num = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

export function formatMetric(unit: MetricUnit, v: Pick<MetricValue, 'value' | 'low' | 'high' | 'n'>): string {
  if (unit === 'share') {
    return `${num(v.value * 100)}% (${num(v.low * 100)}-${num(v.high * 100)})`;
  }
  if (unit === 'hours') return `${num(v.value)} ч (${num(v.low)}-${num(v.high)})`;
  return `${num(v.value)} (${num(v.low)}-${num(v.high)})`;
}

/** The report is stored as loose JSON; keep only what the page reads. */
export function asReport(raw: Record<string, unknown>): Report {
  const metrics = Array.isArray(raw.metrics) ? (raw.metrics as ReportMetric[]) : [];
  return { metrics };
}
