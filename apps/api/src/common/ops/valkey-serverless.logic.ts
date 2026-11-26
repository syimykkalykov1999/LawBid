/**
 * Item 29 (AU5, owner 25.11): node-based Valkey vs ElastiCache Serverless for
 * Valkey, priced on the load we really measured. Pure: no AWS, no clock.
 *
 * Prices: AWS «Amazon ElastiCache pricing», US East (N. Virginia), read
 * 25.11.2026 (https://aws.amazon.com/elasticache/pricing/):
 * - Serverless Valkey: $0.084 per GB-hour of data stored (minimum 100 MB
 *   per cache), $0.0023 per million ECPUs; «reads and writes require 1 ECPU
 *   for each kilobyte (KB) of data transferred», commands that use more
 *   vCPU time take more ECPUs.
 * - Node-based Valkey (20 % under Redis OSS): the same table as
 *   infra/modules/redis-autoscale (cache.r7g.large $0.1752/h is also on the
 *   pricing page, example 7).
 * Serverless prices are admin settings (infra.valkey_serverless_*_usd), so a
 * price change or another Region needs no release.
 */

export const HOURS_PER_MONTH = 730;
/** AWS: «minimum metered for data stored: 100 MB per cache» (Valkey). */
export const SERVERLESS_MIN_GB = 0.1;

/** On-demand $/hour of one node-based Valkey node, us-east-1 (the
 * redis-autoscale ladder, modules/redis-autoscale main.tf node_hourly). */
export const VALKEY_NODE_HOURLY_USD: Readonly<Record<string, number>> = {
  'cache.t4g.micro': 0.0128,
  'cache.t4g.small': 0.0256,
  'cache.t4g.medium': 0.052,
  'cache.r7g.large': 0.1752,
  'cache.r7g.xlarge': 0.3496,
  'cache.r7g.2xlarge': 0.6984,
};

/** One day of measured load of the node group. */
export interface ValkeyDayLoad {
  day: string;
  /** Average data in memory (BytesUsedForCache of the primary), GB. */
  gbStored: number;
  /** All commands of the day per second (KeyBasedCmds + NonKeyTypeCmds). */
  commandsPerSec: number;
  /** Network in + out of the day per second, bytes. */
  bytesPerSec: number;
}

export interface ServerlessPrices {
  gbHourUsd: number;
  millionEcpuUsd: number;
  /** ECPU per command of our load (Lua scripts cost more than a GET). */
  ecpuFactor: number;
}

/** Monthly $ of one day's load on Serverless (storage + ECPU). */
export function serverlessMonthlyUsd(
  load: Pick<ValkeyDayLoad, 'gbStored' | 'commandsPerSec' | 'bytesPerSec'>,
  p: ServerlessPrices,
): { storageUsd: number; ecpuUsd: number; totalUsd: number } {
  const gb = Math.max(SERVERLESS_MIN_GB, load.gbStored);
  const ecpuPerSec = Math.max(
    load.commandsPerSec * Math.max(1, p.ecpuFactor),
    load.bytesPerSec / 1024,
  );
  const storageUsd = gb * p.gbHourUsd * HOURS_PER_MONTH;
  const ecpuUsd =
    ((ecpuPerSec * 3600 * HOURS_PER_MONTH) / 1_000_000) * p.millionEcpuUsd;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    storageUsd: r(storageUsd),
    ecpuUsd: r(ecpuUsd),
    totalUsd: r(storageUsd + ecpuUsd),
  };
}

/** Monthly $ of the node group as it runs now (null: unknown node type). */
export function nodeMonthlyUsd(nodeType: string, nodes: number): number | null {
  const h = VALKEY_NODE_HOURLY_USD[nodeType];
  if (h === undefined || !(nodes >= 1)) return null;
  return Math.round(h * HOURS_PER_MONTH * nodes * 100) / 100;
}

export interface ValkeyVerdict {
  verdict: 'serverless' | 'nodes' | 'unknown';
  /** Monthly $ now on nodes. */
  nodeUsd: number | null;
  /** Monthly $ on Serverless at the most expensive measured day. */
  serverlessUsd: number | null;
  /** Days that were measured. */
  days: number;
}

/**
 * Serverless wins only when EVERY measured day is cheaper on it by at least
 * `minSavingPct`, over at least `needDays` days (a quiet weekend alone never
 * moves the cache). The worst day sets the Serverless price shown.
 */
export function compareValkey(
  days: ValkeyDayLoad[],
  nodeType: string,
  nodes: number,
  p: ServerlessPrices,
  minSavingPct: number,
  needDays: number,
): ValkeyVerdict {
  const nodeUsd = nodeMonthlyUsd(nodeType, nodes);
  if (nodeUsd === null || days.length === 0) {
    return {
      verdict: 'unknown',
      nodeUsd,
      serverlessUsd: null,
      days: days.length,
    };
  }
  const costs = days.map((d) => serverlessMonthlyUsd(d, p).totalUsd);
  const worst = Math.max(...costs);
  if (days.length < Math.max(1, needDays)) {
    return {
      verdict: 'unknown',
      nodeUsd,
      serverlessUsd: worst,
      days: days.length,
    };
  }
  const line = nodeUsd * (1 - Math.max(0, minSavingPct) / 100);
  return {
    verdict: costs.every((c) => c <= line) ? 'serverless' : 'nodes',
    nodeUsd,
    serverlessUsd: worst,
    days: days.length,
  };
}

/** Plain Russian for «Расходы → Реестр». */
export function valkeyNote(v: ValkeyVerdict, needDays: number): string {
  const usd = (x: number | null) =>
    x === null ? '—' : `$${x.toFixed(2).replace('.', ',')}`;
  if (v.verdict === 'unknown') {
    return v.nodeUsd === null
      ? 'Сравнение Valkey: тип узла не распознан, цену узлов посчитать нельзя.'
      : `Сравнение Valkey: замеров ${v.days} из ${needDays} дней; узлы сейчас ≈ ${usd(v.nodeUsd)}/мес.`;
  }
  const head = `Valkey: узлы ≈ ${usd(v.nodeUsd)}/мес, Serverless при нашей нагрузке ≈ ${usd(v.serverlessUsd)}/мес (самый дорогой день из ${v.days})`;
  return v.verdict === 'serverless'
    ? `${head}. Serverless дешевле каждый день — пора переходить: docs/runbooks/valkey-serverless.md.`
    : `${head}. Узлы дешевле или почти так же — остаёмся на узлах.`;
}
