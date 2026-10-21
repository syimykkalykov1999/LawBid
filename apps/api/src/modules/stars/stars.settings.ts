import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';

export const STARS_FLAG = 'stars';
export const STARS_SETTINGS_KEY = 'stars.settings';
export const STARS_CHECKOUT_KIND = 'stars';

/** A pack of stars sold on the web. */
export interface StarPack {
  id: string;
  stars: number;
  priceCents: number;
}

/** The owner's starting prices (admin → Звёзды edits them). */
export const DEFAULT_STAR_PACKS: StarPack[] = [
  { id: 'stars_50', stars: 50, priceCents: 99 },
  { id: 'stars_150', stars: 150, priceCents: 279 },
  { id: 'stars_500', stars: 500, priceCents: 899 },
  { id: 'stars_1000', stars: 1000, priceCents: 1699 },
  { id: 'stars_2500', stars: 2500, priceCents: 3999 },
];

const PACK_ID = /^[a-z][a-z0-9_]{1,39}$/;

/** Defensive parse: a broken row falls back to the defaults. */
export function parseStarPacks(raw: unknown): StarPack[] {
  const list = (raw as { packs?: unknown } | null)?.packs;
  if (!Array.isArray(list)) return DEFAULT_STAR_PACKS;
  const out: StarPack[] = [];
  for (const p of list as Record<string, unknown>[]) {
    if (
      typeof p?.id === 'string' &&
      PACK_ID.test(p.id) &&
      Number.isInteger(p.stars) &&
      (p.stars as number) > 0 &&
      Number.isInteger(p.priceCents) &&
      (p.priceCents as number) >= 50
    ) {
      out.push({
        id: p.id,
        stars: p.stars as number,
        priceCents: p.priceCents as number,
      });
    }
  }
  return out;
}

export function assertUniquePackIds(packs: StarPack[]): void {
  if (new Set(packs.map((p) => p.id)).size !== packs.length) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Pack ids must be unique.',
    });
  }
}

/** What the receiver of a gift gets when turning it into stars. */
export function convertedStars(priceStars: number, percent: number): number {
  const p = Math.min(100, Math.max(0, Math.floor(percent)));
  return Math.floor((priceStars * p) / 100);
}

export const DEFAULT_CONVERT_PERCENT = 70;
export const DEFAULT_GIFTS_PER_DAY = 100;
/** US cents one star is worth when a Boost is paid in stars. */
export const DEFAULT_STAR_CENTS = 2;
/** Stars a premium reaction costs (once per message and reaction). */
export const DEFAULT_REACTION_STARS = 3;
/** Free reactions everyone has; premium ones cost stars. */
export const FREE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const DEFAULT_PREMIUM_REACTIONS = [
  '🔥',
  '🎉',
  '💯',
  '👏',
  '🤝',
  '⚖️',
  '🏆',
  '💎',
];

/** Stars to pay for [cents]; never less than 1 for a paid Boost. */
export function starsForCents(cents: number, starCents: number): number {
  return Math.max(1, Math.ceil(cents / Math.max(1, starCents)));
}

/** Defensive parse of the premium reaction list (short emoji strings). */
export function parsePremiumReactions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_PREMIUM_REACTIONS;
  const out: string[] = [];
  for (const e of raw as unknown[]) {
    if (
      typeof e === 'string' &&
      e.length > 0 &&
      e.length <= 16 &&
      !FREE_REACTIONS.includes(e) &&
      !out.includes(e)
    ) {
      out.push(e);
    }
  }
  return out.slice(0, 24);
}

/** The stored row: packs + the two gift tunables (all admin-edited). */
export function parseStarsConfig(raw: unknown): {
  packs: StarPack[];
  giftConvertPercent: number;
  giftsPerDayMax: number;
  starCents: number;
  reactionStars: number;
  premiumReactions: string[];
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pct = r.giftConvertPercent;
  const max = r.giftsPerDayMax;
  const sc = r.starCents;
  const rs = r.reactionStars;
  return {
    packs: parseStarPacks(raw),
    giftConvertPercent:
      typeof pct === 'number' && Number.isInteger(pct) && pct >= 0 && pct <= 100
        ? pct
        : DEFAULT_CONVERT_PERCENT,
    giftsPerDayMax:
      typeof max === 'number' && Number.isInteger(max) && max >= 1
        ? max
        : DEFAULT_GIFTS_PER_DAY,
    starCents:
      typeof sc === 'number' && Number.isInteger(sc) && sc >= 1 && sc <= 1000
        ? sc
        : DEFAULT_STAR_CENTS,
    reactionStars:
      typeof rs === 'number' && Number.isInteger(rs) && rs >= 1 && rs <= 1000
        ? rs
        : DEFAULT_REACTION_STARS,
    premiumReactions: parsePremiumReactions(r.premiumReactions),
  };
}
