/** Owner 2026-10-05 — Деньги → Зарплаты: pure helpers (tested). */

export const PAYOUT_METHOD: Record<string, string> = {
  manual: "Вручную",
  bank: "Банковский перевод",
  zelle: "Zelle",
  cash: "Наличные",
  other: "Другое",
  stripe: "Stripe (на карту или счёт)",
};

export const PAYOUT_STATUS: Record<string, string> = {
  paid: "выплачено",
  processing: "отправляется",
  failed: "не прошло",
  canceled: "отменено",
};

/** "2026-10" for the current month (local time). */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "1 250,50" / "1250.5" / "$1,250" → 125050 cents; null when not a positive
 * amount (0 allowed with [allowZero], "-50" with [allowNegative]). */
export function parseDollars(
  text: string,
  opts: { allowZero?: boolean; allowNegative?: boolean } = {},
): number | null {
  let clean = text.replace(/[$\s]/g, "");
  const negative = opts.allowNegative === true && /^[-−]/.test(clean);
  if (negative) clean = clean.slice(1);
  const normalized = /,\d{1,2}$/.test(clean)
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  if (cents === 0) return opts.allowZero ? 0 : null;
  return negative ? -cents : cents;
}

export const ACCRUAL_KIND: Record<string, string> = {
  commission: "Комиссия",
  bonus: "Бонус",
  adjustment: "Корректировка",
};

export const ACCRUAL_STATUS: Record<string, string> = {
  pending: "ждёт выплаты",
  paid: "выплачено",
  canceled: "отменено",
};

export interface StripeFees {
  percent: number;
  fixedCents: number;
  monthlyCents: number;
}

/** Stripe's cost of a payout, taken from the person's payout (same formula
 * as the API): percent + fixed, plus the monthly fee on the first Stripe
 * payout of the period. */
export function stripeFee(
  gross: number,
  fees: StripeFees,
  monthly: boolean,
): number {
  return (
    Math.round((gross * fees.percent) / 100) +
    fees.fixedCents +
    (monthly ? fees.monthlyCents : 0)
  );
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

/** currency → total, for the calculator under «Выплатить». */
export function totalsByCurrency(
  rows: { currency: string; cents: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.currency] = (out[r.currency] ?? 0) + r.cents;
  return out;
}

export function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function totalsText(totals: Record<string, number>): string {
  const parts = Object.entries(totals).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" + ") : money(0);
}

const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  // Formula injection guard + quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
