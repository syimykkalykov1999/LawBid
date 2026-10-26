'use client';

import { Broom, PencilSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatBytes } from '@/lib/storage-format';

type Overview = components['schemas']['StorageOverviewDto'];
type Settings = components['schemas']['StorageSettingsDto'];
type UserUsage = components['schemas']['StorageUserUsageDto'];

const PURPOSE: Record<string, string> = {
  avatar: 'Фото профиля',
  post_image: 'Фото в постах',
  post_attachment: 'Документы в постах',
  post_video: 'Видео',
  case_photo: 'Фото кейсов',
  case_attachment: 'Документы кейсов',
  chat_attachment: 'Файлы в чатах',
  support_attachment: 'Файлы в поддержке',
  chat_voice: 'Голосовые',
  task_attachment: 'Файлы задач',
  review_photo: 'Фото в отзывах',
  sticker: 'Стикеры',
  verification_document: 'Документы проверки',
  verification_selfie: 'Селфи проверки',
  data_export: 'Выгрузки данных',
  document_template: 'Шаблоны документов',
};

/**
 * Owner 2026-10-05 («хранение как у Telegram»): what files and the database
 * take, what deduplication saved, what waits for removal. Everything runs
 * by itself (switches on by default): unused files and abandoned uploads
 * are cleaned hourly, old technical logs nightly, a daily snapshot raises
 * an alert when storage suddenly grows.
 */
export default function StoragePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'settings', 'manage') : false;
  const [quotaOf, setQuotaOf] = useState<UserUsage | null>(null);

  const q = useQuery({
    queryKey: ['storage'],
    queryFn: async () => (await api.GET('/admin/storage')).data!.data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['storage'] });

  const save = useMutation({
    mutationFn: async (body: Partial<Settings>) => (await api.PUT('/admin/storage/settings', { body })).data!.data,
    onSuccess: () => {
      toast.success('Сохранено');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const cleanup = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Очистить сейчас?',
        description:
          'То же, что делается само каждый час: убираются брошенные загрузки и файлы, которые нигде не используются. Окончательно файлы удаляются только после срока ожидания.',
        confirm: 'Очистить',
      });
      if (!ok) return null;
      return (await api.POST('/admin/storage/cleanup')).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(
        `Отложено: ${r.orphansFound + r.deletedPostMedia}. Удалено объектов: ${r.objectsRemoved + r.pendingUploadsRemoved}.`,
      );
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const d = q.data;
  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Хранилище"
        subtitle="Сколько места занимают файлы и база, сколько сэкономили одинаковые файлы и что ждёт удаления. Всё убирается само; здесь можно поменять сроки и лимиты."
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => cleanup.mutate()} disabled={cleanup.isPending}>
              <Broom size={16} />
              Очистить сейчас
            </Button>
          ) : null
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Файлы у людей"
          value={d ? formatBytes(d.filesBytes) : '—'}
          note={d ? `${d.filesCount.toLocaleString('ru-RU')} файлов` : undefined}
        />
        <Stat label="Реально в хранилище" value={d ? formatBytes(d.storedBytes) : '—'} note="одинаковые файлы хранятся один раз" />
        <Stat label="Сэкономлено" value={d ? formatBytes(d.dedupSavedBytes) : '—'} note="за счёт общих копий" />
        <Stat
          label="Ждут удаления"
          value={d ? formatBytes(d.pendingRemovalBytes) : '—'}
          note={d ? `${d.pendingRemovalCount} файлов, срок ${d.settings.purgeAfterDays} дн.` : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>По типам файлов</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Тип</Th>
                    <Th className="text-right">Файлов</Th>
                    <Th className="text-right">Объём</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.isPending ? <TableEmpty colSpan={3} loading /> : null}
                  {d && d.byPurpose.length === 0 ? <TableEmpty colSpan={3}>Файлов пока нет.</TableEmpty> : null}
                  {d?.byPurpose.map((p) => (
                    <tr key={p.purpose}>
                      <Td className="max-w-56 truncate" title={p.purpose}>
                        {PURPOSE[p.purpose] ?? p.purpose}
                      </Td>
                      <Td className="text-right tabular-nums">{p.count.toLocaleString('ru-RU')}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">{formatBytes(p.bytes)}</Td>
                    </tr>
                  ))}
                  {d?.r2 ? (
                    <tr>
                      <Td
                        className="max-w-56 truncate"
                        title={`Бесплатно 10 ГБ в месяц${d.r2.truncated ? '; посчитано не всё' : ''}`}
                      >
                        Cloudflare R2 (публичные фото)
                      </Td>
                      <Td className="text-right tabular-nums">{d.r2.objects.toLocaleString('ru-RU')}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">{formatBytes(d.r2.bytes)}</Td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Кто хранит больше всех</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Пользователь</Th>
                    <Th className="text-right">Объём</Th>
                    <Th className="text-right">Лимит</Th>
                  </tr>
                </thead>
                <tbody>
                  {d && d.topUsers.length === 0 ? <TableEmpty colSpan={3}>Пока никого.</TableEmpty> : null}
                  {d?.topUsers.map((u) => (
                    <tr key={u.userId}>
                      <Td className="max-w-64">
                        <div className="truncate text-ink" title={u.name ?? undefined}>
                          {u.name ?? '—'}
                        </div>
                        <div className="truncate text-xs text-faint" title={u.email ?? undefined}>
                          {u.email ?? u.userId}
                        </div>
                      </Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {formatBytes(u.bytes)}
                        <div className="text-xs text-faint">{u.count} файлов</div>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-sm whitespace-nowrap text-muted">
                            {u.quotaMb === null
                              ? 'общий'
                              : u.quotaMb === 0
                                ? 'без лимита'
                                : formatBytes(u.quotaMb * 1024 * 1024)}
                          </span>
                          {canManage ? (
                            <Button variant="ghost" size="icon" aria-label="Изменить лимит" onClick={() => setQuotaOf(u)}>
                              <PencilSimple size={14} />
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          {d && d.tables.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>База данных: самые большие таблицы</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <thead>
                    <tr>
                      <Th>Таблица</Th>
                      <Th className="text-right">Строк</Th>
                      <Th className="text-right">Объём</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.tables.map((t) => (
                      <tr key={t.table}>
                        <Td className="max-w-56 truncate font-mono text-xs" title={t.table}>
                          {t.table}
                        </Td>
                        <Td className="text-right tabular-nums">{t.rows.toLocaleString('ru-RU')}</Td>
                        <Td className="text-right whitespace-nowrap tabular-nums">{formatBytes(t.bytes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {d && d.history.length > 1 ? <History points={d.history} /> : null}
        </div>

        <div className="min-w-0 space-y-4">
          {d ? <SettingsCard settings={d.settings} disabled={!canManage || save.isPending} onSave={(b) => save.mutate(b)} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>Последняя очистка</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted">
              {d?.lastCleanup ? (
                <>
                  <p>{new Date(d.lastCleanup.at).toLocaleString('ru-RU')}</p>
                  <p>Брошенных загрузок убрано: {d.lastCleanup.pendingUploadsRemoved}</p>
                  <p>Неиспользуемых отложено: {d.lastCleanup.orphansFound}</p>
                  <p>Из удалённых постов: {d.lastCleanup.deletedPostMedia}</p>
                  <p>Возвращено (снова нужны): {d.lastCleanup.restored}</p>
                  <p>Удалено объектов: {d.lastCleanup.objectsRemoved}</p>
                </>
              ) : (
                <p>Ещё не запускалась: первая пройдёт в течение часа.</p>
              )}
              <p className="pt-2 text-xs">
                Резкий рост за сутки выше порога приходит письмом вместе с остальными тревогами системы.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {quotaOf ? (
        <QuotaDialog
          user={quotaOf}
          onClose={() => setQuotaOf(null)}
          onSaved={() => {
            setQuotaOf(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="truncate text-xs text-muted" title={label}>
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {note ? <p className="text-xs text-faint">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

function History({ points }: { points: Overview['history'] }) {
  const max = Math.max(1, ...points.map((p) => p.storedBytes + p.dbBytes));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Рост по дням</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Объём хранилища и базы по дням">
          {points.map((p) => (
            <div
              key={p.day}
              title={`${p.day}: файлы ${formatBytes(p.storedBytes)}, база ${formatBytes(p.dbBytes)}`}
              className="min-w-0 flex-1 rounded-t bg-gold-500/70"
              style={{ height: `${Math.max(2, ((p.storedBytes + p.dbBytes) / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-faint">
          <span>{points[0].day}</span>
          <span>{points[points.length - 1].day}</span>
        </div>
      </CardContent>
    </Card>
  );
}

type NumberKey =
  | 'orphanGraceHours'
  | 'purgeAfterDays'
  | 'deletedPostsMediaDays'
  | 'userQuotaMb'
  | 'chatQuotaMb'
  | 'retentionAuthEventsDays'
  | 'retentionAssistantActivityDays'
  | 'notificationsRetentionDays'
  | 'growthAlertPercent';

const NUMBER_FIELDS: { key: NumberKey; label: string; hint: string; min: number; max: number }[] = [
  {
    key: 'orphanGraceHours',
    label: 'Неиспользуемый файл ждёт, часов',
    hint: 'Загрузил и не отправил: через столько часов файл откладывается.',
    min: 1,
    max: 720,
  },
  {
    key: 'purgeAfterDays',
    label: 'Отложенные удаляются через, дней',
    hint: 'Пока срок не прошёл, файл возвращается, если снова нужен.',
    min: 0,
    max: 90,
  },
  {
    key: 'deletedPostsMediaDays',
    label: 'Фото удалённых постов, дней',
    hint: 'Сколько хранить фото и документы после удаления поста.',
    min: 1,
    max: 365,
  },
  {
    key: 'userQuotaMb',
    label: 'Лимит на человека, МБ',
    hint: '0 = без лимита. Фото профиля и документы проверки не считаются.',
    min: 0,
    max: 1048576,
  },
  {
    key: 'chatQuotaMb',
    label: 'Лимит файлов на чат, МБ',
    hint: '0 = без лимита. Текст сообщений не ограничен.',
    min: 0,
    max: 1048576,
  },
  { key: 'retentionAuthEventsDays', label: 'Журнал входов, дней', hint: '0 = хранить всегда.', min: 0, max: 3650 },
  {
    key: 'retentionAssistantActivityDays',
    label: 'Действия помощников, дней',
    hint: '0 = хранить всегда.',
    min: 0,
    max: 3650,
  },
  {
    key: 'notificationsRetentionDays',
    label: 'Уведомления, дней',
    hint: 'Старые уведомления удаляются сами.',
    min: 7,
    max: 3650,
  },
  { key: 'growthAlertPercent', label: 'Тревога при росте за сутки, %', hint: '0 = не присылать.', min: 0, max: 1000 },
];

function SettingsCard({
  settings,
  disabled,
  onSave,
}: {
  settings: Settings;
  disabled: boolean;
  onSave: (body: Partial<Settings>) => void;
}) {
  const [draft, setDraft] = useState<Partial<Record<NumberKey, string>>>({});
  useEffect(() => setDraft({}), [settings]);
  const changed = Object.keys(draft).length > 0;
  const submit = () => {
    const body: Partial<Settings> = {};
    for (const [k, v] of Object.entries(draft)) body[k as NumberKey] = Number(v);
    onSave(body);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Автоматически</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Toggle
          label="Одинаковые файлы храним один раз"
          hint="Как в Telegram: тот же файл у разных людей занимает место один раз."
          checked={settings.dedup}
          disabled={disabled}
          onChange={(v) => onSave({ dedup: v })}
        />
        <Toggle
          label="Убирать ненужные файлы"
          hint="Каждый час: брошенные загрузки и файлы, которые нигде не используются."
          checked={settings.autoCleanup}
          disabled={disabled}
          onChange={(v) => onSave({ autoCleanup: v })}
        />
        <Toggle
          label="Чистить старые журналы"
          hint="Каждую ночь, по срокам ниже. Чаты, журнал дел и аудит не трогаются."
          checked={settings.autoRetention}
          disabled={disabled}
          onChange={(v) => onSave({ autoRetention: v })}
        />
        <Field label="Формат фото" hint="WebP примерно на треть легче JPEG при том же качестве." htmlFor="storage-format">
          <Select
            id="storage-format"
            value={settings.imageFormat}
            disabled={disabled}
            onChange={(e) => onSave({ imageFormat: e.target.value as Settings['imageFormat'] })}
          >
            <option value="webp">WebP (рекомендуется)</option>
            <option value="jpeg">JPEG</option>
          </Select>
        </Field>
        {NUMBER_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`storage-${f.key}`}>
            <Input
              id={`storage-${f.key}`}
              type="number"
              min={f.min}
              max={f.max}
              disabled={disabled}
              value={draft[f.key] ?? String(settings[f.key])}
              onChange={(e) => setDraft((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
        {changed ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={disabled}>
              Сохранить
            </Button>
            <Button variant="ghost" onClick={() => setDraft({})}>
              Отменить
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ink">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} label={label} onChange={onChange} />
    </div>
  );
}

function QuotaDialog({ user, onClose, onSaved }: { user: UserUsage; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'default' | 'none' | 'custom'>(
    user.quotaMb === null ? 'default' : user.quotaMb === 0 ? 'none' : 'custom',
  );
  const [mb, setMb] = useState(String(user.quotaMb && user.quotaMb > 0 ? user.quotaMb : 20480));
  const save = useMutation({
    mutationFn: async () => {
      const quotaMb = mode === 'default' ? null : mode === 'none' ? 0 : Number(mb);
      await api.PUT('/admin/storage/users/{id}/quota', {
        params: { path: { id: user.userId } },
        body: { quotaMb },
      });
    },
    onSuccess: () => {
      toast.success('Лимит сохранён');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog open onClose={onClose} title={`Лимит: ${user.name ?? user.email ?? 'пользователь'}`}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">Сейчас занято {formatBytes(user.bytes)}.</p>
        <Select aria-label="Какой лимит" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="default">Общий лимит</option>
          <option value="custom">Свой лимит</option>
          <option value="none">Без лимита</option>
        </Select>
        {mode === 'custom' ? (
          <Field label="МБ" htmlFor="quota-mb">
            <Input id="quota-mb" type="number" min={1} max={1048576} value={mb} onChange={(e) => setMb(e.target.value)} />
          </Field>
        ) : null}
        {mode === 'none' ? <Badge tone="warning">Можно загружать без ограничений</Badge> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Сохранить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
