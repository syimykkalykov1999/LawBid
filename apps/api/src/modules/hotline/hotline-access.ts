import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { HotlineMode } from '../../common/app-settings/hotline-settings';

/** Owner row 87 (16.11): the master switch (Флаги → «Горячая линия»). */
export const HOTLINE_FLAG = 'hotline';
/** Деньги → Планы, per plan: «Входит в тариф». */
export const HOTLINE_ENTITLEMENT = 'hotline';
/** Деньги → Планы, per plan: «Отдельное дополнение $N» (cents; null = none). */
export const HOTLINE_ADDON_PRICE_ENTITLEMENT = 'hotline_addon_price_cents';

interface FlagReader {
  isEnabled(key: string, defaultValue: boolean): Promise<boolean>;
}

/** Off (the default) = 403 FEATURE_DISABLED on every hotline route, the same
 * answer as the other switched-off features (`details.flag`). */
export async function assertHotlineOn(flags: FlagReader): Promise<void> {
  if (await flags.isEnabled(HOTLINE_FLAG, false)) return;
  throw new ForbiddenException({
    code: ErrorCode.FEATURE_DISABLED,
    message: 'The call hotline is not available yet.',
    details: { flag: HOTLINE_FLAG },
  });
}

export interface HotlineAccessInput {
  /** `hotline.mode`: on_for_all (start) / by_subscription / off_for_all. */
  mode: HotlineMode;
  /** The attorney's plan: «Входит в тариф» (or an admin grant). */
  included: boolean;
  /** The attorney's plan: add-on price in cents, null = no add-on. */
  addonPriceCents: number | null;
  /** He bought the add-on on the subscription card (plan PR 8). */
  addonActive: boolean;
  trialDays: number;
  trialMinutes: number;
  /** When this attorney first turned «Ожидать звонки» on (ms), null = never. */
  firstOnlineAt: number | null;
  /** Hotline minutes this attorney has talked so far. */
  minutesUsed: number;
  now: number;
}

export type HotlineAccess =
  | { allowed: true; via: 'free' | 'plan' | 'addon' | 'trial' }
  | {
      allowed: false;
      reason: 'off_for_all' | 'not_in_plan' | 'addon_required';
    };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inside the one-time trial: days count from the first «Ожидать звонки»,
 * minutes are talked minutes; with both set, both must still be left. */
export function inHotlineTrial(i: HotlineAccessInput): boolean {
  if (i.trialDays <= 0 && i.trialMinutes <= 0) return false;
  const daysOk =
    i.trialDays <= 0 ||
    i.firstOnlineAt === null ||
    i.now - i.firstOnlineAt < i.trialDays * DAY_MS;
  const minutesOk = i.trialMinutes <= 0 || i.minutesUsed < i.trialMinutes;
  return daysOk && minutesOk;
}

/**
 * Owner 16.11 ~19:45 / ~20:05: the three modes of the plan builder
 * (attachments_in_posts) — «Вкл для всех» / «Выкл для всех» / «По
 * подписке»; by subscription each plan is «Входит в тариф» / «Отдельное
 * дополнение $N» / «Недоступно», plus a one-time trial. The client never
 * pays. Pure, so every case is a unit test; the caller reads the inputs
 * (cached app_config, cached plan entitlements, two Valkey fields).
 */
export function decideHotlineAccess(i: HotlineAccessInput): HotlineAccess {
  if (i.mode === 'on_for_all') return { allowed: true, via: 'free' };
  if (i.mode === 'off_for_all')
    return { allowed: false, reason: 'off_for_all' };
  if (i.included) return { allowed: true, via: 'plan' };
  if (i.addonPriceCents !== null && i.addonActive) {
    return { allowed: true, via: 'addon' };
  }
  if (inHotlineTrial(i)) return { allowed: true, via: 'trial' };
  return {
    allowed: false,
    reason: i.addonPriceCents !== null ? 'addon_required' : 'not_in_plan',
  };
}
