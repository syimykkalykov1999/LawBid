'use client';

import {
  ArrowUpRight, Briefcase, ChatsCircle, CrownSimple, Flag, Gavel, Lifebuoy, Phone, SealCheck,
  UserPlus, Users, UsersThree, Wallet, type Icon,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { canOpen } from '@/lib/rbac';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** docs/06 §2.3 item 1 — numbers, queues that need a human, activity. */
export default function DashboardPage() {
  const { data: me } = useMe();
  const dq = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
    refetchInterval: 60_000,
  });
  const oq = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.GET('/admin/overview')).data!.data,
    refetchInterval: 60_000,
  });
  const showMoney = me?.role === 'super_admin' || me?.role === 'finance' || me?.role === 'support';
  const bq = useQuery({
    queryKey: ['billing-overview'],
    queryFn: async () => (await api.GET('/admin/billing/overview')).data!.data,
    refetchInterval: 120_000,
    enabled: showMoney,
  });
  const sq = useQuery({
    queryKey: ['support-stats'],
    queryFn: async () => (await api.GET('/admin/support/stats')).data!.data,
    refetchInterval: 60_000,
    enabled: me ? canOpen(me.role, '/support') : false,
  });
  const d = dq.data;
  const o = oq.data;
  const b = bq.data;

  const queues: { href: string; label: string; value: number; hint?: string; icon: Icon }[] = d
    ? [
        { href: '/verification', label: 'Верификация', value: d.verification.queueSize, hint: d.verification.oldestAgeSeconds ? `старейшая ждёт ${formatDuration(d.verification.oldestAgeSeconds)}` : undefined, icon: SealCheck },
        { href: '/moderation', label: 'Жалобы', value: d.openReports, icon: Flag },
        { href: '/cases?tab=disputes', label: 'Споры по кейсам', value: d.openDisputes, icon: Gavel },
        { href: '/cases?tab=contact', label: '«Не могу связаться»', value: d.openContactIssues, icon: Phone },
        ...(sq.data ? [{ href: '/support', label: 'Обращения в поддержку', value: sq.data.attention ?? sq.data.unreadByAdmin, hint: sq.data.openUnassigned ? `без ответственного: ${sq.data.openUnassigned}` : undefined, icon: Lifebuoy }] : []),
      ].filter((x) => !me || canOpen(me.role, x.href.split('?')[0]))
    : [];

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title="Обзор LawBid"
        subtitle={d ? `Данные на ${formatDateTime(d.computedAt)} · обновляются каждую минуту` : 'Загружаем цифры…'}
      />
      <ErrorNote text={dq.error ? errorText(dq.error) : oq.error ? errorText(oq.error) : null} />

      {/* Hero KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d ? (
          <>
            <Kpi i={0} icon={UserPlus} title="Новые клиенты" value={d.newUsers.clients24h} hint={`за 24 ч · за 7 дней ${d.newUsers.clients7d}`} />
            <Kpi i={1} icon={Users} title="Новые адвокаты" value={d.newUsers.attorneys24h} hint={`за 24 ч · за 7 дней ${d.newUsers.attorneys7d}`} />
            <Kpi i={2} icon={Briefcase} title="Открытые кейсы" value={d.openCases} hint={`ставок за сутки: ${d.bids24h}`} />
            {showMoney ? (
              <Kpi
                i={3}
                icon={Wallet}
                gold
                title="Выручка в месяц (MRR)"
                value={b ? b.mrrCents / 100 : d.subscriptions.revenueEstimateUsd}
                format={(n) => money(n * 100)}
                hint={b ? `за 30 дней получено ${money(b.revenue30dCents)}` : 'оценка по активным подпискам'}
              />
            ) : (
              <Kpi i={3} icon={CrownSimple} title="Активные подписки" value={d.subscriptions.active} hint={`пробный ${d.subscriptions.trialing}`} />
            )}
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-[var(--radius-lg)]" />)
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Queues needing a human */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-heading">Требуют внимания</h2>
            <span className="text-xs text-faint">очереди</span>
          </div>
          {d ? (
            <ul className="divide-y divide-line">
              {queues.map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="group flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-xl',
                        x.value > 0 ? 'bg-accent-soft text-gold-600' : 'bg-surface-2 text-faint',
                      )}
                    >
                      <x.icon size={18} weight="light" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm text-ink">{x.label}</span>
                      {x.hint ? <span className="block text-xs text-faint">{x.hint}</span> : null}
                    </span>
                    <span className={cn('text-lg font-semibold tabular-nums', x.value > 0 ? 'text-heading' : 'text-faint')}>
                      {x.value}
                    </span>
                    <ArrowUpRight size={14} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-gold-600" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          )}
        </Card>

        {/* Money */}
        {showMoney ? (
          <Card className="relative overflow-hidden p-5">
            <div aria-hidden className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
            <div className="relative mb-4 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-heading">Подписки и деньги</h2>
              <Link href="/subscriptions" className="text-xs text-gold-600 hover:underline">
                все подписки →
              </Link>
            </div>
            {d ? (
              <div className="relative grid grid-cols-2 gap-x-6 gap-y-5">
                <Mini label="Активные" value={b?.activeCount ?? d.subscriptions.active} />
                <Mini label="Пробный период" value={b?.trialingCount ?? d.subscriptions.trialing} />
                <Mini label="Просрочены" value={b?.pastDueCount ?? d.subscriptions.pastDue} warn />
                <Mini label="По договору (бесплатно)" value={b?.activeContractGrants ?? 0} />
                <Mini label="Возвраты за 30 дней" value={b ? money(b.refunds30dCents) : '—'} />
                <Mini label="Промокодов применено" value={b?.promoRedemptions30d ?? '—'} />
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Card>
        ) : null}
      </div>

      {o ? (
        <>
          <SectionTitle>Пользователи и команды</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi i={0} small icon={Users} title="Клиенты" value={o.clients} />
            <Kpi i={1} small icon={SealCheck} title="Адвокаты" value={o.attorneys} hint={`верифицировано ${o.attorneysVerified}`} />
            <Kpi i={2} small icon={UsersThree} title="Помощники работают" value={o.assistants} hint={`оплачено мест ${o.assistantSeats}`} />
            <Kpi i={3} small icon={Briefcase} title="Открытые задачи" value={o.tasksOpen} hint={`выполнено за 30 дней ${o.tasksDone30d} · ждут одобрения ${o.requestsPending}`} />
          </div>
          <SectionTitle>Активность за 7 дней</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi i={0} small icon={Briefcase} title="Новые кейсы" value={o.cases7d} />
            <Kpi i={1} small icon={Gavel} title="Ставки" value={o.bids7d} />
            <Kpi i={2} small icon={ChatsCircle} title="Публикации" value={o.posts7d} />
            <Kpi i={3} small icon={ChatsCircle} title="Сообщения в чатах" value={o.messages7d} />
            <Kpi i={4} small icon={Phone} title="Звонки" value={o.calls7d} hint={`пропущено ${o.callsMissed7d}`} />
          </div>
        </>
      ) : null}
    </>
  );
}

function Kpi({
  icon: I,
  title,
  value,
  hint,
  gold,
  small,
  i,
  format,
}: {
  icon: Icon;
  title: string;
  value: number;
  hint?: string;
  gold?: boolean;
  small?: boolean;
  i: number;
  format?: (n: number) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card spotlight className={cn('h-full overflow-hidden', small ? 'p-4' : 'p-5')}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted">{title}</span>
          <span className={cn('grid place-items-center rounded-xl', small ? 'h-7 w-7' : 'h-8 w-8', gold ? 'bg-gold/15 text-gold-600' : 'bg-surface-2 text-faint')}>
            <I size={small ? 15 : 17} weight="light" />
          </span>
        </div>
        <div
          className={cn(
            'mt-2 font-semibold tracking-tight tabular-nums',
            small ? 'text-2xl text-heading' : 'text-[34px] leading-tight',
            !small && (gold ? 'text-gold-gradient' : 'text-heading'),
          )}
        >
          <AnimatedNumber value={value} format={format} />
        </div>
        {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
      </Card>
    </motion.div>
  );
}

function Mini({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('mt-0.5 text-xl font-semibold tabular-nums', warn && Number(value) > 0 ? 'text-warning' : 'text-heading')}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </div>
    </div>
  );
}
