'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { localDoneKey, type GuideMeta } from '@/lib/guides';
import { LAUNCH_TONE, type LaunchItem, type LaunchReport } from '@/lib/launch';
import { livePoll } from '@/lib/live';

/**
 * «Сделано» for a guide. When the guide explains a «Запуск» step that the
 * owner ticks by hand, this is the SAME checkbox (stored on the server, so
 * both pages always agree). Otherwise (no step, or a step the server checks
 * by itself) it is remembered in this browser only.
 */
export function useGuideDone(guide: Pick<GuideMeta, 'id' | 'launch'>) {
  const qc = useQueryClient();
  const toast = useToast();
  const report = useQuery({
    queryKey: ['launch'],
    queryFn: async () => (await api.GET('/admin/launch')).data!.data as LaunchReport,
    refetchInterval: livePoll(),
    enabled: guide.launch.length > 0,
  });
  const steps: LaunchItem[] = guide.launch.flatMap((id) => report.data?.items.find((i) => i.id === id) ?? []);
  const tickable = steps.find((s) => s.manualTick) ?? null;

  const [local, setLocal] = useState(false);
  useEffect(() => {
    try {
      setLocal(window.localStorage.getItem(localDoneKey(guide.id)) === '1');
    } catch {
      /* private window: just not remembered */
    }
  }, [guide.id]);

  const tick = useMutation({
    mutationFn: async (v: { id: string; done: boolean }) =>
      (await api.POST('/admin/launch/ticks/{id}', { params: { path: { id: v.id } }, body: { done: v.done } })).data!
        .data as LaunchReport,
    onSuccess: (r) => qc.setQueryData(['launch'], r),
    onError: (e) => toast.error(e),
  });

  const done = tickable ? tickable.ticked : local;
  const toggle = (next: boolean) => {
    if (tickable) {
      tick.mutate({ id: tickable.id, done: next });
      return;
    }
    setLocal(next);
    try {
      if (next) window.localStorage.setItem(localDoneKey(guide.id), '1');
      else window.localStorage.removeItem(localDoneKey(guide.id));
    } catch {
      /* not remembered */
    }
  };
  return { done, toggle, busy: tick.isPending, steps, synced: !!tickable };
}

export function GuideDone({ guide }: { guide: Pick<GuideMeta, 'id' | 'launch'> }) {
  const { done, toggle, busy, steps, synced } = useGuideDone(guide);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={done}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          data-testid={`guide-done-${guide.id}`}
        />
        Сделано
      </label>
      {steps.map((s) => {
        const tone = LAUNCH_TONE[s.status] ?? LAUNCH_TONE.manual;
        return (
          <Badge key={s.id} tone={tone.tone} dot title={s.title}>
            Запуск: {tone.label}
          </Badge>
        );
      })}
      {guide.launch.length > 0 && !synced ? (
        <span className="text-xs text-faint">Эту лампочку сервер проверяет сам; галочка помнится только в этом браузере.</span>
      ) : null}
    </div>
  );
}
