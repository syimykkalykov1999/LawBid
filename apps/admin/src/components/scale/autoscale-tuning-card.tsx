'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { tuningChanges, type TuningTarget } from '@/lib/autoscale-tuning';

const KEY = ['autoscale-tuning'] as const;
const TITLE: Record<string, string> = { redis: 'Redis', db: 'База', endpoints: 'Точки доступа AWS', ecs: 'Серверы ECS (цель, паузы, минимум, Spot)', spot: 'Запасные серверы вместо Spot' };
/** Owner 15.11: what changing the minimum and the Spot split does. */
export const ECS_HINT =
  'Минимум серверов применяется сразу (не выше максимума «Масштаб»). Доли Spot: первые N серверов всегда обычные, остальные делятся по весам обычные:Spot. ' +
  'Смена долей запускает новое развёртывание сервиса в течение 5 минут: AWS заменяет серверы по одному (у пула соединений с одним сервером — короткая пауза, лучше менять ночью). При Spot-автомате «Выкл» доли не применяются.';

/**
 * Owner 14.11: every number of the Redis / database «Авто» from the admin,
 * without a Terraform apply (SSM `<prefix>/tuning`, read by the Lambda on its
 * next run, ≤ 5 min). Empty field = the default; a fresh 2FA code; audited.
 * Owner 15.11: each card shows «Сейчас: …» (what runs now) from `nowLine`.
 */
export function AutoscaleTuningCard({ nowLine }: { nowLine?: (target: TuningTarget['target']) => string } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.GET('/admin/spend/autoscale-tuning')).data!.data.targets as TuningTarget[],
  });
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const save = useMutation({
    mutationFn: async (v: { target: TuningTarget['target']; values: Record<string, number | null> }) =>
      api.PUT('/admin/spend/autoscale-tuning/{target}', {
        params: { path: { target: v.target } },
        body: { values: v.values },
      }),
    onSuccess: (_r, v) => {
      setDrafts((d) => ({ ...d, [v.target]: {} }));
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(`${TITLE[v.target]}: числа сохранены, «Авто» возьмёт их в течение 5 минут`);
    },
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <SectionTitle>Числа «Авто»: Redis, база, точки доступа, серверы</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {(q.data ?? []).map((t) => {
          const d = drafts[t.target] ?? {};
          const changes = tuningChanges(t, d);
          return (
            <Card key={t.target} className="p-4" data-testid={`tuning-${t.target}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-ink">{TITLE[t.target]}</h3>
                {t.available ? null : <Badge tone="neutral">нет на этом сервере</Badge>}
              </div>
              {nowLine ? (
                <p className="-mt-2 mb-3 break-words text-xs text-muted" data-testid={`tuning-now-${t.target}`}>
                  {nowLine(t.target)}
                </p>
              ) : null}
              {t.target === 'ecs' ? (
                <p className="-mt-1 mb-3 text-xs text-muted" data-testid="tuning-ecs-hint">
                  {ECS_HINT}
                </p>
              ) : null}
              <div className="space-y-2">
                {t.knobs.map((k) => (
                  <label key={k.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">
                      {k.ru} <span className="text-faint">({k.min}–{k.max})</span>
                    </span>
                    <Input
                      aria-label={k.ru}
                      className="w-24"
                      inputMode="decimal"
                      placeholder="по умолч."
                      disabled={!t.available}
                      value={d[k.key] ?? (k.value === null ? '' : String(k.value))}
                      onChange={(e) => setDrafts((x) => ({ ...x, [t.target]: { ...d, [k.key]: e.target.value } }))}
                    />
                  </label>
                ))}
              </div>
              {changes.errors.length ? <p className="mt-2 text-sm text-danger">{changes.errors.join('; ')}</p> : null}
              <Button
                className="mt-3"
                size="sm"
                disabled={!t.available || save.isPending || changes.errors.length > 0 || Object.keys(changes.values).length === 0}
                onClick={() => save.mutate({ target: t.target, values: changes.values })}
              >
                Сохранить (код 2FA)
              </Button>
            </Card>
          );
        })}
      </div>
    </>
  );
}
