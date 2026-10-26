import {
  COST_REGISTRY,
  mid,
  type CostControl,
  type CostEntry,
  type CostState,
} from './cost-registry';

/**
 * Pure parts of the registry service (no I/O): which stored value means which
 * state, and how this month's real bills are attributed to registry rows.
 * Unit tested in cost-registry.logic.spec.ts.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b) && a !== null && b !== null;
  }
  return a === b;
};

export interface ResolvedState {
  state: CostState;
  /** false: the stored value is none of the known positions. */
  known: boolean;
  note: string | null;
}

/**
 * app-setting controls: `stored` is what app_config holds (undefined = no
 * row), `fallback` the built-in default of the key. The map value `'default'`
 * means «no stored row».
 */
export function stateFromStored(
  entry: CostEntry,
  stored: unknown,
  fallback: unknown,
): ResolvedState {
  const c = entry.control;
  if (c.type !== 'app-setting') {
    return { state: entry.defaultState, known: false, note: null };
  }
  const noRow = stored === undefined || stored === null;
  const effective = noRow ? fallback : stored;
  const order: CostState[] = ['off', 'on', 'auto'];
  // Explicit values first, the 'default' sentinel last.
  for (const st of order) {
    const v = c.map[st];
    if (v === undefined || v === 'default') continue;
    if (sameValue(effective, v)) return { state: st, known: true, note: null };
  }
  for (const st of order) {
    if (c.map[st] === 'default' && noRow) {
      return { state: st, known: true, note: null };
    }
  }
  return {
    state: entry.defaultState,
    known: false,
    note: `Сейчас в настройке стоит своё значение (${JSON.stringify(effective)}): оно не совпадает ни с одним положением переключателя.`,
  };
}

/** SSM `on | dry-run | off` ↔ Выкл / Вкл / Авто. */
export const SSM_STATE_BY_MODE: Record<string, CostState> = {
  off: 'off',
  'dry-run': 'on',
  on: 'auto',
};
export const SSM_MODE_BY_STATE: Record<CostState, 'on' | 'dry-run' | 'off'> = {
  off: 'off',
  on: 'dry-run',
  auto: 'on',
};

/** What a state means, in words, for the controls whose «Вкл» is not obvious. */
export function stateHint(
  control: CostControl,
  state: CostState,
): string | null {
  if (control.type === 'ssm-mode') {
    if (state === 'on') {
      return 'Вкл: только письма «что бы я сделал», ничего не меняет.';
    }
    if (state === 'auto') return 'Авто: сам меняет размер по нагрузке.';
    return 'Выкл: размер не меняется сам.';
  }
  return null;
}

// --- real numbers ----------------------------------------------------------

export interface AwsServiceLine {
  service: string;
  gross: number;
  credits: number;
}

export interface VendorNumbers {
  id: string;
  monthToDateUsd: number | null;
  forecastUsd: number | null;
  lines: { label: string; usd: number }[];
}

export interface Attribution {
  monthUsd: number | null;
  projectedUsd: number | null;
  /** real: one service / vendor line; split: shared service divided by the
   * launch estimate; none: no bill is read for this row. */
  source: 'real' | 'split' | 'none';
}

export interface AttributionResult {
  byId: Record<string, Attribution>;
  /** AWS services on the bill that no entry claims (a missing registry line). */
  unclaimed: { service: string; usd: number }[];
}

/**
 * Attributes this month's bills to registry rows.
 *  - AWS: Cost Explorer SERVICE → the entries that name it in `ceService`;
 *    one owner = real, several = split by their launch estimate (Fargate is
 *    one service for API, worker and admin).
 *  - Vendors: the spend reader of that vendor (`spendVendor.id`), the whole
 *    month or only the lines that contain `spendVendor.line`.
 *  `awsRatio` projects the month (forecast ÷ month-to-date of the whole AWS
 *  bill), `vendorRatio` the same per vendor.
 */
export function attributeSpend(
  entries: readonly CostEntry[],
  aws: AwsServiceLine[] | null,
  awsRatio: number | null,
  vendors: VendorNumbers[],
  now: Date,
): AttributionResult {
  const byId: Record<string, Attribution> = {};
  for (const e of entries) {
    byId[e.id] = { monthUsd: null, projectedUsd: null, source: 'none' };
  }
  const linear = (usd: number) => {
    const day = Math.max(now.getUTCDate(), 3);
    const total = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return (usd / day) * total;
  };

  const unclaimed: { service: string; usd: number }[] = [];
  if (aws) {
    const claimed = new Set<string>();
    for (const line of aws) {
      const claimedBy = entries.filter((e) => e.ceService === line.service);
      // Items that are OFF by default do not share the bill unless alone.
      const active = claimedBy.filter((e) => e.defaultState !== 'off');
      const owners = active.length > 0 ? active : claimedBy;
      const net = Math.max(0, line.gross - Math.min(line.credits, line.gross));
      if (owners.length === 0) {
        if (net > 0.005)
          unclaimed.push({ service: line.service, usd: round2(net) });
        continue;
      }
      claimed.add(line.service);
      const weights = owners.map((e) => Math.max(mid(e.usd.launch), 0.01));
      const sum = weights.reduce((a, b) => a + b, 0);
      owners.forEach((e, i) => {
        const part = owners.length === 1 ? net : (net * weights[i]) / sum;
        byId[e.id] = {
          monthUsd: round2(part),
          projectedUsd: round2(awsRatio ? part * awsRatio : linear(part)),
          source: owners.length === 1 ? 'real' : 'split',
        };
      });
    }
    // A service claimed by an entry but absent from the bill costs nothing yet.
    for (const e of entries) {
      if (e.ceService && !claimed.has(e.ceService)) {
        byId[e.id] = { monthUsd: 0, projectedUsd: 0, source: 'real' };
      }
    }
  }

  for (const e of entries) {
    if (!e.spendVendor) continue;
    const v = vendors.find((x) => x.id === e.spendVendor!.id);
    if (!v || v.monthToDateUsd === null) continue;
    const part = e.spendVendor.line
      ? v.lines
          .filter((l) => l.label.includes(e.spendVendor!.line!))
          .reduce((s, l) => s + l.usd, 0)
      : v.monthToDateUsd;
    const ratio =
      v.forecastUsd !== null && v.monthToDateUsd > 0
        ? v.forecastUsd / v.monthToDateUsd
        : null;
    byId[e.id] = {
      monthUsd: round2(part),
      projectedUsd: round2(ratio ? part * ratio : linear(part)),
      source: 'real',
    };
  }
  return { byId, unclaimed };
}

export function registryEntries(): readonly CostEntry[] {
  return COST_REGISTRY;
}
