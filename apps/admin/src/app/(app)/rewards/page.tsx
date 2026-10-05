'use client';

import { Medal, Trophy, X } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { centsToInput, money, parseDollars } from '@/lib/payroll';

type Settings = components['schemas']['RewardsSettingsDto'];
type Board = components['schemas']['RewardDepartmentBoardDto'];
type Row = components['schemas']['RewardLeaderRowDto'];
type Dept = Settings['departments'][number] & { bonusText: string };
type Which = 'current' | 'previous';

/** "2026-10" / "2026-W41" for the period before the current one (UTC). */
function previousPeriod(kind: Settings['period'], now = new Date()): string {
  if (kind === 'month') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * «Лучший сотрудник» (owner only). Off by default: when off, nobody sees
 * anything. On: per-department leaderboards from finished work, a prize
 * and a bonus that lands in Зарплаты; given by itself after each period
 * or by hand.
 */
export default function RewardsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ['rewards-settings'],
    queryFn: async () => (await api.GET('/admin/rewards/settings')).data!.data,
  });
  const [draft, setDraft] = useState<{ autoAward: boolean; period: Settings['period']; departments: Dept[] } | null>(null);
  useEffect(() => {
    const s = settings.data;
    if (s) {
      setDraft({
        autoAward: s.autoAward,
        period: s.period,
        departments: s.departments.map((d) => ({ ...d, bonusText: centsToInput(d.bonusCents) })),
      });
    }
  }, [settings.data]);

  const enabled = settings.data?.enabled === true;
  const [which, setWhich] = useState<Which>('current');
  const period = which === 'previous' && settings.data ? previousPeriod(settings.data.period) : undefined;
  const board = useQuery({
    queryKey: ['rewards-board', period ?? 'current'],
    queryFn: async () => (await api.GET('/admin/rewards/leaderboard', { params: { query: { period } } })).data!.data,
    enabled,
  });
  const awards = useQuery({
    queryKey: ['rewards-awards'],
    queryFn: async () => (await api.GET('/admin/rewards/awards')).data!.data,
    enabled,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['rewards-settings'] });
    void qc.invalidateQueries({ queryKey: ['rewards-board'] });
    void qc.invalidateQueries({ queryKey: ['rewards-awards'] });
    void qc.invalidateQueries({ queryKey: ['workspace-rewards'] });
  };

  const save = useMutation({
    mutationFn: async (body: components['schemas']['UpdateRewardsSettingsDto']) =>
      (await api.PUT('/admin/rewards/settings', { body })).data!.data,
    onSuccess: (s, v) => {
      toast.success(v.enabled === undefined ? 'Настройки сохранены' : s.enabled ? '«Лучший сотрудник» включён' : '«Лучший сотрудник» выключен');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const give = useMutation({
    mutationFn: async (v: { b: Board; r: Row; period: string }) =>
      api.POST('/admin/rewards/awards', {
        body: { period: v.period, department: v.b.key, adminId: v.r.adminId, prize: v.b.prize, bonusCents: v.b.bonusCents },
      }),
    onSuccess: (_x, v) => {
      toast.success(`${v.r.name}: награда выдана${v.b.bonusCents ? ', бонус добавлен в зарплату' : ''}`);
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => api.DELETE('/admin/rewards/awards/{id}', { params: { path: { id } } }),
    onSuccess: () => {
      toast.success('Награда отменена, бонус снят с зарплаты');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const badBonus = draft?.departments.some((d) => parseDollars(d.bonusText, { allowZero: true }) === null) ?? false;
  const saveDraft = () => {
    if (!draft || badBonus) return;
    save.mutate({
      autoAward: draft.autoAward,
      period: draft.period,
      departments: draft.departments.map((d) => ({
        key: d.key,
        enabled: d.enabled,
        prize: d.prize.trim(),
        bonusCents: parseDollars(d.bonusText, { allowZero: true }) ?? 0,
      })),
    });
  };
  const setDept = (key: Dept['key'], patch: Partial<Dept>) =>
    draft && setDraft({ ...draft, departments: draft.departments.map((d) => (d.key === key ? { ...d, ...patch } : d)) });

  return (
    <>
      <PageHeader
        eyebrow="Люди"
        title="Лучший сотрудник"
        subtitle="Соревнование по отделам за выполненную работу. Пока выключено, сотрудники ничего не видят и бонусы не начисляются."
      />
      <ErrorNote text={settings.error ? errorText(settings.error) : null} />

      {!draft ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
            <Trophy size={26} weight="light" className="shrink-0 text-gold-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-heading">{enabled ? 'Включено' : 'Выключено'}</div>
              <div className="mt-0.5 text-xs text-muted">
                {enabled
                  ? 'Сотрудники видят своё место на «Рабочем месте». Выключите, и всё исчезнет у всех.'
                  : 'Включите, когда захотите: сотрудники увидят рейтинг своего отдела и призы.'}
              </div>
            </div>
            <Switch checked={enabled} disabled={save.isPending} label="Лучший сотрудник" onChange={(v) => save.mutate({ enabled: v })} />
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Правила</h2>
              <Button variant="gold" size="sm" disabled={badBonus} loading={save.isPending} onClick={saveDraft}>
                Сохранить
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">Награждать автоматически</div>
                  <div className="mt-0.5 text-xs text-muted">После каждого периода первое место в отделе получает приз и бонус.</div>
                </div>
                <Switch checked={draft.autoAward} label="Награждать автоматически" onChange={(v) => setDraft({ ...draft, autoAward: v })} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">Период</span>
                <Tabs<Settings['period']>
                  size="sm"
                  value={draft.period}
                  onChange={(v) => setDraft({ ...draft, period: v })}
                  items={[
                    { value: 'month', label: 'Месяц' },
                    { value: 'week', label: 'Неделя' },
                  ]}
                />
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Отдел</Th>
                    <Th>Участвует</Th>
                    <Th>Приз</Th>
                    <Th className="text-right">Бонус, $</Th>
                  </tr>
                </thead>
                <tbody>
                  {draft.departments.map((d) => (
                    <tr key={d.key}>
                      <Td className="whitespace-nowrap">{d.label}</Td>
                      <Td>
                        <Switch checked={d.enabled} label={`Участвует: ${d.label}`} onChange={(v) => setDept(d.key, { enabled: v })} />
                      </Td>
                      <Td className="min-w-48">
                        <Input
                          value={d.prize}
                          maxLength={120}
                          placeholder="Например: выходной день"
                          aria-label={`Приз: ${d.label}`}
                          onChange={(e) => setDept(d.key, { prize: e.target.value })}
                        />
                      </Td>
                      <Td className="text-right">
                        <Input
                          value={d.bonusText}
                          inputMode="decimal"
                          aria-label={`Бонус: ${d.label}`}
                          aria-invalid={parseDollars(d.bonusText, { allowZero: true }) === null}
                          className="ml-auto w-28 text-right"
                          onChange={(e) => setDept(d.key, { bonusText: e.target.value })}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-faint">
              Очки: проверка адвокатов — решения по заявкам; модерация — разобранные жалобы и действия; поддержка — решённые обращения и первые
              ответы минус просрочки; финансы — выплаты и денежные операции. Бонус уходит в «Деньги → Зарплаты».
            </p>
          </Card>

          {enabled ? (
            <>
              <div className="mt-8">
                <SectionTitle
                  action={
                    <Tabs<Which>
                      size="sm"
                      value={which}
                      onChange={setWhich}
                      items={[
                        { value: 'current', label: 'Сейчас' },
                        { value: 'previous', label: 'Прошлый период' },
                      ]}
                    />
                  }
                >
                  Рейтинг {board.data ? `· ${board.data.period}` : ''}
                </SectionTitle>
              </div>
              <ErrorNote text={board.error ? errorText(board.error) : null} />
              {board.isPending ? (
                <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
              ) : (board.data?.departments ?? []).length === 0 ? (
                <EmptyState icon={Trophy} title="Нет отделов" text="Включите хотя бы один отдел в правилах." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {(board.data?.departments ?? []).map((b) => (
                    <Card key={b.key} className="overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                        <span className="text-sm font-medium text-heading">{b.label}</span>
                        <span className="text-xs text-muted">
                          {b.members} сотр.{b.prize ? ` · ${b.prize}` : ''}
                          {b.bonusCents ? ` · ${money(b.bonusCents)}` : ''}
                        </span>
                      </div>
                      {b.award ? (
                        <div className="flex flex-wrap items-center gap-2 bg-accent-soft/40 px-5 py-2.5 text-sm">
                          <Medal size={16} weight="fill" className="text-gold-600" />
                          <span className="min-w-0 flex-1 break-words text-ink">
                            Награда: {b.award.name}
                            {b.award.auto ? ' (автоматически)' : ''}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={revoke.isPending && revoke.variables === b.award.id}
                            onClick={() => {
                              if (window.confirm('Отменить награду? Бонус будет снят с зарплаты, если ещё не выплачен.')) revoke.mutate(b.award!.id);
                            }}
                          >
                            <X size={14} /> Отменить
                          </Button>
                        </div>
                      ) : null}
                      {b.rows.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-muted">В этом периоде пока нет выполненной работы.</p>
                      ) : (
                        <ol className="divide-y divide-line">
                          {b.rows.slice(0, 10).map((r) => (
                            <li key={r.adminId} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                              <span className="w-6 text-center font-serif text-lg font-semibold tabular-nums text-gold-600">{r.rank}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm break-words text-ink">{r.name}</span>
                                <span className="block text-xs text-muted">
                                  {r.metrics
                                    .filter((m) => m.value != null)
                                    .map((m) => `${m.label}: ${m.value}`)
                                    .join(' · ')}
                                </span>
                              </span>
                              <Badge tone="info">{r.score} очк.</Badge>
                              {!b.award && board.data ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  loading={give.isPending && give.variables?.r.adminId === r.adminId && give.variables?.b.key === b.key}
                                  onClick={() => give.mutate({ b, r, period: board.data!.period })}
                                >
                                  Наградить
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              <div className="mt-8">
                <SectionTitle>История наград</SectionTitle>
              </div>
              <Card className="overflow-hidden">
                {(awards.data ?? []).length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">Наград пока не было.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Период</Th>
                          <Th>Отдел</Th>
                          <Th>Сотрудник</Th>
                          <Th>Приз</Th>
                          <Th className="text-right">Бонус</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(awards.data ?? []).map((a) => (
                          <tr key={a.id}>
                            <Td className="whitespace-nowrap">{a.period}</Td>
                            <Td>{draft.departments.find((d) => d.key === a.department)?.label ?? a.department}</Td>
                            <Td className="break-words">{a.name}</Td>
                            <Td className="break-words">{a.prize || '—'}</Td>
                            <Td className="text-right whitespace-nowrap">{a.bonusCents ? money(a.bonusCents, a.currency) : '—'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
