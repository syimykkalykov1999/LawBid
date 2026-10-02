'use client';

import { Check, Copy, Minus, Plus } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, type Tone } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { usd } from '@/lib/labels';
import { cn } from '@/lib/utils';

export type BillingUser = components['schemas']['AdminBillingUserDto'];
export type SubscriptionRow = components['schemas']['AdminBillingSubscriptionRowDto'];
export type ContractGrant = components['schemas']['ContractGrantDto'];
export type PromoCode = components['schemas']['PromoCodeDto'];
export type AdminPayment = components['schemas']['AdminPaymentDto'];
export type Refund = components['schemas']['RefundDto'];

/** Prices (billing.constants on the server). */
export const PRICES = { monthlyCents: 39_900, seatCents: 10_000, yearlyCents: 959_000, maxSeats: 6 } as const;

/** Money pages open to the super admin only; others get 403 from the API. */
export function useBillingRole() {
  const { data: me } = useMe();
  return {
    me,
    // Money is the super admin's alone (owner 2026-10-02).
    canWrite: me?.role === 'super_admin',
    canOpenUsers: can(me, 'users'),
  };
}

export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: Math.min(i, 12) * 0.04, ease: [0.16, 1, 0.3, 1] as const },
});

export function userName(u: BillingUser | null | undefined, fallbackId?: string): string {
  if (!u) return fallbackId ? fallbackId.slice(0, 8) : '—';
  return u.name || (u.username ? `@${u.username}` : u.email || u.id.slice(0, 8));
}

/** Name + email; a link to the user page when the role can open it. */
export function UserCell({ user, userId, link }: { user: BillingUser | null; userId: string; link: boolean }) {
  const name = userName(user, userId);
  return (
    <div className="min-w-0">
      {link ? (
        <Link
          href={`/users/${userId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-ink">{name}</span>
      )}
      {user?.email && user.email !== name ? <div className="truncate text-xs text-faint">{user.email}</div> : null}
    </div>
  );
}

/** Thin progress bar, value 0..1. */
export function ProgressBar({ value, tone = 'gold', className }: { value: number; tone?: 'gold' | 'success' | 'warning' | 'danger' | 'muted'; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const fill = {
    gold: 'bg-gold',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    muted: 'bg-faint',
  }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', fill)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** "Показать ещё" for useInfiniteQuery lists. */
export function LoadMore({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" loading={q.isFetchingNextPage} disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
        Показать ещё
      </Button>
    </div>
  );
}

/** − n + stepper. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-line-strong bg-surface p-1" aria-label={label}>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Меньше">
        <Minus size={14} />
      </Button>
      <span className="w-8 text-center font-mono text-sm tabular-nums text-ink">{value}</span>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Больше">
        <Plus size={14} />
      </Button>
    </div>
  );
}

export function CopyButton({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {done ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Badge with an explicit tone per value (for enums toneFor doesn't know). */
export function TonePill({ map, tones, value }: { map: Record<string, string>; tones: Record<string, Tone>; value: string }) {
  return (
    <Badge tone={tones[value] ?? 'neutral'} dot>
      {map[value] ?? value}
    </Badge>
  );
}

export const CONTRACT_STATUS: Record<string, string> = {
  scheduled: 'запланирована',
  active: 'действует',
  expired: 'закончилась',
  revoked: 'отозвана',
};
export const CONTRACT_TONE: Record<string, Tone> = { scheduled: 'info', active: 'success', expired: 'neutral', revoked: 'danger' };

export const PROMO_STATUS: Record<string, string> = {
  active: 'действует',
  scheduled: 'ещё не начался',
  expired: 'истёк',
  exhausted: 'лимит исчерпан',
  inactive: 'выключен',
};
export const PROMO_TONE: Record<string, Tone> = { active: 'success', scheduled: 'info', expired: 'neutral', exhausted: 'warning', inactive: 'neutral' };

export const PROMO_AUDIENCE: Record<string, string> = { all: 'все', attorney: 'адвокаты', client: 'клиенты' };
export const PROMO_APPLIES: Record<string, string> = {
  any: 'любой тариф',
  monthly: 'месячный',
  yearly: 'годовой',
  promotion: 'продвижение кейса',
};

export const REFUND_STATUS: Record<string, string> = { pending: 'в обработке', succeeded: 'выполнен', failed: 'ошибка' };

export function discountText(p: Pick<PromoCode, 'discountType' | 'percentOff' | 'amountOffCents' | 'freeDays'>): string {
  if (p.discountType === 'percent') return `−${p.percentOff ?? 0}%`;
  if (p.discountType === 'amount') return `−${usd(p.amountOffCents ?? 0)}`;
  return `+${p.freeDays ?? 0} ${plural(p.freeDays ?? 0, 'день', 'дня', 'дней')}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const monthsText = (n: number) => `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;

/** Local date helpers for <input type="date">. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStartIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}
export function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(iso));
}

/** Elapsed share of [start, end) at now, 0..1. */
export function elapsed(startIso: string, endIso: string, now = Date.now()): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (e <= s) return 1;
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}

export function daysLeft(endIso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(endIso).getTime() - now) / 86_400_000));
}

/** Monthly price for a plan + seats (for previews). */
export function planPriceCents(plan: 'monthly' | 'yearly', seats: number): number {
  return plan === 'yearly' ? PRICES.yearlyCents : PRICES.monthlyCents + PRICES.seatCents * seats;
}

/** Dollars text field → integer cents (null if not a positive amount). */
export function dollarsToCents(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
