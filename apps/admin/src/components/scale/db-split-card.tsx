'use client';

import { CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { api, errorText } from '@/lib/api/client';
import { allStepsDone, dbSplitSteps, DEFAULT_TARGET_DB, splitCommands, type ShardsOverview, type SplitPlan } from '@/lib/db-split';

/**
 * Owner 2026-10-27: «Разделить базу» on «Масштаб». While the switch
 * scale.db_split_enabled is OFF the card is exactly the old placeholder.
 * ON: a guided, read-only step list (second database configured? answers?
 * migrations applied? plan clean?) read from the existing shard probes,
 * «Проверить» runs the dry plan, the exact commands and the guide are
 * named. Nothing destructive here: the move itself is started on «Здоровье
 * системы» with one fresh 2FA code.
 */
export function DbSplitCard({ enabled }: { enabled: boolean }) {
  const [toDb] = useState(DEFAULT_TARGET_DB);
  const [checking, setChecking] = useState(false);
  const overview = useQuery({
    queryKey: ['shards-overview'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => (await api.GET('/admin/shards/overview')).data!.data as ShardsOverview,
  });
  const plan = useQuery({
    queryKey: ['shards-plan', toDb],
    enabled: enabled && checking,
    retry: false,
    queryFn: async () => (await api.GET('/admin/shards/split-plan', { params: { query: { toDb } } })).data!.data as SplitPlan,
  });

  if (!enabled) {
    return (
      <Card className="flex min-w-0 flex-col gap-2 p-4" data-testid="db-split-card">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm font-medium text-heading">Разделить базу</div>
          <span className="shrink-0">
            <Badge tone="neutral">Пока недоступно</Badge>
          </span>
        </div>
        <p className="break-words text-sm text-muted">
          Разнос данных по двум базам, когда одной станет тесно. Кнопка включится, когда будут готовы проверки и откат.
        </p>
        <Button variant="outline" size="sm" disabled className="self-start">
          Разделить базу
        </Button>
        <p className="text-xs text-muted">появится после шагов 9-10</p>
      </Card>
    );
  }

  const steps = dbSplitSteps(overview.data, plan.data, toDb);
  const ready = plan.data !== undefined && allStepsDone(steps);
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4" data-testid="db-split-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">Разделить базу</div>
        <span className="shrink-0">
          <Badge tone={ready ? 'success' : plan.data ? 'warning' : 'neutral'} dot>
            {ready ? 'Можно начинать' : plan.data ? 'Не готово' : 'Проверка готовности'}
          </Badge>
        </span>
      </div>
      <p className="break-words text-sm text-muted">
        Только проверка: ничего не меняется. Сам перенос запускается на «Здоровье системы» с кодом 2FA, откат доступен 7 дней.
      </p>
      <ol className="divide-y divide-line text-sm" data-testid="db-split-steps">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 py-1.5" data-testid={`db-split-step-${s.id}`}>
            {s.state === true ? (
              <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-success" />
            ) : s.state === false ? (
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <Circle size={16} weight="light" className="mt-0.5 shrink-0 text-faint" />
            )}
            <div className="min-w-0">
              <div className="text-heading">{s.label}</div>
              <div className="text-xs text-muted">{s.note}</div>
            </div>
          </li>
        ))}
      </ol>
      {plan.error ? <p className="text-xs text-danger">{errorText(plan.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" loading={plan.isFetching} onClick={() => (checking ? void plan.refetch() : setChecking(true))}>
          Проверить
        </Button>
        <Link href="/guides/db-split" className="self-center text-xs font-medium text-gold-600 hover:underline">
          Открыть инструкцию
        </Link>
        <Link href="/system-health" className="self-center text-xs font-medium text-gold-600 hover:underline">
          К переносу («Здоровье системы»)
        </Link>
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Те же проверки с компьютера (ничего не меняют)</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-ink">{splitCommands(toDb).join('\n')}</pre>
      </details>
    </Card>
  );
}
