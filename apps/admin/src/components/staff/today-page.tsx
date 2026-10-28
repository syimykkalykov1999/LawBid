'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Bug, ChartLineUp, Fire, Flag, HeartStraight, Scales, Wallet, Warning } from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SuggestionCard } from '@/components/staff/suggestion-card';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { dayLabel, APPEAL_KIND, STATUS_LABEL } from '@/lib/staff-labels';
import { useDigest, useToday, useTodaySystem, isOwner, staffPost, TODAY_SYSTEM_KEY, type DigestWeek, type Today, type TodayPerson } from '@/lib/staff-data';
import { actionHref, mergeSystemItems, sentryLine, SEVERITY_WORD, type SentrySummary, type TodaySystem } from '@/lib/system-items';
import { formatDateTime } from '@/lib/utils';

const usd = (cents: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

/** A block whose switch is off (server sent null): one honest line, no error. */
function Off({ what }: { what: string }) {
  return <p className="text-sm text-muted">Сейчас выключено: {what}. Переключатель — в «Настройки», по слову «сотрудников» или «staff».</p>;
}

function Block({ icon: I, title, href, children, testId }: { icon: typeof Bell; title: string; href?: string; children: ReactNode; testId: string }) {
  return (
    <Card className="p-5" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-heading">
          <I size={20} weight="light" className="text-gold-600" />
          {title}
        </h2>
        {href ? (
          <Link href={href} className="text-xs text-gold-600 hover:underline">
            Открыть
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function PersonLine({ p }: { p: TodayPerson }) {
  const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.ok;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <Link href={`/staff/${p.adminId}`} className="min-w-0 truncate text-ink hover:underline">
        {p.name}
      </Link>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-heading">{p.rating == null ? '—' : Math.round(p.rating)}</span>
        <Badge tone={s.tone}>{s.label}</Badge>
      </span>
    </li>
  );
}

type HealthLite = { overall: 'green' | 'yellow' | 'red'; items: { key: string; status: string; detail: Record<string, unknown> }[] };

/**
 * Owner 2026-10-27: «Система» — every action the owner must take today, by
 * urgency: the server's 5-minute snapshot (budget, capacity, «Запуск» lights,
 * status-board probes, incidents, key rotation) plus the live core lights of
 * «Здоровье системы» the page already loads. Done → the row disappears.
 */
function SystemBlock({ owner }: { owner: boolean }) {
  const health = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => (await api.GET('/admin/system-health')).data!.data as unknown as HealthLite,
    staleTime: 60_000,
    retry: false,
  });
  const sys = useTodaySystem<TodaySystem>(owner);
  const server = sys.data?.ok ? sys.data.data : null;
  const items = mergeSystemItems(server?.items, health.data);
  const o = health.data?.overall;
  return (
    <Block icon={HeartStraight} title="Система" href="/system-health" testId="today-health">
      {health.isPending && sys.isPending ? (
        <Skeleton className="h-5 w-48" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {!o ? (
              <span className="text-sm text-muted">Состояние пока не получено.</span>
            ) : (
              <Badge tone={o === 'green' ? 'success' : o === 'yellow' ? 'warning' : 'danger'} dot>
                {o === 'green' ? 'Всё в порядке' : o === 'yellow' ? 'Есть на что посмотреть' : 'Есть проблема'}
              </Badge>
            )}
            {server ? <span className="text-xs text-faint">Список на {formatDateTime(server.computedAt)}</span> : null}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted" data-testid="today-system-empty">
              Сегодня от вас ничего не требуется.
            </p>
          ) : (
            <ul className="divide-y divide-line" data-testid="today-system-items">
              {items.map((i) => {
                const w = SEVERITY_WORD[i.severity] ?? SEVERITY_WORD.low;
                return (
                  <li key={i.code} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm" data-testid={`today-system-${i.code}`}>
                    <Badge tone={w.tone} className="mt-0.5 shrink-0">
                      {w.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-heading">{i.title}</div>
                      <div className="text-xs text-muted">{i.why}</div>
                    </div>
                    <Link href={actionHref(i.action)} className="shrink-0 self-center text-xs font-medium text-gold-600 hover:underline">
                      {i.action.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <SentryLine summary={server?.sentry} />
        </>
      )}
    </Block>
  );
}

/** «Ошибки в приложении: N новых / M нерешённых» with «Открыть» and «Решено». */
function SentryLine({ summary }: { summary: SentrySummary | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const line = sentryLine(summary);
  const resolve = useMutation({
    mutationFn: (id: string) => staffPost<SentrySummary>(`/admin/staff/today/sentry/${id}/resolve`),
    onSuccess: () => {
      toast.success('Ошибка отмечена решённой');
      void qc.invalidateQueries({ queryKey: TODAY_SYSTEM_KEY });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="today-sentry">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Bug size={16} weight="light" className="text-gold-600" />
        <span className={line.tone === 'danger' ? 'text-danger' : line.tone === 'warning' ? 'text-heading' : 'text-muted'}>{line.text}</span>
        {line.link && summary?.url ? (
          <a href={summary.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gold-600 hover:underline">
            Открыть
          </a>
        ) : null}
      </div>
      {summary?.state === 'ok' && summary.issues.length > 0 ? (
        <ul className="mt-1 divide-y divide-line">
          {summary.issues.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-1 text-xs">
              <a href={i.permalink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline" title={i.title}>
                {i.title}
              </a>
              <span className="shrink-0 tabular-nums text-faint">×{i.count}</span>
              <Button size="sm" variant="outline" loading={resolve.isPending && resolve.variables === i.id} onClick={() => resolve.mutate(i.id)}>
                Решено
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MoneyLine() {
  const q = useQuery({
    queryKey: ['pnl-today'],
    queryFn: async () =>
      (await api.GET('/admin/pnl')).data!.data as { today?: { revenueUsd: number; costUsd: number; profitUsd: number } | null },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const t = q.data?.today;
  return (
    <Block icon={Wallet} title="Деньги сегодня" href="/pnl" testId="today-money">
      {q.isPending ? (
        <Skeleton className="h-5 w-48" />
      ) : !t ? (
        <p className="text-sm text-muted">Расчёта за сегодня ещё нет: он появляется после ночного пересчёта.</p>
      ) : (
        <p className="text-sm text-ink">
          Доход <b className="tabular-nums">{usd(t.revenueUsd * 100)}</b> · расходы <b className="tabular-nums">{usd(t.costUsd * 100)}</b> · прибыль{' '}
          <b className="tabular-nums">{usd(t.profitUsd * 100)}</b>
        </p>
      )}
    </Block>
  );
}

function Digest({ weeks }: { weeks: DigestWeek[] }) {
  const w = weeks[0];
  if (!w) return <p className="text-sm text-muted">Первая сводка придёт в понедельник.</p>;
  const n = w.numbers;
  const rows: [string, string][] = [
    ['Решений', String(n.decisions)],
    ['Вернулось на доработку', n.returnedPct == null ? 'нет данных' : `${String(n.returnedPct).replace('.', ',')} %`],
    ['Новых жалоб на главных', String(n.appeals)],
    ['Слабых / лучших', `${n.worstCount} / ${n.bestCount}`],
    ['Оплата за решения', usd(n.pieceworkCents)],
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-faint">Неделя с {dayLabel(w.weekStart)}</p>
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-1 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular-nums text-heading">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The owner's «Сегодня»: what needs attention, one snapshot, no journals. */
export function TodayPage() {
  const { data: me } = useMe();
  const q = useToday(isOwner(me));
  const digest = useDigest(isOwner(me));
  const missing = q.data && !q.data.ok;
  const t: Today | null = q.data?.ok ? q.data.data : null;

  return (
    <>
      <PageHeader
        eyebrow="Сегодня"
        title="Что требует внимания"
        subtitle={t ? <>Данные на {formatDateTime(t.computedAt)}. Только то, что нужно решить, без длинных журналов.</> : 'Короткий список: что решить сегодня.'}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : missing ? (
        <EmptyState
          icon={Bell}
          title="Страница «Сегодня» выключена"
          text="Включите переключатель «Страница «Сегодня» для владельца» в «Настройки». Пока она выключена, привычный «Обзор» работает как раньше."
        />
      ) : t ? (
        <div className="space-y-4">
          {t.decision ? (
            <Card className="border-gold/50 bg-accent-soft p-5" data-testid="today-decision">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600">Главное решение дня</div>
              <div className="mt-1 font-serif text-xl font-semibold text-heading">{t.decision.title}</div>
              <p className="mt-1 text-sm text-ink">{t.decision.text}</p>
              <Link href={t.decision.href} className="mt-3 inline-block text-sm font-medium text-gold-600 hover:underline">
                Перейти и решить
              </Link>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-muted" data-testid="today-nothing">
              Сегодня ничего решать не нужно.
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Block icon={Scales} title="Жалобы на главных" href="/staff/appeals" testId="today-appeals">
              {!t.appeals ? (
                <Off what="жалобы на главных" />
              ) : t.appeals.open === 0 ? (
                <p className="text-sm text-muted">Открытых жалоб нет.</p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-ink">
                    Ждут ответа: <b>{t.appeals.open}</b>
                  </p>
                  <ul className="divide-y divide-line">
                    {t.appeals.newest.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <Link href="/staff/appeals" className="min-w-0 truncate text-ink hover:underline">
                          №{a.number} · на {a.headName}
                        </Link>
                        <span className="shrink-0 text-xs text-faint">{APPEAL_KIND[a.kind] ?? a.kind}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Block>

            <Block icon={Flag} title="Красные пометки о мести" href="/staff/appeals?tab=flags" testId="today-flags">
              {!t.flags ? (
                <Off what="защита от мести" />
              ) : t.flags.open === 0 ? (
                <p className="text-sm text-muted">Открытых пометок нет.</p>
              ) : (
                <p className="text-sm text-ink">
                  Открытых: <b className="text-danger">{t.flags.open}</b>. Главный снял человека, который на него жаловался: решите, оставить ли.
                </p>
              )}
            </Block>
          </div>

          <Block icon={ChartLineUp} title="Плохие и лучшие" href="/staff" testId="today-shortlist">
            {!t.shortlist ? (
              <Off what="рейтинг сотрудников" />
            ) : t.shortlist.worst.length + t.shortlist.best.length === 0 ? (
              <p className="text-sm text-muted">Рейтинга ещё нет: он считается раз в ночь, когда у людей достаточно решений.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Слабые</div>
                  <ul className="divide-y divide-line">{t.shortlist.worst.map((p) => <PersonLine key={p.adminId} p={p} />)}</ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Лучшие</div>
                  <ul className="divide-y divide-line">{t.shortlist.best.map((p) => <PersonLine key={p.adminId} p={p} />)}</ul>
                </div>
              </div>
            )}
          </Block>

          <Block icon={Fire} title="Предложения системы" testId="today-suggestions">
            {!t.suggestions ? (
              <Off what="предложения системы" />
            ) : t.suggestions.items.length === 0 ? (
              <p className="text-sm text-muted">Предложений нет.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Ждут человека: {t.suggestions.open}. Показаны самые серьёзные. Систему решает не она, а вы.
                </p>
                {t.suggestions.items.map((s) => (
                  <SuggestionCard key={s.id} {...s} />
                ))}
              </div>
            )}
          </Block>

          <div className="grid gap-4 lg:grid-cols-2">
            <Block icon={Warning} title="Странное поведение" testId="today-anomalies">
              {!t.anomalies ? (
                <Off what="поиск странного поведения" />
              ) : t.anomalies.items.length === 0 ? (
                <p className="text-sm text-muted">Ничего странного не замечено.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-faint">За {dayLabel(t.anomalies.day)}, всего: {t.anomalies.total}</p>
                  <ul className="divide-y divide-line">
                    {t.anomalies.items.map((a) => (
                      <li key={`${a.adminId}-${a.rule}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <Link href={`/staff/${a.adminId}`} className="min-w-0 truncate text-ink hover:underline">
                          {a.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted">{a.ruleLabel}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Block>

            <Block icon={Wallet} title="Оплата за решения" href="/staff/rates" testId="today-piecework">
              {!t.piecework ? (
                <Off what="сдельная оплата" />
              ) : t.piecework.disputedDays === 0 ? (
                <p className="text-sm text-muted">Спорных дней нет.</p>
              ) : (
                <p className="text-sm text-ink">
                  Дней на удержании: <b>{t.piecework.disputedDays}</b>. Пересчитайте или оставьте.
                </p>
              )}
            </Block>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SystemBlock owner={isOwner(me)} />
        <MoneyLine />
      </div>

      {digest.data?.ok ? (
        <>
          <SectionTitle>Итоги недели</SectionTitle>
          <Card className="p-5" data-testid="today-digest">
            <Digest weeks={digest.data.data.items} />
          </Card>
        </>
      ) : null}
    </>
  );
}
