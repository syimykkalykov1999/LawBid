/** Types and plain-Russian labels for the «Эксперименты» page (owner 2026-10-25). */

export interface ExperimentVariant {
  key: string;
  weight: number;
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
