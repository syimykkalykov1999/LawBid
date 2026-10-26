'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { canWriteSupport, type DeskSettings } from '@/components/support/support-labels';
import { SupportNav } from '@/components/support/support-nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ZONES = [
  ['America/New_York', 'Восточное время (Нью-Йорк)'],
  ['America/Chicago', 'Центральное время (Чикаго)'],
  ['America/Denver', 'Горное время (Денвер)'],
  ['America/Phoenix', 'Аризона'],
  ['America/Los_Angeles', 'Тихоокеанское время (Лос-Анджелес)'],
  ['America/Anchorage', 'Аляска'],
  ['Pacific/Honolulu', 'Гавайи'],
  ['UTC', 'UTC'],
] as const;

type ToggleKey = 'autoAssign' | 'autoReply' | 'slaAlerts' | 'escalateOnBreach' | 'alwaysOpen';

/** Hours, answer deadlines, auto-assignment and the after-hours auto-answer. */
export default function SupportSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = canWriteSupport(me);
  const q = useQuery({
    queryKey: ['support-settings'],
    queryFn: async () => (await api.GET('/admin/support/settings')).data!.data,
  });
  const [d, setD] = useState<DeskSettings | null>(null);
  useEffect(() => {
    if (q.data) setD(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (v: DeskSettings) => (await api.PUT('/admin/support/settings', { body: v })).data!.data,
    onSuccess: (v) => {
      toast.success('Настройки поддержки сохранены');
      qc.setQueryData(['support-settings'], v);
      void qc.invalidateQueries({ queryKey: ['support-stats'] });
    },
    onError: (e) => toast.error(e),
  });

  if (!d) {
    return (
      <>
        <PageHeader eyebrow="Связь · Поддержка" title="Часы и SLA" />
        <SupportNav />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" />
      </>
    );
  }

  const set = <K extends keyof DeskSettings>(k: K, v: DeskSettings[K]) => setD({ ...d, [k]: v });
  const dirty = JSON.stringify(d) !== JSON.stringify(q.data);
  const toggle = (label: string, hint: string, k: ToggleKey) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      </div>
      <Switch checked={d[k]} disabled={!canWrite} label={label} onChange={(v) => set(k, v)} />
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Связь · Поддержка"
        title="Часы и SLA"
        subtitle="Всё работает само: обращения распределяются, сроки считаются, вне рабочего времени пользователь сразу получает автоответ."
        actions={
          canWrite ? (
            <Button variant="gold" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(d)}>
              Сохранить
            </Button>
          ) : null
        }
      />
      <SupportNav />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Автоматика</h2>
          <div className="divide-y divide-line">
            {toggle('Назначать автоматически', 'Новое обращение получает тот, кто на смене и меньше всего занят.', 'autoAssign')}
            {toggle('Автоответ вне рабочего времени', 'Пользователь сразу узнаёт, когда команда ответит.', 'autoReply')}
            {toggle('Письмо о просрочке', 'Ответственный и руководители получают письмо, когда срок ответа прошёл.', 'slaAlerts')}
            {toggle('Поднимать приоритет при просрочке', 'Просроченное обращение поднимается на один уровень.', 'escalateOnBreach')}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Сроки ответа</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Первый ответ, минут" htmlFor="sla-first" hint="Обычные обращения">
              <Input
                id="sla-first"
                type="number"
                min={5}
                max={2880}
                disabled={!canWrite}
                value={d.slaFirstResponseMinutes}
                onChange={(e) => set('slaFirstResponseMinutes', Number(e.target.value))}
              />
            </Field>
            <Field label="Срочные, минут" htmlFor="sla-urgent" hint="Высокий и срочный приоритет">
              <Input
                id="sla-urgent"
                type="number"
                min={5}
                max={2880}
                disabled={!canWrite}
                value={d.slaUrgentMinutes}
                onChange={(e) => set('slaUrgentMinutes', Number(e.target.value))}
              />
            </Field>
            <Field label="Закрывать решённые через, дней" htmlFor="auto-close" hint="0 — не закрывать">
              <Input
                id="auto-close"
                type="number"
                min={0}
                max={90}
                disabled={!canWrite}
                value={d.autoCloseResolvedDays}
                onChange={(e) => set('autoCloseResolvedDays', Number(e.target.value))}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Рабочее время</h2>
          <div className="divide-y divide-line">
            {toggle('Круглосуточно', 'Сроки идут всегда. Выключите, чтобы считать только рабочие часы.', 'alwaysOpen')}
          </div>
          <div className={cn('mt-3 grid gap-4 md:grid-cols-[1fr_auto_auto]', d.alwaysOpen && 'opacity-50')}>
            <Field label="Дни">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((label, i) => {
                  const day = i + 1;
                  const on = d.openDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!canWrite || d.alwaysOpen}
                      aria-pressed={on}
                      onClick={() =>
                        set('openDays', on ? d.openDays.filter((x) => x !== day) : [...d.openDays, day].sort((a, b) => a - b))
                      }
                      className={cn(
                        'h-9 min-w-11 rounded-[10px] border px-2 text-xs font-medium transition-colors',
                        on ? 'border-gold/60 bg-accent-soft text-gold-600' : 'border-line bg-surface text-muted hover:text-ink',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="С (час)" htmlFor="h-from">
              <Input
                id="h-from"
                type="number"
                min={0}
                max={23}
                className="w-24"
                disabled={!canWrite || d.alwaysOpen}
                value={d.openFromHour}
                onChange={(e) => set('openFromHour', Number(e.target.value))}
              />
            </Field>
            <Field label="До (час)" htmlFor="h-to">
              <Input
                id="h-to"
                type="number"
                min={1}
                max={24}
                className="w-24"
                disabled={!canWrite || d.alwaysOpen}
                value={d.openToHour}
                onChange={(e) => set('openToHour', Number(e.target.value))}
              />
            </Field>
            <Field label="Часовой пояс" htmlFor="tz" className="md:col-span-3">
              <Select
                id="tz"
                disabled={!canWrite || d.alwaysOpen}
                value={d.timeZone}
                onChange={(e) => set('timeZone', e.target.value)}
                className="md:max-w-sm"
              >
                {ZONES.some(([z]) => z === d.timeZone) ? null : <option value={d.timeZone}>{d.timeZone}</option>}
                {ZONES.map(([z, label]) => (
                  <option key={z} value={z}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      </div>
    </>
  );
}
