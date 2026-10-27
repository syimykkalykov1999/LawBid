'use client';

import { Pause, Play, Stop } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';
import {
  BACKFILL_ACTION_TEXT,
  backfillButtons,
  backfillLine,
  backfillNote,
  backfillStatus,
  type Backfill,
  type BackfillAction,
} from '@/lib/backfills';
import { livePoll } from '@/lib/live';

const ICON = { pause: Pause, resume: Play, abort: Stop } as const;

/**
 * Owner 2026-10-25 (online DDL): the big data moves that run in the
 * background (src/common/backfill), with pause / continue / stop. One
 * super-admin with a fresh 2FA code is enough: no second approver.
 */
export function BackfillsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['backfills'],
    queryFn: async () => (await api.GET('/admin/system-health/backfills')).data!.data as Backfill[],
    refetchInterval: livePoll(),
  });
  const [stepUp, setStepUp] = useState<{ name: string; action: BackfillAction } | null>(null);

  const act = useMutation({
    mutationFn: async (v: { name: string; action: BackfillAction }) =>
      (await api.POST('/admin/system-health/backfills/{name}/{action}', { params: { path: v } })).data!
        .data as Backfill[],
    onSuccess: (r, v) => {
      qc.setQueryData(['backfills'], r);
      toast.success(BACKFILL_ACTION_TEXT[v.action].done);
    },
    onError: (err, v) => {
      if (err instanceof ApiError && err.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(v);
      else toast.error(err);
    },
  });

  const rows = list.data ?? [];
  return (
    <>
      <SectionTitle>Переносы данных в фоне</SectionTitle>
      {rows.length === 0 ? (
        <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
          <Badge tone="neutral" dot>
            Ничего не идёт
          </Badge>
          <span className="min-w-0 flex-1 text-sm text-muted">
            Когда понадобится заполнить новое поле у миллионов строк, перенос пойдёт порциями и сам притормозит, если база занята.
          </span>
        </Card>
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const st = backfillStatus(b);
            const note = backfillNote(b);
            return (
              <Card key={b.name} className="flex min-w-0 flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-medium text-heading">{b.name}</div>
                  <Badge tone={st.tone} dot className="shrink-0">
                    {st.label}
                  </Badge>
                </div>
                <p className="break-words text-sm text-muted">{backfillLine(b)}</p>
                {note ? <p className="break-words text-xs text-muted">{note}</p> : null}
                <div className="mt-auto flex flex-wrap gap-2">
                  {backfillButtons(b).map((action) => {
                    const Icon = ICON[action];
                    return (
                      <Button
                        key={action}
                        variant="outline"
                        size="sm"
                        loading={act.isPending && act.variables?.name === b.name && act.variables.action === action}
                        onClick={() => act.mutate({ name: b.name, action })}
                      >
                        <Icon size={14} /> {BACKFILL_ACTION_TEXT[action].button}
                      </Button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <StepUpDialog
        open={stepUp !== null}
        description="Пауза, продолжение и остановка переноса данных требуют свежий код. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const v = stepUp;
          setStepUp(null);
          if (v) act.mutate(v);
        }}
      />
    </>
  );
}
