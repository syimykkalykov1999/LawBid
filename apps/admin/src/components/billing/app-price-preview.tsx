'use client';

import { Check, Crown, Diamond } from '@phosphor-icons/react';

/**
 * Owner 2026-10-07: how a price looks in the app — the top of the app's
 * plan card (PlanTierCard: title, then «$99 / ~~$149~~ месяц −33%»), in the
 * app's own light and dark colours. Only the price line is new; the card
 * itself is the app's, unchanged.
 */

const APP = {
  light: { bg: '#FFFFFF', surface: '#FFFFFF', text: '#0B1330', muted: '#5B6784', border: '#DDE2EE' },
  dark: { bg: '#0B0B0D', surface: '#16161B', text: '#F3EFE3', muted: '#9A9AA6', border: '#2A2A31' },
} as const;
const GOLD = '#C9A24A';
const GOLD_DARK = '#8E6F26';
const NAVY = '#0A1A3F';

export type PreviewDiscount = { compareAtCents: number; percent: number } | null;

const appMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

/** The same rule as the API (discountOf): only a real discount shows. */
export function previewDiscount(amountCents: number | null, compareAtCents: number | null, show: boolean): PreviewDiscount {
  if (!show || amountCents == null || compareAtCents == null || amountCents <= 0 || compareAtCents <= amountCents) return null;
  const percent = Math.min(99, Math.floor(((compareAtCents - amountCents) / compareAtCents) * 100));
  return percent >= 1 ? { compareAtCents, percent } : null;
}

export function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span className="inline-flex items-center rounded-full px-[7px] py-[2px] text-[12px] leading-[1.2] font-bold" style={{ background: GOLD, color: NAVY }}>
      −{percent}%
    </span>
  );
}

type PreviewProps = { title: string; amountCents: number; yearly: boolean; discount: PreviewDiscount; lines?: string[]; linesNote?: string };

function OneCard({ theme, title, amountCents, yearly, discount, lines }: PreviewProps & { theme: 'light' | 'dark' }) {
  const c = APP[theme];
  return (
    <div className="min-w-0 flex-1 rounded-[20px] border p-3" style={{ background: c.bg, borderColor: c.border }}>
      <div className="mb-2 text-[10px] font-medium tracking-wide uppercase" style={{ color: c.muted }}>
        {theme === 'light' ? 'Светлая тема' : 'Тёмная тема'}
      </div>
      <div className="rounded-[16px] border-[1.5px] p-4" style={{ background: c.surface, borderColor: GOLD }}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border" style={{ background: NAVY, borderColor: GOLD_DARK }}>
            {yearly ? <Diamond size={18} color={GOLD} weight="light" /> : <Crown size={18} color={GOLD} weight="light" />}
          </span>
          <span className="min-w-0 font-serif text-[22px] leading-tight font-semibold break-words" style={{ color: c.text }}>
            {title}
          </span>
        </div>
        <div className="mt-3 leading-[1.5]">
          <span className="text-[30px] leading-[1.1] font-semibold" style={{ color: c.text }}>
            {appMoney(amountCents)}
          </span>
          {discount ? (
            <>
              <span className="text-[15px]" style={{ color: c.muted }}>
                {' / '}
                <span className="line-through decoration-[1.6px]">{appMoney(discount.compareAtCents)}</span> {yearly ? 'год' : 'месяц'}
              </span>{' '}
              <span className="align-middle">
                <DiscountBadge percent={discount.percent} />
              </span>
            </>
          ) : (
            <span className="text-[15px]" style={{ color: c.muted }}>
              {'  '}
              {yearly ? 'в год' : 'в месяц'}
            </span>
          )}
        </div>
        {lines?.length ? (
          <ul className="mt-3 space-y-1.5">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: c.text }}>
                <Check aria-hidden size={15} weight="light" className="mt-[1px] shrink-0" color={GOLD_DARK} />
                <span className="min-w-0 break-words">{l}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function AppPricePreview({ linesNote, ...props }: PreviewProps) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted">Так увидят в приложении и на сайте</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <OneCard theme="light" {...props} />
        <OneCard theme="dark" {...props} />
      </div>
      {linesNote ? <div className="mt-1.5 text-xs text-faint">{linesNote}</div> : null}
    </div>
  );
}
