'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, ChartLineUp, Fire, Flag, HeartStraight, Scales, Wallet, Warning } from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SuggestionCard } from '@/components/staff/suggestion-card';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { dayLabel, APPEAL_KIND, STATUS_LABEL } from '@/lib/staff-labels';
import { useDigest, useToday, isOwner, type DigestWeek, type Today, type TodayPerson } from '@/lib/staff-data';
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

function HealthLine() {
  const q = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => (await api.GET('/admin/system-health')).data!.data as { overall: 'green' | 'yellow' | 'red' },
    staleTime: 60_000,
    retry: false,
  });
  const o = q.data?.overall;
  return (
    <Block icon={HeartStraight} title="Система" href="/system-health" testId="today-health">
      {q.isPending ? (
        <Skeleton className="h-5 w-48" />
      ) : !o ? (
        <p className="text-sm text-muted">Состояние пока не получено.</p>
      ) : (
        <Badge tone={o === 'green' ? 'success' : o === 'yellow' ? 'warning' : 'danger'} dot>
          {o === 'green' ? 'Всё в порядке' : o === 'yellow' ? 'Есть на что посмотреть' : 'Есть проблема'}
        </Badge>
      )}
    </Block>
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
        <HealthLine />
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
