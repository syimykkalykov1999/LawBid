import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ndcgAtK, Z95 } from './experiment-math';

/**
 * Offline replay (owner 2026-10-25): take the lists people were really shown
 * (impressions with the 0..1 features the formula saw), score them again with
 * NEW weights, and compare NDCG@10 of the old order with the new one, using
 * what people then did (click 1, bid 2, accepted 3) as the "right answer".
 * Run it before turning a weight change on.
 *
 * Honest limits: only items that WERE shown can be judged (a new formula
 * that would surface items nobody saw cannot be measured offline), and
 * the old order is whatever the old formula (plus jitter and diversity) did.
 * Use it to rule out bad changes, then confirm good ones with a 5-10% test.
 */
export interface ReplayImpression {
  listId: string;
  itemId: string;
  position: number;
  features: Record<string, number>;
  /** 0 nothing, 1 click, 2 bid, 3 accepted. */
  relevance: number;
}

export interface ReplayResult {
  lists: number;
  /** Lists where somebody did something (the only ones NDCG can judge). */
  judgedLists: number;
  k: number;
  oldNdcg: number;
  newNdcg: number;
  /** newNdcg - oldNdcg, with a 95% interval over lists. */
  delta: number;
  low: number;
  high: number;
  /** Plain Russian verdict. */
  verdict: string;
}

export function scoreWith(
  weights: Record<string, number>,
  features: Record<string, number>,
): number {
  let s = 0;
  for (const [k, w] of Object.entries(weights)) {
    const f = features[k];
    if (typeof f === 'number' && Number.isFinite(f))
      s += w * Math.min(1, Math.max(0, f));
  }
  return s;
}

export function replayNdcg(
  impressions: readonly ReplayImpression[],
  weights: Record<string, number>,
  k = 10,
): ReplayResult {
  const lists = new Map<string, ReplayImpression[]>();
  for (const i of impressions) {
    const arr = lists.get(i.listId) ?? [];
    arr.push(i);
    lists.set(i.listId, arr);
  }
  const diffs: number[] = [];
  let sumOld = 0;
  let sumNew = 0;
  for (const items of lists.values()) {
    if (!items.some((i) => i.relevance > 0)) continue;
    const shown = [...items].sort((a, b) => a.position - b.position);
    const rescored = shown
      .map((i, idx) => ({ i, idx, s: scoreWith(weights, i.features) }))
      .sort((a, b) => b.s - a.s || a.idx - b.idx)
      .map((x) => x.i);
    const o = ndcgAtK(
      shown.map((i) => i.relevance),
      k,
    );
    const n = ndcgAtK(
      rescored.map((i) => i.relevance),
      k,
    );
    sumOld += o;
    sumNew += n;
    diffs.push(n - o);
  }
  const judged = diffs.length;
  if (judged === 0) {
    return {
      lists: lists.size,
      judgedLists: 0,
      k,
      oldNdcg: 0,
      newNdcg: 0,
      delta: 0,
      low: 0,
      high: 0,
      verdict: 'Нет списков, где люди что-то нажали: сравнивать не с чем.',
    };
  }
  const mean = diffs.reduce((s, d) => s + d, 0) / judged;
  const variance =
    judged > 1
      ? diffs.reduce((s, d) => s + (d - mean) * (d - mean), 0) / (judged - 1)
      : 0;
  const se = Math.sqrt(variance / judged);
  const low = mean - Z95 * se;
  const high = mean + Z95 * se;
  const verdict =
    judged < 100
      ? 'Данных мало (меньше 100 списков с действиями): вывода нет.'
      : low > 0
        ? 'Новые веса надёжно лучше старых на этих показах. Можно пробовать на 5-10% людей.'
        : high < 0
          ? 'Новые веса надёжно хуже старых. Не включайте.'
          : 'Разницы не видно. Включать нет смысла без пользы.';
  return {
    lists: lists.size,
    judgedLists: judged,
    k,
    oldNdcg: sumOld / judged,
    newNdcg: sumNew / judged,
    delta: mean,
    low,
    high,
    verdict,
  };
}

@Injectable()
export class RankingReplayService {
  constructor(private readonly prisma: PrismaService) {}

  async load(opts: {
    surface: string;
    days: number;
    limit?: number;
  }): Promise<ReplayImpression[]> {
    const from = new Date(Date.now() - opts.days * 86_400_000);
    const rows = await this.prisma.$queryRaw<
      {
        list_id: string;
        item_id: string;
        position: number;
        features: Record<string, number>;
        rel: number;
      }[]
    >(Prisma.sql`
      SELECT i.list_id, i.item_id, i.position::int AS position, i.features,
             COALESCE(max(CASE a.kind WHEN 'click' THEN 1 WHEN 'bid' THEN 2 WHEN 'accept' THEN 3 END), 0)::int AS rel
        FROM ranking_events i
        LEFT JOIN ranking_events a
          ON a.user_id = i.user_id
         AND a.item_id = i.item_id
         AND a.surface = i.surface
         AND a.kind IN ('click', 'bid', 'accept')
         AND a.created_at >= i.created_at
         AND a.created_at < i.created_at + interval '24 hours'
       WHERE i.kind = 'impression'
         AND i.surface = ${opts.surface}
         AND i.created_at >= ${from}
         AND i.features IS NOT NULL
         AND i.list_id IS NOT NULL
         AND i.position IS NOT NULL
       GROUP BY i.id, i.created_at
       LIMIT ${opts.limit ?? 500_000}`);
    return rows.map((r) => ({
      listId: r.list_id,
      itemId: r.item_id,
      position: r.position,
      features: r.features,
      relevance: r.rel,
    }));
  }

  async replay(opts: {
    surface: string;
    days: number;
    weights: Record<string, number>;
    k?: number;
  }): Promise<ReplayResult> {
    return replayNdcg(await this.load(opts), opts.weights, opts.k ?? 10);
  }
}
