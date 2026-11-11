import { ApiPropertyOptional } from '@nestjs/swagger';
import { readsAreSplit } from '../../../sharding/split-reads';
import { forEachDatabase } from '../../../sharding/for-each-database';
import { shardContext } from '../../../sharding/shard-context';
import { Prisma } from '@prisma/client';
import { nameKeys, nameMatchSql } from '../../../common/search/name-match.sql';
import { Transform } from 'class-transformer';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CASE_LIST_SORTS,
  parseStages,
  stagesWhere,
  type CaseListSort,
  type CaseStage,
} from '../case-stages';

/** Owner 2026-09-30: "Mine" lists grow long — search by title and filter
 * by qualification (a category includes its subcategories) and state. */
export class MineFilterFields {
  @ApiPropertyOptional({
    description:
      'Words of the case: title, description, city, state, topic (any language).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'civil_litigation' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]{2,120}$/)
  practice?: string;

  @ApiPropertyOptional({ example: 'IL' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  /** Owner 2026-11-09: the «По этапам» filter — stages 0..4 of the app's
   * scale (0 published, 1 bids, 2 in progress, 3 wrapping up, 4 done),
   * comma-separated or repeated. */
  @ApiPropertyOptional({
    type: [Number],
    description:
      'Only cases at these stages (0 published · 1 bids · 2 in progress · 3 wrapping up · 4 done); `0,1` or repeated.',
    example: [0, 1],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseStages(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  stages?: CaseStage[];

  /** Owner 2026-11-09: «Ждёт меня» — the cases whose next move is mine
   * (a client: bids to choose from, a completion to confirm). */
  @ApiPropertyOptional({
    description:
      'Only the cases waiting for me (client: open with bids, or pending completion).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  awaiting?: boolean;

  /** Owner 2026-11-09: the order of a stage list — `stage` (most advanced
   * first, then the newest activity; the default of «Active»), `newest`
   * or `oldest` by the case's date. */
  @ApiPropertyOptional({ enum: CASE_LIST_SORTS, enumName: 'CaseListSort' })
  @IsOptional()
  @IsIn(CASE_LIST_SORTS)
  sort?: CaseListSort;
}

export function hasMineFilter(f: MineFilterFields): boolean {
  return !!(
    f.q ||
    f.practice ||
    f.state ||
    (f.stages && f.stages.length > 0) ||
    f.awaiting
  );
}

/**
 * Audit 2026-10-18: "Мои дела" search looks in what a case shows: title,
 * description, city, state (code or name) and its topics (any language,
 * a category covers its subtopics). Every typed word must match somewhere.
 * [topicIds] = per word, the practice ids it names ([topicIdsByWord]).
 */
export function mineCaseWhere(
  f: MineFilterFields,
  topicIds: Map<string, string[]> = new Map(),
  // Owner 2026-10-18: per word, case ids it matched in the attorney's work
  // (accent / ё-insensitive title or description, the client's name or
  // @username — see [workWordHits]).
  extraHits: Map<string, string[]> = new Map(),
): Prisma.CaseWhereInput {
  const words = (f.q ?? '').split(/\s+/).filter((w) => w.length > 0);
  // Owner 2026-11-09: «По этапам» and «Ждёт меня» (the client's turn: bids
  // to choose from, or a completion to confirm) narrow the rest (AND).
  const narrow: Prisma.CaseWhereInput[] = [
    ...(f.stages && f.stages.length > 0 ? [stagesWhere(f.stages)] : []),
    ...(f.awaiting ? [AWAITING_ME_WHERE] : []),
  ];
  return {
    ...(words.length || narrow.length
      ? {
          AND: [
            ...narrow,
            ...words.map((w) => {
              const ids = topicIds.get(w) ?? [];
              const hits = extraHits.get(w) ?? [];
              const ci = { contains: w, mode: 'insensitive' as const };
              return {
                OR: [
                  ...(hits.length ? [{ id: { in: hits } }] : []),
                  { title: ci },
                  { description: ci },
                  { city: ci },
                  { practice_area: { name_en: ci } },
                  { practice_area: { parent: { name_en: ci } } },
                  { states: { some: { state: { name: ci } } } },
                  ...(w.length === 2
                    ? [
                        {
                          states: {
                            some: { state_code: w.toUpperCase() },
                          },
                        },
                      ]
                    : []),
                  ...(ids.length
                    ? [
                        { practice_area_id: { in: ids } },
                        {
                          extra_practices: {
                            some: { practice_area_id: { in: ids } },
                          },
                        },
                      ]
                    : []),
                ],
              };
            }),
          ],
        }
      : {}),
    ...(f.practice
      ? {
          practice_area: {
            OR: [
              { code: f.practice },
              { code: { startsWith: `${f.practice}.` } },
            ],
          },
        }
      : {}),
    ...(f.state
      ? { states: { some: { state_code: f.state.toUpperCase() } } }
      : {}),
  };
}

const AWAITING_ME_WHERE: Prisma.CaseWhereInput = {
  OR: [
    { status: 'open', bids_count: { gt: 0 } },
    { status: 'pending_completion' },
  ],
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Per typed word: the practices (and their subtopics) whose name or
 * keywords in ANY language have a word starting with it. */
export async function topicIdsByWord(
  prisma: PrismaService,
  q: string | undefined,
): Promise<Map<string, string[]>> {
  const words = [
    ...new Set((q ?? '').split(/\s+/).filter((w) => w.length >= 3)),
  ].slice(0, 6);
  const out = new Map<string, string[]>();
  for (const w of words) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH hits AS (
        SELECT DISTINCT pa.id FROM practice_areas pa
        JOIN i18n_keys k ON k.key IN (pa.i18n_key, pa.i18n_key || '.kw')
        JOIN i18n_translations t ON t.key_id = k.id
        WHERE public.f_unaccent(' ' || replace(lower(t.value), ',', ' '))
              LIKE ${`% ${escapeLike(w.toLowerCase())}%`}
        LIMIT 40)
      SELECT id::TEXT AS id FROM hits
      UNION
      SELECT c.id::TEXT FROM practice_areas c JOIN hits h ON c.parent_id = h.id`;
    out.set(
      w,
      rows.map((r) => r.id),
    );
  }
  return out;
}

/**
 * Owner 2026-10-18: «В работе» search. Per typed word, the ids of the
 * attorney's accepted cases it matches by: title / description ignoring
 * case, accents and ё = е; and — only when [withClient] (the attorney sees
 * client names, §8.3 subscription gate) — the CLIENT's name (any alphabet,
 * typos: «Эмили» = Emily) or @username prefix.
 */
export async function workWordHits(
  prisma: PrismaService,
  q: string | undefined,
  attorneyId: string,
  withClient: boolean,
): Promise<Map<string, string[]>> {
  // Keyed by the typed word (with its @), like [mineCaseWhere] looks it up.
  const words = [
    ...new Set((q ?? '').split(/\s+/).filter((w) => w.length > 0)),
  ].slice(0, 6);
  const out = new Map<string, string[]>();
  for (const typed of words) {
    const w = typed.replace(/^@+/, '');
    if (!w) continue;
    const like = Prisma.sql`'%' || public.f_unaccent(${escapeLike(w.toLowerCase().replace(/ё/g, 'е'))}) || '%'`;
    const client = withClient
      ? Prisma.sql`OR ${nameMatchSql(await nameKeys(prisma, w), 'u')}
          OR coalesce(cp.username_lower, '') LIKE ${`${escapeLike(w.toLowerCase())}%`}`
      : Prisma.empty;
    if (readsAreSplit(prisma)) {
      out.set(
        typed,
        await workHitsSplit(prisma, attorneyId, w, like, withClient),
      );
      continue;
    }
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id::TEXT AS id
      FROM bids b
      JOIN cases c ON c.accepted_bid_id = b.id
      JOIN users u ON u.id = c.client_id
      LEFT JOIN client_profiles cp ON cp.user_id = u.id
      WHERE b.attorney_id = ${attorneyId}::UUID AND b.status = 'accepted'
        AND (public.f_unaccent(replace(lower(c.title), 'ё', 'е')) LIKE ${like}
             OR public.f_unaccent(replace(lower(c.description), 'ё', 'е')) LIKE ${like}
             ${client})
      LIMIT 5000`;
    out.set(
      typed,
      rows.map((r) => r.id),
    );
  }
  return out;
}

/** Two databases (SHARDING_READY step 8): the same hits — the attorney's
 * accepted cases (bids + cases, case family) on every database, the client's
 * name / @username (global) on the primary. */
async function workHitsSplit(
  prisma: PrismaService,
  attorneyId: string,
  w: string,
  like: Prisma.Sql,
  withClient: boolean,
): Promise<string[]> {
  const cases = (
    await forEachDatabase(
      prisma,
      () =>
        prisma.$queryRaw<{ id: string; client: string; by_text: boolean }[]>`
        SELECT c.id::TEXT AS id, c.client_id::TEXT AS client,
               (public.f_unaccent(replace(lower(c.title), 'ё', 'е')) LIKE ${like}
                OR public.f_unaccent(replace(lower(c.description), 'ё', 'е')) LIKE ${like}) AS by_text
        FROM bids b
        JOIN cases c ON c.accepted_bid_id = b.id
        WHERE b.attorney_id = ${attorneyId}::UUID AND b.status = 'accepted'`,
    )
  ).flat();
  let byName = new Set<string>();
  if (withClient && cases.length > 0) {
    const keys = await nameKeys(prisma, w);
    const clients = [...new Set(cases.map((c) => c.client))];
    byName = new Set(
      (
        await shardContext.runOnPrimary(
          () => prisma.$queryRaw<{ id: string }[]>`
            SELECT u.id::TEXT AS id FROM users u
            LEFT JOIN client_profiles cp ON cp.user_id = u.id
            WHERE u.id = ANY(${clients}::UUID[])
              AND (${nameMatchSql(keys, 'u')}
                   OR coalesce(cp.username_lower, '') LIKE ${`${escapeLike(w.toLowerCase())}%`})`,
        )
      ).map((r) => r.id),
    );
  }
  return cases
    .filter((c) => c.by_text || byName.has(c.client))
    .slice(0, 5000)
    .map((c) => c.id);
}

/** [mineCaseWhere] with the topic names resolved. */
export async function mineWhere(
  prisma: PrismaService,
  f: MineFilterFields,
  work?: { attorneyId: string; withClient: boolean },
): Promise<Prisma.CaseWhereInput> {
  return mineCaseWhere(
    f,
    await topicIdsByWord(prisma, f.q),
    work
      ? await workWordHits(prisma, f.q, work.attorneyId, work.withClient)
      : undefined,
  );
}
