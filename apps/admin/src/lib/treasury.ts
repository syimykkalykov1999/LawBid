import type { components } from "@/lib/api/schema";

export type TreasuryOverview = components["schemas"]["TreasuryOverviewDto"];
export type TreasurySetup = components["schemas"]["TreasurySetupDto"];
export type TreasuryBank = components["schemas"]["TreasuryBankDto"];
export type TreasuryCostLine = components["schemas"]["TreasuryCostLineDto"];

/** Computed monthly lines (not editable here: they come from Зарплаты and
 * Партнёры, and the refund buffer from the settings below). */
export const COST_LINE_LABEL: Record<TreasuryCostLine["key"], string> = {
  payroll_stripe: "Зарплаты через Stripe",
  payroll_bank: "Зарплаты из банка",
  owed: "Начислено партнёрам и бонусы",
  refund_buffer: "Запас на возвраты",
};

export const PAYOUT_KIND: Record<string, string> = {
  expenses: "Расходы",
  profit: "Прибыль",
};

export const PAYOUT_STATUS: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  pending: { label: "Отправлено", tone: "neutral" },
  in_transit: { label: "В пути", tone: "warning" },
  paid: { label: "Пришло", tone: "success" },
  failed: { label: "Не прошло", tone: "danger" },
  canceled: { label: "Отменено", tone: "danger" },
};

export interface SetupStep {
  done: boolean;
  title: string;
  /** What to do, only while not done. */
  todo: string;
}

/**
 * Owner 2026-10-05: the one-time steps in Stripe, in plain words. Banks
 * are never added in LawBid: only in Stripe, with the owner's login.
 * Stripe takes one USD bank only (owner 2026-10-06), so no second-bank step.
 */
export function setupSteps(s: TreasurySetup): SetupStep[] {
  return [
    {
      done: s.stripeConnected,
      title: "Ключи Stripe сохранены",
      todo: "Система → Ключи и сервисы → Stripe.",
    },
    {
      done: s.manualPayouts,
      title: "В Stripe выплаты «вручную»",
      todo: "Stripe → Settings → Bank accounts and scheduling → Payout schedule → Manual. Иначе Stripe каждый день сам отправляет всё на основной банк.",
    },
  ];
}

export function bankText(
  b: TreasuryBank | null | undefined,
  fallback: string,
): string {
  return b ? `${b.label} •••${b.last4}` : fallback;
}

/** «1 мес.», «0,5 мес.» */
export function months(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мес.`;
}
