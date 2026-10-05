'use client';

import { Translate } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { TRANSLATE_FLAG, TRANSLATE_SCOPE_KEY, TRANSLATE_ZONES, activeZones, type TranslateScope } from '@/lib/translate-zones';

type ConfigEntry = { key: string; value?: unknown; defaultValue?: unknown };
type Flag = { key: string; enabled: boolean };

/**
 * Owner 2026-10-05: on the Google Translate card, where «Перевести» works:
 * the on/off switch (flag chat_translate), then «Везде» or «Только
 * выбранные» with a switch per zone. Every change applies at once.
 */
export function TranslateZones({ configured }: { configured: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const config = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data as ConfigEntry[],
  });
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Flag[],
  });
  const done = () => {
    toast.success('Сохранено');
    void qc.invalidateQueries({ queryKey: ['config'] });
  };
  const setConfig = useMutation({
    mutationFn: (v: { key: string; value: unknown }) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: v.key } }, body: { value: v.value } as never }),
    onSuccess: done,
    onError: (e) => toast.error(e),
  });
  const setFlag = useMutation({
    mutationFn: (enabled: boolean) =>
      api.PATCH('/admin/feature-flags/{key}', { params: { path: { key: TRANSLATE_FLAG } }, body: { enabled } }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? 'Переводчик включён' : 'Переводчик выключен');
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => toast.error(e),
  });

  const values: Record<string, unknown> = {};
  for (const e of config.data ?? []) values[e.key] = e.value ?? e.defaultValue;
  if (!config.data || values[TRANSLATE_SCOPE_KEY] === undefined) return null;
  const scope: TranslateScope = values[TRANSLATE_SCOPE_KEY] === 'zones' ? 'zones' : 'all';
  const on = flags.data?.find((f) => f.key === TRANSLATE_FLAG)?.enabled ?? false;
  const busy = setConfig.isPending || setFlag.isPending;
  const active = activeZones(scope, values);

  return (
    <div className="mt-4 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-heading">
          <Translate size={16} /> Где работает «Перевести»
        </div>
        <Switch checked={on} onChange={(v) => setFlag.mutate(v)} label="Переводчик включён" disabled={busy || !flags.data} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {!on
          ? 'Переводчик выключен: кнопки «Перевести» в приложении нет.'
          : !configured
            ? 'Включён, но кнопка появится только после сохранения ключа.'
            : `Работает: ${
                TRANSLATE_ZONES.filter((z) => active.includes(z.key))
                  .map((z) => z.label.toLowerCase())
                  .join(', ') || 'нигде'
              }. Лимит 300 переводов в день на человека, повторный перевод бесплатно из кэша.`}
      </p>
      <Tabs
        size="sm"
        className="mt-3"
        value={scope}
        onChange={(v) => setConfig.mutate({ key: TRANSLATE_SCOPE_KEY, value: v })}
        items={[
          { value: 'all', label: 'Везде' },
          { value: 'zones', label: 'Только выбранные' },
        ]}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {TRANSLATE_ZONES.map((z) => (
          <label key={z.key} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm text-ink">
            <span className="min-w-0">
              {z.label}
              <span className="block text-xs text-muted">{z.hint}</span>
            </span>
            <Switch
              checked={active.includes(z.key)}
              onChange={(v) => setConfig.mutate({ key: z.key, value: v })}
              label={z.label}
              disabled={busy || scope === 'all'}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
