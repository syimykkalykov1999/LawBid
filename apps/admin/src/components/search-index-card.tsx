'use client';

import { ArrowsLeftRight, ArrowUUpLeft, Hammer } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import { ENTITY_RU, phaseWord, roleWord, sizeWord, swapLabel, type SearchIndexStatus } from '@/lib/search-index';

type Act = 'start' | 'swap' | 'rollback';

/**
 * Owner 2026-10-25: search index generations, alias targets, document
 * counts and the zero-downtime reindex (Start / Swap / Rollback). The
 * buttons need a fresh 2FA code, nothing more: no second admin.
 */
export function SearchIndexCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['search-index'],
    queryFn: async () => (await api.GET('/admin/system-health/search-index')).data!.data as SearchIndexStatus,
    refetchInterval: livePoll(),
  });
  const [confirm, setConfirm] = useState<Act | null>(null);
  const [stepUp, setStepUp] = useState<Act | null>(null);

  const run = useMutation({
    mutationFn: async (a: Act) => {
      const path = `/admin/system-health/search-index/${a}` as const;
      const r = a === 'start' ? await api.POST(path, { body: {} }) : await api.POST(path);
      return r.data!.data as SearchIndexStatus;
    },
    onSuccess: (r, a) => {
      qc.setQueryData(['search-index'], r);
      toast.success(a === 'start' ? 'Пересборка начата' : a === 'swap' ? 'Переключено' : 'Откат выполнен');
    },
    onError: (err, a) => {
      if (err instanceof ApiError && err.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(a);
      else toast.error(err);
    },
  });

  const s = q.data;
  const w = s ? phaseWord(s) : null;
  const busy = (a: Act) => run.isPending && run.variables === a;

  return (
    <>
      <Card className="mb-6 flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm font-medium text-heading">Индекс поиска (версии и пересборка)</div>
          {w ? (
            <Badge tone={w.tone} dot>
              {w.label}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted">{s ? w?.line : 'Загрузка…'}</p>
        {s?.error ? <p className="text-sm text-danger">Последняя ошибка: {s.error}</p> : null}

        {s && s.verify.length > 0 ? (
          <p className="text-xs text-muted">
            Проверка {s.verifyOk ? 'пройдена' : 'не пройдена'}:{' '}
            {s.verify
              .map((v) => `${ENTITY_RU[v.entity] ?? v.entity} ${v.live}→${v.next}${v.ok ? '' : ` (${v.note ?? 'расхождение'})`}`)
              .join('; ')}
          </p>
        ) : null}

        {s?.entities.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-normal">Раздел</th>
                  <th className="py-1 pr-3 font-normal">Индекс</th>
                  <th className="py-1 pr-3 font-normal">Записей</th>
                  <th className="py-1 pr-3 font-normal">Размер</th>
                  <th className="py-1 font-normal">Роль</th>
                </tr>
              </thead>
              <tbody>
                {s.entities.flatMap((e) =>
                  e.indexes.map((i) => (
                    <tr key={i.name} className="border-t border-line">
                      <td className="py-1 pr-3">{ENTITY_RU[e.entity] ?? e.entity}</td>
                      <td className="py-1 pr-3 font-mono">{i.name}</td>
                      <td className="py-1 pr-3">{i.docs}</td>
                      <td className="py-1 pr-3">{sizeWord(i.sizeBytes)}</td>
                      <td className="py-1">{roleWord(i.role)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!s?.engineConfigured || !s.canStart}
            loading={busy('start')}
            onClick={() => setConfirm('start')}
          >
            <Hammer size={14} /> Начать пересборку
          </Button>
          <Button variant="outline" size="sm" disabled={!s?.canSwap} loading={busy('swap')} onClick={() => setConfirm('swap')}>
            <ArrowsLeftRight size={14} /> {s ? swapLabel(s) : 'Переключить'}
          </Button>
          <Button variant="outline" size="sm" disabled={!s?.canRollback} loading={busy('rollback')} onClick={() => setConfirm('rollback')}>
            <ArrowUUpLeft size={14} /> Откатить
          </Button>
        </div>
      </Card>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'start' ? 'Начать пересборку поиска?' : confirm === 'swap' ? 'Переключить индекс?' : 'Откатить?'}
      >
        <p className="mb-4 text-sm text-muted">
          {confirm === 'start'
            ? 'Создастся новый индекс и наполнится из базы в фоне. Поиск не останавливается. Потребуется код подтверждения.'
            : confirm === 'swap'
              ? 'Система сначала сверит новый индекс с базой, потом атомарно переключит. Поиск не останавливается.'
              : 'Вернёт старый индекс (или отменит сборку). Поиск не останавливается.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              const a = confirm;
              setConfirm(null);
              if (a) run.mutate(a);
            }}
          >
            Подтвердить
          </Button>
        </div>
      </Dialog>

      <StepUpDialog
        open={stepUp !== null}
        description="Это меняет индекс поиска. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const a = stepUp;
          setStepUp(null);
          if (a) run.mutate(a);
        }}
      />
    </>
  );
}
