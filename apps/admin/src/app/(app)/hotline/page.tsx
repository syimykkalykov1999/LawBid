'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Table, Td, Th } from '@/components/ui/table';
import { UpdatedAgo } from '@/components/updated-ago';
import { api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import { formatDuration } from '@/lib/utils';

/** GET /admin/hotline/live (HotlineLiveDto, Valkey only). */
interface HotlineLive {
  enabled: boolean;
  onLine: number;
  idle: number;
  offered: number;
  inCall: number;
  notAccepting: number;
  paused: number;
  waitingOnline: number;
  waitingOffline: number;
  callsNow: number;
  buckets: { bucket: string; lawyers: number; waiting: number }[];
  hours: {
    hour: string;
    requests: number;
    offers: number;
    accepted: number;
    declined: number;
    timeouts: number;
    ended: number;
    talkSeconds: number;
    notices: number;
    peakOnline: number;
  }[];
}

interface StatsCounts {
  calls: number;
  talkSeconds: number;
  casesOffered: number;
  reviews: number;
  starsSum: number;
  clients: number;
  attorneys: number;
}

/** GET /admin/hotline/stats (HotlineStatsDto, nightly snapshot). */
interface HotlineStats {
  computedAt: string;
  days: (StatsCounts & { day: string })[];
  totals: StatsCounts;
  states: { key: string; calls: number }[];
  practices: { key: string; calls: number }[];
  endReasons: { key: string; calls: number }[];
}

const stars = (c: Pick<StatsCounts, 'reviews' | 'starsSum'>) =>
  c.reviews > 0 ? (c.starsSum / c.reviews).toFixed(1) : '—';

/** The bucket key `STATE|practice|lang` in plain words. */
const bucketText = (b: string) => b.split('|').join(' · ');

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </Card>
  );
}

function KeyTable({ title, rows }: { title: string; rows: { key: string; calls: number }[] }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <Table>
        <thead>
          <tr>
            <Th>Что</Th>
            <Th className="text-right">Звонков</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={2} className="text-muted">
                Пока нет звонков.
              </Td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <Td>{r.key}</Td>
                <Td className="text-right tabular-nums">{r.calls}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}

/**
 * Row 87: the call hotline for the owner and support — who is on the line
 * right now and the queues (from Valkey, refreshed like the other live
 * boards), and the last 30 days of calls from the nightly snapshot (owner
 * rule: no live heavy counts in the admin).
 */
export default function HotlinePage() {
  const live = useQuery({
    queryKey: ['admin-hotline-live'],
    queryFn: async () => (await api.GET('/admin/hotline/live')).data!.data as HotlineLive,
    refetchInterval: livePoll(),
  });
  const stats = useQuery({
    queryKey: ['admin-hotline-stats'],
    queryFn: async () => (await api.GET('/admin/hotline/stats')).data!.data as HotlineStats,
  });
  const l = live.data;
  const s = stats.data;

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Горячая линия"
        subtitle="Кто из адвокатов сейчас на линии, сколько клиентов ждут, и звонки за последние 30 дней. Включается в «Функции» (флаг «Горячая линия»), время на ответ, очередь и счётчики — в «Настройки», ключи hotline.*."
        actions={l ? <UpdatedAgo at={live.dataUpdatedAt} /> : null}
      />
      <ErrorNote text={live.error ? errorText(live.error) : null} onRetry={() => live.refetch()} />

      <Card className="mb-5 flex flex-wrap items-center gap-3 p-5">
        {l ? (
          <Badge tone={l.enabled ? 'success' : 'neutral'} dot className="text-sm">
            {l.enabled ? 'Линия включена' : 'Линия выключена'}
          </Badge>
        ) : (
          <Skeleton className="h-6 w-40" />
        )}
        <span className="min-w-0 flex-1 text-sm text-muted">
          Выключатель — на странице{' '}
          <Link href="/flags" className="text-gold-600 underline-offset-2 hover:underline">
            «Функции»
          </Link>
          , числа линии — в{' '}
          <Link href="/config" className="text-gold-600 underline-offset-2 hover:underline">
            «Настройки»
          </Link>{' '}
          (hotline.*).
        </span>
      </Card>

      <SectionTitle>Сейчас</SectionTitle>
      {!l ? (
        <Skeleton className="h-32 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="На линии" value={l.onLine} hint={`свободны ${l.idle}, звонок звонит ${l.offered}`} />
            <Tile label="В разговоре" value={l.inCall} hint={`разговоров сейчас ${l.callsNow}`} />
            <Tile label="Не принимают" value={l.notAccepting} hint={`пауза после пропуска ${l.paused}`} />
            <Tile label="Клиенты ждут" value={l.waitingOnline} hint="в приложении, в очереди" />
            <Tile label="Ждут уведомления" value={l.waitingOffline} hint="«Сообщите, когда освободится»" />
          </div>

          <SectionTitle>Очереди (штат · квалификация · язык)</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Очередь</Th>
                <Th className="text-right">Адвокатов</Th>
                <Th className="text-right">Ждут клиентов</Th>
              </tr>
            </thead>
            <tbody>
              {l.buckets.length === 0 ? (
                <tr>
                  <Td colSpan={3} className="text-muted">
                    Сейчас никого нет на линии и никто не ждёт.
                  </Td>
                </tr>
              ) : (
                l.buckets.map((b) => (
                  <tr key={b.bucket}>
                    <Td>{bucketText(b.bucket)}</Td>
                    <Td className="text-right tabular-nums">{b.lawyers}</Td>
                    <Td className="text-right tabular-nums">{b.waiting}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          <SectionTitle>Последние 24 часа, по часам (UTC)</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Час</Th>
                <Th className="text-right">Запросов</Th>
                <Th className="text-right">Предложено</Th>
                <Th className="text-right">Взяли</Th>
                <Th className="text-right">Отклонили</Th>
                <Th className="text-right">Без ответа</Th>
                <Th className="text-right">Разговор</Th>
                <Th className="text-right">Уведомлений</Th>
                <Th className="text-right">Пик на линии</Th>
              </tr>
            </thead>
            <tbody>
              {l.hours.map((h) => (
                <tr key={h.hour}>
                  <Td className="tabular-nums">{h.hour}</Td>
                  <Td className="text-right tabular-nums">{h.requests}</Td>
                  <Td className="text-right tabular-nums">{h.offers}</Td>
                  <Td className="text-right tabular-nums">{h.accepted}</Td>
                  <Td className="text-right tabular-nums">{h.declined}</Td>
                  <Td className="text-right tabular-nums">{h.timeouts}</Td>
                  <Td className="text-right tabular-nums">{formatDuration(h.talkSeconds)}</Td>
                  <Td className="text-right tabular-nums">{h.notices}</Td>
                  <Td className="text-right tabular-nums">{h.peakOnline}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <SectionTitle action={s ? <UpdatedAgo at={Date.parse(s.computedAt) || stats.dataUpdatedAt} /> : null}>
        За 30 дней (считается раз в сутки ночью)
      </SectionTitle>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} onRetry={() => stats.refetch()} />
      {!s ? (
        <Skeleton className="h-32 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Звонков" value={s.totals.calls} />
            <Tile label="Разговор" value={formatDuration(s.totals.talkSeconds)} />
            <Tile label="Дел из звонка" value={s.totals.casesOffered} hint="клиент нажал «Предложить дело»" />
            <Tile label="Оценка" value={stars(s.totals)} hint={`отзывов ${s.totals.reviews}`} />
            <Tile label="Люди за день" value={`${s.totals.clients} / ${s.totals.attorneys}`} hint="клиенты / адвокаты, сложено по дням" />
          </div>

          <SectionTitle>По дням (UTC)</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>День</Th>
                <Th className="text-right">Звонков</Th>
                <Th className="text-right">Разговор</Th>
                <Th className="text-right">Дел</Th>
                <Th className="text-right">Отзывов</Th>
                <Th className="text-right">Оценка</Th>
                <Th className="text-right">Клиентов</Th>
                <Th className="text-right">Адвокатов</Th>
              </tr>
            </thead>
            <tbody>
              {[...s.days].reverse().map((d) => (
                <tr key={d.day}>
                  <Td className="tabular-nums">{d.day}</Td>
                  <Td className="text-right tabular-nums">{d.calls}</Td>
                  <Td className="text-right tabular-nums">{formatDuration(d.talkSeconds)}</Td>
                  <Td className="text-right tabular-nums">{d.casesOffered}</Td>
                  <Td className="text-right tabular-nums">{d.reviews}</Td>
                  <Td className="text-right tabular-nums">{stars(d)}</Td>
                  <Td className="text-right tabular-nums">{d.clients}</Td>
                  <Td className="text-right tabular-nums">{d.attorneys}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="grid gap-x-5 lg:grid-cols-3">
            <KeyTable title="Штаты" rows={s.states} />
            <KeyTable title="Квалификации" rows={s.practices} />
            <KeyTable title="Как закончились" rows={s.endReasons} />
          </div>
        </>
      )}
    </>
  );
}
