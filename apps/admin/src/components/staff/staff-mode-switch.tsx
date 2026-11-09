'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';

export type StaffMode = 'off' | 'on' | 'auto';
const MODES: readonly StaffMode[] = ['off', 'on', 'auto'];
const MODE_LABEL: Record<StaffMode, string> = { off: 'Выкл', on: 'Вкл', auto: 'Авто' };

/** The three-state staff switches (owner rule 5c) and what «Авто» decides on. */
export const STAFF_MODE_KEYS = ['staff.rating_enabled', 'staff.piecework_enabled', 'staff.anomalies_enabled'] as const;
export type StaffModeKey = (typeof STAFF_MODE_KEYS)[number];

export const STAFF_MODE_TEXT: Record<StaffModeKey, { label: string; auto: string }> = {
  'staff.rating_enabled': {
    label: 'Ночной рейтинг',
    auto: 'Авто: считается ночью, как только в админке есть хоть один сотрудник кроме владельца. Пока его нет — ночью ни одного запроса, страница открыта и пуста.',
  },
  'staff.piecework_enabled': {
    label: 'Сдельная оплата',
    auto: 'Авто: начисляется в «Зарплаты», как только задана хоть одна ставка ниже. Без ставок денег не двигает.',
  },
  'staff.anomalies_enabled': {
    label: 'Детектор аномалий',
    auto: 'Авто: работает, когда сотрудников кроме владельца не меньше двух.',
  },
};

type Entry = { key: string; value: unknown };

/** The stored position of a switch: an old boolean counts too (true = Вкл). */
export function modeOf(value: unknown): StaffMode {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return value === 'off' || value === 'on' || value === 'auto' ? value : 'auto';
}

/** Sources of the page that must reload after a switch moved. */
const RELOAD_KEYS = [['config'], ['staff-switches'], ['staff-people'], ['staff-rates'], ['staff-piecework'], ['staff-today']];

/**
 * Owner rule 5c (2026-11-08): Выкл / Вкл / Авто for a staff switch, the same
 * buttons as «Масштаб» and «Задача для ИИ». Reads the position from the
 * shared settings list (one cached request, the «Настройки» page uses the
 * same cache) and saves through the ordinary settings route, so the 2FA
 * step-up and the audit row are the usual ones.
 */
export function StaffModeSwitch({ keys }: { keys: readonly StaffModeKey[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [stepUp, setStepUp] = useState<null | { key: StaffModeKey; mode: StaffMode }>(null);
  const config = useQuery({
    queryKey: ['config'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.GET('/admin/config')).data!.data as Entry[],
  });
  const current = (key: string): StaffMode | null => {
    const e = config.data?.find((x) => x.key === key);
    return e ? modeOf(e.value) : null;
  };
  const setMode = useMutation({
    mutationFn: async (p: { key: StaffModeKey; mode: StaffMode }) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: p.key } }, body: { value: p.mode } as never }),
    onSuccess: () => {
      for (const k of RELOAD_KEYS) void qc.invalidateQueries({ queryKey: k });
      toast.success('Сохранено');
    },
    onError: (e, p) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(p);
      else toast.error(e);
    },
  });

  return (
    <Card className="mb-4 grid gap-3 p-4 text-sm" data-testid="staff-mode-switch">
      {keys.map((key) => {
        const cur = current(key);
        return (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-muted">{STAFF_MODE_TEXT[key].label}:</span>
            {MODES.map((m) => (
              <Button
                key={m}
                variant={cur === m ? 'gold' : 'outline'}
                size="sm"
                aria-pressed={cur === m}
                aria-label={`${STAFF_MODE_TEXT[key].label}: ${MODE_LABEL[m]}`}
                disabled={cur === m || setMode.isPending}
                onClick={() => setMode.mutate({ key, mode: m })}
              >
                {MODE_LABEL[m]}
              </Button>
            ))}
            <span className="min-w-0 flex-1 text-xs text-muted">{STAFF_MODE_TEXT[key].auto}</span>
          </div>
        );
      })}
      <StepUpDialog
        open={stepUp !== null}
        description="Меняется, что система считает и начисляет сотрудникам. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const s = stepUp;
          setStepUp(null);
          if (s) setMode.mutate(s);
        }}
      />
    </Card>
  );
}
