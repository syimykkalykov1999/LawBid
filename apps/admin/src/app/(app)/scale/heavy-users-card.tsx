'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import {
  HEAVY_METRIC_TITLES,
  heavyScore,
  heavyShare,
  type HeavyHitters,
  type HeavyMetric,
} from '@/lib/scale';

type Entry = HeavyHitters['metrics'][number]['users'][number];

/**
 * WP-G (2026-10-25): «Тяжёлые пользователи» — who and which case loads the
 * system the most over the last hour: requests, database time, uploads and
 * messages. Top 20 each; a click opens the user or the case. The numbers
 * come from a Redis top-K (no per-user CloudWatch metrics, no extra cost).
 */
export function HeavyUsersCard() {
  const [metric, setMetric] = useState<HeavyMetric>('requests');
  const q = useQuery({
    queryKey: ['heavy-hitters'],
    queryFn: async () => (await api.GET('/admin/system-health/heavy-hitters')).data!.data as HeavyHitters,
    refetchInterval: livePoll(),
  });
  const d = q.data;
  const m = d?.metrics.find((x) => x.metric === metric);

  return (
    <>
      <SectionTitle>Тяжёлые пользователи</SectionTitle>
      <Card className="mb-6 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(HEAVY_METRIC_TITLES) as HeavyMetric[]).map((k) => (
            <Button key={k} size="sm" variant={k === metric ? 'gold' : 'outline'} onClick={() => setMetric(k)}>
              {HEAVY_METRIC_TITLES[k]}
            </Button>
          ))}
          <span className="min-w-0 flex-1 text-xs text-muted">
            {d
              ? d.enabled
                ? `за последние ${d.windowMinutes} мин; запросы считаются выборочно (1 из ${d.sampleEvery}), числа пересчитаны`
                : 'Счётчик выключен (HEAVY_HITTERS_SAMPLE=0).'
              : ''}
          </span>
        </div>
        {q.error ? <p className="text-sm text-danger">{errorText(q.error)}</p> : null}
        {!d ? (
          <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Column title="Пользователи" metric={metric} rows={m?.users ?? []} href={(id) => `/users/${id}`} />
            <Column title="Кейсы" metric={metric} rows={m?.cases ?? []} href={(id) => `/cases/${id}`} />
          </div>
        )}
      </Card>
    </>
  );
}

function Column({
  title,
  metric,
  rows,
  href,
}: {
  title: string;
  metric: HeavyMetric;
  rows: Entry[];
  href: (id: string) => string;
}) {
  const top = rows[0]?.score ?? 0;
  return (
    <div className="min-w-0">
      <div className="mb-2 text-sm font-medium text-heading">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Пока нет данных за этот час.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.id} className="relative overflow-hidden rounded-md">
              <div
                className="absolute inset-y-0 left-0 bg-surface-2"
                style={{ width: `${heavyShare(r.score, top)}%` }}
                aria-hidden
              />
              <div className="relative flex items-center gap-2 px-2 py-1 text-sm">
                <span className="w-5 shrink-0 text-xs text-muted">{i + 1}</span>
                <Link href={href(r.id)} className="min-w-0 flex-1 truncate text-gold-600 underline-offset-2 hover:underline">
                  {r.label ?? r.id.slice(0, 8)}
                </Link>
                {r.role ? <Badge tone="neutral">{r.role}</Badge> : null}
                <span className="shrink-0 tabular-nums text-ink">{heavyScore(metric, r.score)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
