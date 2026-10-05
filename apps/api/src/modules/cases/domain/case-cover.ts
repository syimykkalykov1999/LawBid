/**
 * Owner 2026-10-04: a case card shows an app cover, never the client's
 * face (their photos stay private until a bid is accepted). The client
 * may pick one when posting: `art:<0-3>` is a variant of the practice's
 * cover set, `icon:<name>` an icon avatar. Null = the app picks a variant
 * from the case id. The artwork itself is bundled in the mobile app
 * (apps/mobile/lib/features/cases/presentation/widgets/case_cover.dart).
 */
export const CASE_COVER_VARIANTS = 4;

export const CASE_COVER_ICONS = [
  'balance',
  'gavel',
  'shield',
  'home',
  'briefcase',
  'family',
  'car',
  'flight',
  'heart',
  'star',
  'lightbulb',
  'document',
  'handshake',
  'globe',
  'school',
  'leaf',
] as const;

export const CASE_COVER_KEYS: readonly string[] = [
  ...Array.from({ length: CASE_COVER_VARIANTS }, (_, i) => `art:${i}`),
  ...CASE_COVER_ICONS.map((name) => `icon:${name}`),
];

/** Owner 2026-10-04: how soon the client needs an attorney (shown large
 * on the attorney's feed card). Null on cases posted before it existed.
 * Owner 2026-10-05: levels or a date, see case-urgency.ts. */
export { CASE_URGENCIES, type CaseUrgency } from './case-urgency';

/** Exactly [CASE_COVER_KEYS] (a pattern, not an enum, on the wire). */
export const CASE_COVER_RE = new RegExp(
  `^(art:[0-${CASE_COVER_VARIANTS - 1}]|icon:(${CASE_COVER_ICONS.join('|')}))$`,
);
