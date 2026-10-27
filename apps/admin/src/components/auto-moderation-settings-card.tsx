'use client';

import { Robot } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

type Field =
  | { key: string; label: string; kind: 'number'; hint?: string }
  | { key: string; label: string; kind: 'bool'; hint?: string }
  | { key: string; label: string; kind: 'select'; options: [string, string][]; hint?: string };

const MODES: [string, string][] = [
  ['off', 'Выключено'],
  ['shadow', 'Тень: только записывать, ничего не делать'],
  ['enforce', 'Действовать'],
];

const GROUPS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: 'Скрытие по жалобам (с весом жалобщика)',
    note: 'Вес жалобы зависит от возраста аккаунта, подтверждённого контакта, прошлой точности, общего устройства или сети и всплеска регистраций. Три новых аккаунта вместе весят доли единицы.',
    fields: [
      { key: 'moderation.auto_hide_mode', label: 'Режим', kind: 'select', options: [['weighted', 'По весу жалоб'], ['count', 'Старый: просто N жалобщиков']] },
      { key: 'moderation.auto_hide_score', label: 'Сумма весов для скрытия', kind: 'number', hint: 'обычный аккаунт весит 1' },
      { key: 'moderation.auto_hide_reports', label: 'N жалобщиков (старый режим)', kind: 'number' },
      { key: 'moderation.verified_attorney_action', label: 'Контент адвоката с галочкой', kind: 'select', options: [['review', 'Не скрывать, в приоритетную проверку'], ['hide', 'Скрывать при повышенной сумме']] },
      { key: 'moderation.verified_attorney_score', label: 'Повышенная сумма для адвоката', kind: 'number' },
      { key: 'moderation.weight.new_account_days', label: 'Новый аккаунт: дней', kind: 'number' },
      { key: 'moderation.weight.new_account', label: 'Вес нового аккаунта', kind: 'number' },
      { key: 'moderation.weight.unverified_contact', label: 'Вес без подтверждённого телефона/почты', kind: 'number' },
      { key: 'moderation.weight.verified_reporter', label: 'Вес адвоката с галочкой', kind: 'number' },
      { key: 'moderation.weight.accuracy_min_reports', label: 'С скольки решённых жалоб считать точность', kind: 'number' },
      { key: 'moderation.weight.cluster_by_source', label: 'Одно устройство или сеть = один жалобщик', kind: 'bool' },
      { key: 'moderation.weight.burst_window_hours', label: 'Всплеск регистраций: окно, часов', kind: 'number' },
      { key: 'moderation.weight.burst_min_accounts', label: 'Всплеск: от скольких аккаунтов', kind: 'number' },
      { key: 'moderation.weight.burst', label: 'Вес при всплеске', kind: 'number' },
    ],
  },
  {
    title: 'Ложные жалобы (предупреждение, потом пауза)',
    fields: [
      { key: 'moderation.report_abuse.enabled', label: 'Включено', kind: 'bool' },
      { key: 'moderation.report_abuse.window_days', label: 'Окно, дней', kind: 'number' },
      { key: 'moderation.report_abuse.min_reports', label: 'Решённых жалоб для предупреждения', kind: 'number' },
      { key: 'moderation.report_abuse.unfounded_percent', label: 'Доля отклонённых, %', kind: 'number' },
      { key: 'moderation.report_abuse.repeat_after_warning', label: 'После предупреждения: жалоб до паузы', kind: 'number' },
      { key: 'moderation.report_abuse.suspend_days', label: 'Пауза, дней (растёт с повторами)', kind: 'number' },
    ],
  },
  {
    title: 'Страйки владельцам контента',
    fields: [
      { key: 'moderation.strikes.enabled', label: 'Включено', kind: 'bool' },
      { key: 'moderation.strikes.expiry_days', label: 'Страйк живёт, дней', kind: 'number' },
      { key: 'moderation.strikes.points_remove', label: 'Очков за удаление модератором', kind: 'number' },
      { key: 'moderation.strikes.points_hide', label: 'Очков за скрытие модератором', kind: 'number' },
      { key: 'moderation.strikes.cooldown_at', label: 'Пауза между постами с очков', kind: 'number' },
      { key: 'moderation.strikes.cooldown_hours', label: 'Пауза действует, часов', kind: 'number' },
      { key: 'moderation.strikes.cooldown_minutes', label: 'Интервал между постами, минут', kind: 'number' },
      { key: 'moderation.strikes.limited_at', label: 'Нельзя публиковать новое с очков', kind: 'number' },
      { key: 'moderation.strikes.limited_days', label: 'Ограничение, дней', kind: 'number' },
      { key: 'moderation.strikes.suspend_at', label: 'Нельзя и комментировать с очков', kind: 'number' },
      { key: 'moderation.strikes.suspend_days', label: 'Приостановка публикаций, дней', kind: 'number' },
    ],
  },
  {
    title: 'Автоматические меры по аккаунту (без человека)',
    note: 'Оценка аккаунта = вес жалобщиков по всему его контенту + страйки + сильные срабатывания проверки текста. Человек подключается только по апелляции. Адвокатов с галочкой автоматически не блокируем.',
    fields: [
      { key: 'moderation.auto.account_mode', label: 'Режим', kind: 'select', options: MODES },
      { key: 'moderation.auto.window_days', label: 'Окно оценки, дней', kind: 'number' },
      { key: 'moderation.auto.limit_at', label: 'Ограничить с оценки', kind: 'number' },
      { key: 'moderation.auto.limit_days', label: 'Ограничение, дней', kind: 'number' },
      { key: 'moderation.auto.suspend_temp_at', label: 'Приостановить на время с оценки', kind: 'number' },
      { key: 'moderation.auto.suspend_temp_days', label: 'Приостановка, дней', kind: 'number' },
      { key: 'moderation.auto.suspend_at', label: 'Заблокировать аккаунт с оценки', kind: 'number' },
      { key: 'moderation.auto.strike_score', label: 'Оценка за очко страйка', kind: 'number' },
      { key: 'moderation.auto.detect_score', label: 'Оценка за сильное срабатывание текста', kind: 'number' },
      { key: 'moderation.auto.borderline_factor', label: 'Пограничное решение: порог ×', kind: 'number', hint: 'оценка ниже порога × это число' },
      { key: 'moderation.auto.verified_attorney_action', label: 'Адвокат с галочкой', kind: 'select', options: [['review', 'Только приоритетная проверка человеком'], ['higher_bar', 'Повышенные пороги']] },
      { key: 'moderation.auto.verified_attorney_multiplier', label: 'Множитель порогов для адвоката', kind: 'number' },
    ],
  },
  {
    title: 'Апелляции: срок и тревога',
    fields: [
      { key: 'moderation.auto.appeal_sla_hours', label: 'Срок ответа на апелляцию, часов', kind: 'number' },
      { key: 'moderation.auto.sla_auto_approve', label: 'Просроченную пограничную апелляцию одобрять само', kind: 'bool' },
      { key: 'moderation.auto.alarm_overturn_percent', label: 'Тревога, если отменено более %', kind: 'number' },
      { key: 'moderation.auto.alarm_min_appeals', label: 'Тревога от скольких решённых апелляций', kind: 'number' },
    ],
  },
  {
    title: 'Автоматическая проверка текста до жалоб',
    note: 'OpenAI omni-moderation: бесплатно или около $0.00001 за запрос. Нужен ключ в «Ключи и сервисы». Тень пишет решения в журнал и ничего не делает. Спам, мошенничество и навязывание услуг ловят правила (слова, ссылки, повторы).',
    fields: [
      { key: 'moderation.detect.mode', label: 'Режим', kind: 'select', options: MODES },
      { key: 'moderation.detect.hold_at', label: 'На проверку с уверенности (0–1)', kind: 'number' },
      { key: 'moderation.detect.block_at', label: 'Не публиковать с уверенности (0–1)', kind: 'number' },
      { key: 'moderation.detect.log_at', label: 'Записывать в журнал с уверенности', kind: 'number' },
      { key: 'moderation.detect.daily_cap', label: 'Потолок запросов в день', kind: 'number' },
    ],
  },
];

type Entry = { key: string; value: unknown; defaultValue: unknown };

/** Owner 2026-10-27: every automatic-moderation tunable in one place. */
export function AutoModerationSettingsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data as Entry[],
  });
  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) =>
      api.PUT('/admin/config/{key}', {
        params: { path: { key: v.key } },
        body: { value: v.value } as never,
      }),
    onSuccess: (_r, v) => {
      toast.success(`Сохранено: ${v.key}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(e),
  });
  const byKey = new Map((q.data ?? []).map((e) => [e.key, e]));
  return (
    <section className="mb-6 rounded-2xl border border-line bg-card p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
        <Robot size={18} weight="light" /> Настройки автомодерации
      </div>
      <p className="mb-4 text-xs text-muted">
        Изменения действуют примерно через 30 секунд. Начните с режима «Тень», посмотрите метрики и только потом
        включайте «Действовать».
      </p>
      {GROUPS.map((g) => (
        <div key={g.title} className="mb-5">
          <div className="text-sm font-medium text-heading">{g.title}</div>
          {g.note ? <p className="mb-1 text-xs text-muted">{g.note}</p> : null}
          <div className="divide-y divide-line">
            {g.fields.map((f) => {
              const e = byKey.get(f.key);
              if (!e) return null;
              const current = e.value === null || e.value === undefined ? e.defaultValue : e.value;
              const draft = drafts[f.key];
              const shown = draft ?? String(current ?? '');
              const commit = (raw: string) => {
                if (f.kind === 'number') {
                  const n = Number(raw);
                  if (raw.trim() === '' || !Number.isFinite(n) || n < 0) return;
                  save.mutate({ key: f.key, value: n });
                } else {
                  save.mutate({ key: f.key, value: f.kind === 'bool' ? raw === 'true' : raw });
                }
              };
              return (
                <div key={f.key} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-64 flex-1">
                    <div className="text-sm text-ink">{f.label}</div>
                    <div className="font-mono text-[11px] text-faint">
                      {f.key}
                      {f.hint ? ` · ${f.hint}` : ''}
                    </div>
                  </div>
                  {f.kind === 'number' ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        if (draft !== undefined) commit(draft);
                      }}
                    >
                      <Input
                        className="h-8 w-28 text-right font-mono text-xs"
                        inputMode="decimal"
                        aria-label={f.label}
                        value={shown}
                        onChange={(ev) => setDrafts({ ...drafts, [f.key]: ev.target.value })}
                      />
                      <div className="w-24">
                        {draft !== undefined ? (
                          <Button size="sm" type="submit" disabled={save.isPending}>
                            Сохранить
                          </Button>
                        ) : null}
                      </div>
                    </form>
                  ) : f.kind === 'bool' ? (
                    <Select
                      className="h-8 w-48 text-xs"
                      aria-label={f.label}
                      value={String(Boolean(current))}
                      onChange={(ev) => commit(ev.target.value)}
                    >
                      <option value="true">Включено</option>
                      <option value="false">Выключено</option>
                    </Select>
                  ) : (
                    <Select
                      className="h-8 w-72 text-xs"
                      aria-label={f.label}
                      value={String(current ?? '')}
                      onChange={(ev) => commit(ev.target.value)}
                    >
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
