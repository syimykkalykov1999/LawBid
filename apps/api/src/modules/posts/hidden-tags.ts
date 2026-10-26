import { Prisma } from '@prisma/client';

/**
 * Owner 2026-10-13: ONE tag algorithm for Topics, search, the Reels filters,
 * hashtag chips and profile filters. A post's qualification is stored as
 * hidden tags — `~family` and `~family.divorce` for "family.divorce" (the
 * category and every level under it, so a category filter is one lookup, no
 * prefix scan). `~` cannot occur in a typed hashtag, and the chips, tag
 * search and trending never show a hidden tag.
 */
export const HIDDEN_TAG_PREFIX = '~';

export function isHiddenTag(tag: string): boolean {
  return tag.startsWith(HIDDEN_TAG_PREFIX);
}

/** The hidden tag of one qualification code (`family.divorce`). */
export function hiddenTagOf(code: string): string {
  return `${HIDDEN_TAG_PREFIX}${code.trim().toLowerCase()}`;
}

/** The tags written on a post: the code and each ancestor of it. */
export function hiddenTagsFor(code: string | null | undefined): string[] {
  if (!code) return [];
  const parts = code.trim().toLowerCase().split('.').filter(Boolean);
  return parts.map((_, i) => hiddenTagOf(parts.slice(0, i + 1).join('.')));
}

/**
 * Posts written before qualifications existed carry only a topic hashtag.
 * The topic hashtags each practice category answers to — the same list the
 * app's topic slider always used.
 */
const LEGACY_TOPIC_TAGS: Record<string, string[]> = {
  immigration: ['immigration', 'greencard', 'visa', 'asylum'],
  family_law: ['familylaw', 'divorce', 'custody', 'childcustody'],
  traffic_tickets: ['traffic', 'trafficticket', 'speeding', 'tickets'],
  dui_and_dwi: ['dui', 'dwi'],
  criminal_defense: ['criminaldefense', 'criminal'],
  personal_injury: ['personalinjury', 'injury', 'caraccident'],
  real_estate: ['realestate'],
  employment_and_labor: ['employment', 'workplace'],
  bankruptcy_and_debt: ['bankruptcy', 'debt'],
};

/** The legacy hashtags of a practice category (top level only). */
export function legacyTopicTags(code: string): string[] {
  return LEGACY_TOPIC_TAGS[code.trim().toLowerCase()] ?? [];
}

/**
 * Owner 2026-10-18 (search filters audit): ONE Prisma clause for "posts of
 * this qualification (a category includes every leaf under it, a leaf only
 * itself)". It reads BOTH the hidden tags AND `posts.practice_area_id`,
 * because posts created by seeds / imports / before the hidden tags carry
 * only the column (a `family_law.divorce` post had no `~family_law` tag, so
 * the "Family law" filter found nothing). Legacy posts without a
 * qualification fall back to topic hashtags.
 */
export function postPracticeWhere(
  codes: string[],
  legacyTags: string[] = [],
): Prisma.PostWhereInput {
  const list = [
    ...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean)),
  ];
  return {
    OR: [
      {
        tags: {
          some: { tag: { tag_lower: { in: list.map((c) => hiddenTagOf(c)) } } },
        },
      },
      {
        practice_area: {
          OR: list.flatMap((c) => [
            { code: c },
            { code: { startsWith: `${c}.` } },
          ]),
        },
      },
      ...(legacyTags.length
        ? [
            {
              practice_area_id: null,
              tags: { some: { tag: { tag_lower: { in: legacyTags } } } },
            },
          ]
        : []),
    ],
  };
}

/** Raw-SQL twin of [postPracticeWhere] for alias `p` (posts). */
export function postPracticeSql(
  code: string,
  legacyTags: string[] = [],
): Prisma.Sql {
  const c = code.trim().toLowerCase();
  return Prisma.sql`(EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.tag_lower = ${hiddenTagOf(c)})
    OR EXISTS (SELECT 1 FROM practice_areas fpa WHERE fpa.id = p.practice_area_id AND (fpa.code = ${c} OR fpa.code LIKE ${`${c.replace(/[\\%_]/g, '\\$&')}.%`}))${
      legacyTags.length
        ? Prisma.sql` OR (p.practice_area_id IS NULL AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.tag_lower = ANY(${legacyTags}::TEXT[])))`
        : Prisma.empty
    })`;
}
