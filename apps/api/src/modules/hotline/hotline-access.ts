import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { HotlineBillingMode } from '../../common/app-settings/hotline-settings';

/** Owner row 87 (16.11): the master switch (Флаги → «Горячая линия»). */
export const HOTLINE_FLAG = 'hotline';
/** Деньги → Планы: the plans the owner ticked (billing mode `plan`). */
export const HOTLINE_ENTITLEMENT = 'hotline';

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
  mode: HotlineBillingMode;
  /** The `hotline` entitlement of the attorney's plan (or an admin grant). */
  entitled: boolean;
  /** A paid «Горячая линия» add-on is active (plan PR 8; payments are off,
   * so today only an admin grant of the entitlement counts). */
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
  | { allowed: false; reason: 'not_in_plan' | 'addon_required' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inside the trial: days count from the first «Ожидать звонки», minutes are
 * talked minutes; with both set, both must still be left. Never used = the
 * trial is still whole. */
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
 * Owner 16.11 ~18:35: «Бесплатно» (default) / «Входит в подписку» /
 * «Отдельное дополнение» + an optional trial. The client never pays. Pure, so
 * every mode is a unit test; the caller reads the inputs (one cached
 * app_config read, one cached entitlement read, two Valkey fields).
 */
export function decideHotlineAccess(i: HotlineAccessInput): HotlineAccess {
  if (i.mode === 'free') return { allowed: true, via: 'free' };
  if (i.mode === 'plan') {
    if (i.entitled) return { allowed: true, via: 'plan' };
    if (inHotlineTrial(i)) return { allowed: true, via: 'trial' };
    return { allowed: false, reason: 'not_in_plan' };
  }
  if (i.addonActive || i.entitled) return { allowed: true, via: 'addon' };
  if (inHotlineTrial(i)) return { allowed: true, via: 'trial' };
  return { allowed: false, reason: 'addon_required' };
}
