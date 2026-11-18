import type { HotlineMode } from '../../common/app-settings/hotline-settings';

/** Owner row 87 (16.11): the plan builder's «Горячая линия входит в тариф». */
export const HOTLINE_INCLUDED_KEY = 'hotline';
/** «Горячая линия — отдельное дополнение, цена» (cents a month; null = none). */
export const HOTLINE_ADDON_PRICE_KEY = 'hotline_addon_price_cents';

export interface HotlineAddonOfferInput {
  /** Флаги → «Горячая линия». */
  flagOn: boolean;
  /** `hotline.mode`. */
  mode: HotlineMode;
  /** The attorney's plan code (null = no plan, a legacy row). */
  planCode: string | null;
  /** The entitlements that stand (plan + frozen snapshot). */
  values: Readonly<Record<string, unknown>>;
}

/**
 * Owner row 87 (16.11, plan PR 8): the subscription card offers the
 * «Горячая линия» add-on only when it can matter — the line is on, its mode
 * is «По подписке», the plan does not include it and the plan names an
 * add-on price. «Вкл для всех» = free for everyone, nothing to buy.
 * Returns the plan's add-on price (cents) or null.
 */
export function hotlineAddonOffer(i: HotlineAddonOfferInput): number | null {
  if (!i.flagOn || i.mode !== 'by_subscription' || !i.planCode) return null;
  if (i.values[HOTLINE_INCLUDED_KEY] === true) return null;
  const p = i.values[HOTLINE_ADDON_PRICE_KEY];
  return typeof p === 'number' && Number.isFinite(p) && p > 0
    ? Math.round(p)
    : null;
}

/** The row fields the webhook sync writes. */
export interface HotlineAddonRowPatch {
  hotline_addon?: boolean;
  hotline_addon_ends_at?: Date | null;
  hotline_addon_invoice_id?: string | null;
  price_cents?: number;
}

/**
 * Owner row 87 (plan PR 8): the webhook keeps the row on what Stripe has.
 * - The add-on item is on the subscription → on (a purchase paid after
 *   3-D Secure lands here: `pending_if_incomplete` puts the item on only
 *   once its invoice is paid). The monthly total grows by its price.
 * - The item is gone while the row says on → removed outside the app (the
 *   Stripe Dashboard): usable to the period end like a removal in the app,
 *   no refund.
 * - No pending update left and the item absent → a waiting purchase
 *   expired or was voided: the waiting invoice is forgotten.
 * [basePriceCents] = the row's monthly total after the seat sync.
 * Subscriptions without known add-on prices are left as they are.
 */
export function hotlineAddonSync(
  local: {
    hotline_addon: boolean;
    hotline_addon_invoice_id: string | null;
    current_period_end: Date | null;
  },
  remote: {
    items?: {
      priceId: string;
      quantity: number;
      unitAmountCents: number | null;
    }[];
    pendingUpdateExpiresAt?: number | null;
    currentPeriodEnd?: number | null;
  },
  ids: ReadonlySet<string> | null,
  basePriceCents: number,
  /** The add-on's monthly price (removal: taken off the total, as the
   * app's own turn-off does). Unknown: the total is left as it is. */
  addonCents: number | null = null,
): HotlineAddonRowPatch {
  if (!remote.items || !ids || ids.size === 0) return {};
  const item = remote.items.find((i) => ids.has(i.priceId) && i.quantity > 0);
  if (item) {
    if (local.hotline_addon) {
      return local.hotline_addon_invoice_id
        ? { hotline_addon_invoice_id: null }
        : {};
    }
    return {
      hotline_addon: true,
      hotline_addon_ends_at: null,
      hotline_addon_invoice_id: null,
      price_cents: Math.max(0, basePriceCents + (item.unitAmountCents ?? 0)),
    };
  }
  if (local.hotline_addon) {
    const end = remote.currentPeriodEnd
      ? new Date(remote.currentPeriodEnd * 1000)
      : (local.current_period_end ?? new Date());
    // Verify 17.11 (batch 9): removed in the Stripe Dashboard, the row's
    // monthly total kept the add-on price for good (the app's «next
    // charge» stayed too high); the app's turn-off takes it off.
    return {
      hotline_addon: false,
      hotline_addon_ends_at: end,
      hotline_addon_invoice_id: null,
      ...(addonCents !== null && addonCents > 0
        ? { price_cents: Math.max(0, basePriceCents - addonCents) }
        : {}),
    };
  }
  if (local.hotline_addon_invoice_id && !remote.pendingUpdateExpiresAt) {
    return { hotline_addon_invoice_id: null };
  }
  return {};
}

/**
 * Stripe's proration for one item added mid-period (docs.stripe.com/
 * billing/subscriptions/prorations): the unit price × the unused share of
 * the period, rounded to the cent. Used by the tests and the fake provider
 * to check the amounts Stripe returns, never to charge.
 */
export function proratedCents(
  unitCents: number,
  quantity: number,
  periodStart: number,
  periodEnd: number,
  at: number,
): number {
  if (periodEnd <= periodStart) return unitCents * quantity;
  const left = Math.min(
    1,
    Math.max(0, periodEnd - at) / (periodEnd - periodStart),
  );
  return Math.round(unitCents * quantity * left);
}
