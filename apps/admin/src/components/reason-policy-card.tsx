'use client';

import { NotePencil } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { REASON_AREAS, REASON_AREAS_KEY } from '@/lib/reason-policy';

/**
 * Owner 2026-10-05: where staff admins must write «Причина». The owner
 * never has to; each switch applies at once (the API checks it too).
 */
export function ReasonPolicyCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data,
  });
  const entry = q.data?.find((e) => e.key === REASON_AREAS_KEY);
  const raw = (entry?.value ?? entry?.defaultValue) as unknown;
  const on = new Set(Array.isArray(raw) ? (raw as string[]) : []);
  const save = useMutation({
    mutationFn: (next: string[]) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: REASON_AREAS_KEY } }, body: { value: next } as never }),
    onSuccess: () => {
      toast.success('Сохранено');
      void qc.invalidateQueries({ queryKey: ['config'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  if (!entry) return null;
  const toggle = (key: string, value: boolean) => {
    const next = new Set(on);
    if (value) next.add(key);
    else next.delete(key);
    save.mutate(REASON_AREAS.map((a) => a.key).filter((k) => next.has(k)));
  };
  return (
    <div className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-medium text-heading">
        <NotePencil size={16} /> Обязательная причина для сотрудников
      </div>
      <p className="mt-0.5 mb-3 text-xs text-muted">
        В отмеченных разделах ваши админы должны написать причину действия, она попадёт в журнал аудита. Вам писать причину не нужно нигде.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {REASON_AREAS.map((a) => (
          <label key={a.key} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm text-ink">
            <span className="min-w-0">{a.label}</span>
            <Switch checked={on.has(a.key)} onChange={(v) => toggle(a.key, v)} label={a.label} disabled={save.isPending} />
          </label>
        ))}
      </div>
    </div>
  );
}
