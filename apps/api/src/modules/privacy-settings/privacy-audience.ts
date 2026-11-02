import type { PrivacyAudience } from '@prisma/client';

/**
 * Owner 2026-10-28: each «who can» setting is a SET of audiences, stored as
 * a bitmask in `user_privacy_settings.<field>_mask`:
 *   0 = nobody, 1 = my contacts (phone book), 2 = my followers,
 *   4 = people I follow, 8 = everyone (wins over the rest).
 * NULL means the row predates the masks: read the old enum column.
 */
export const AUDIENCE_BITS = {
  contacts: 1,
  followers: 2,
  following: 4,
  everyone: 8,
} as const;

export const AUDIENCE_OPTIONS = [
  'everyone',
  'contacts',
  'followers',
  'following',
  'nobody',
] as const;
export type AudienceOption = (typeof AUDIENCE_OPTIONS)[number];

/** The old 3-value enum (still in the API and in the DB for N-1 builds). */
export const LEGACY_AUDIENCES = ['everyone', 'contacts', 'nobody'] as const;
export type LegacyAudience = (typeof LEGACY_AUDIENCES)[number];

const ALL = 15;

/** Keeps only known bits; «everyone» swallows the narrower ones. */
export function normalizeMask(mask: number): number {
  const m = mask & ALL;
  return m & AUDIENCE_BITS.everyone ? AUDIENCE_BITS.everyone : m;
}

/**
 * The old «my contacts» meant phone book OR people I follow: map it to that
 * set so nobody loses access they had (same mapping as the migration).
 */
export function maskFromLegacy(a: PrivacyAudience | LegacyAudience): number {
  if (a === 'everyone') return AUDIENCE_BITS.everyone;
  if (a === 'contacts') return AUDIENCE_BITS.contacts | AUDIENCE_BITS.following;
  return 0;
}

/** The closest old value, for old app builds and the old column. */
export function legacyFromMask(mask: number): LegacyAudience {
  const m = normalizeMask(mask);
  if (m & AUDIENCE_BITS.everyone) return 'everyone';
  return m === 0 ? 'nobody' : 'contacts';
}

export function maskFromOptions(options: readonly AudienceOption[]): number {
  let m = 0;
  for (const o of options) if (o !== 'nobody') m |= AUDIENCE_BITS[o];
  return normalizeMask(m);
}

export function optionsFromMask(mask: number): AudienceOption[] {
  const m = normalizeMask(mask);
  if (m & AUDIENCE_BITS.everyone) return ['everyone'];
  if (m === 0) return ['nobody'];
  return (['contacts', 'followers', 'following'] as const).filter(
    (o) => (m & AUDIENCE_BITS[o]) !== 0,
  );
}

/**
 * Stored mask when set, else the old column mapped. This server writes both
 * in step; when they disagree, a build one version older (rolling deploy,
 * rollback) changed the old column after us, and that newer choice wins.
 */
export function effectiveMask(
  mask: number | null | undefined,
  legacy: PrivacyAudience | null | undefined,
): number {
  const old = legacy ?? 'everyone';
  if (typeof mask === 'number' && legacyFromMask(mask) === old) {
    return normalizeMask(mask);
  }
  return maskFromLegacy(old);
}
