import { ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

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
}

export function hasMineFilter(f: MineFilterFields): boolean {
  return !!(f.q || f.practice || f.state);
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
): Prisma.CaseWhereInput {
  const words = (f.q ?? '').split(/\s+/).filter((w) => w.length > 0);
  return {
    ...(words.length
      ? {
          AND: words.map((w) => {
            const ids = topicIds.get(w) ?? [];
            const ci = { contains: w, mode: 'insensitive' as const };
            return {
              OR: [
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

/** [mineCaseWhere] with the topic names resolved. */
export async function mineWhere(
  prisma: PrismaService,
  f: MineFilterFields,
): Promise<Prisma.CaseWhereInput> {
  return mineCaseWhere(f, await topicIdsByWord(prisma, f.q));
}
