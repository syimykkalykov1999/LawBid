import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildVisibleCasesSql } from '../cases/queries/cases-visible.sql';
import type {
  AttorneySearchFilters,
  CaseSearchParams,
  SearchProvider,
} from './search.provider';

/** Candidates per match branch: keeps a broad query ("new york") bounded
 * before ranking; an external engine lifts this later (§7.6). */
const BRANCH_CAP = 1000;
/** Posts: rank among the newest matches only. */
const POST_CANDIDATES = 1000;

/** LIKE pattern text with %, _ and \ taken literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * docs/05 §7.6 CockroachSearchProvider on the docs/02 §5.3 indexes:
 * trigram GIN on attorney_profiles.username_lower and
 * users.full_name_lower (partial, IS NOT NULL), tsvector GIN on
 * posts/cases.search_tsv, btree tags_tag_lower_key for tag prefixes.
 */
@Injectable()
export class CockroachSearchProvider implements SearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async searchAttorneys(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<string[]> {
    const prefix = `${escapeLike(q)}%`;
    const contains = `%${escapeLike(q)}%`;
    const filters = Prisma.sql`
      ${
        f.practiceAreaId
          ? Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_practice_areas x
              WHERE x.attorney_id = a.user_id
                AND x.practice_area_id = ${f.practiceAreaId}::UUID)`
          : Prisma.empty
      }
      ${
        f.state
          ? Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_licenses x
              WHERE x.attorney_id = a.user_id AND x.state_code = ${f.state}
                AND x.license_status = 'verified')`
          : Prisma.empty
      }
      ${f.minRating !== undefined ? Prisma.sql`AND a.rating_avg >= ${f.minRating}` : Prisma.empty}
      ${f.language ? Prisma.sql`AND a.languages @> ARRAY[${f.language}]::STRING[]` : Prisma.empty}`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH cand AS (
        (SELECT user_id AS id FROM attorney_profiles
          WHERE username_lower IS NOT NULL
            AND (username_lower LIKE ${prefix} OR username_lower % ${q})
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT id FROM users
          WHERE full_name_lower IS NOT NULL AND role = 'attorney'
            AND (full_name_lower % ${q} OR full_name_lower LIKE ${contains})
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT ap.attorney_id FROM practice_areas pa
          JOIN attorney_practice_areas ap ON ap.practice_area_id = pa.id
          WHERE lower(pa.name_en) LIKE ${contains}
          LIMIT ${BRANCH_CAP})
        UNION
        (SELECT l.attorney_id FROM states s
          JOIN attorney_licenses l ON l.state_code = s.code
            AND l.license_status = 'verified'
          WHERE lower(s.name) LIKE ${prefix} OR lower(s.code) = ${q}
          LIMIT ${BRANCH_CAP})
      )
      SELECT u.id::STRING AS id
      FROM cand
      JOIN users u ON u.id = cand.id AND u.role = 'attorney'
        AND u.status = 'active' AND u.deleted_at IS NULL
      JOIN attorney_profiles a ON a.user_id = u.id
        AND a.verification_status <> 'suspended'
      WHERE TRUE ${filters}
      ORDER BY
        (a.username_lower = ${q}) DESC,
        (a.username_lower LIKE ${prefix}) DESC,
        GREATEST(similarity(a.username_lower, ${q}),
                 similarity(COALESCE(u.full_name_lower, ''), ${q})) DESC,
        (a.verification_status = 'verified') DESC,
        a.rating_avg DESC,
        u.id
      LIMIT ${max}`;
    return rows.map((r) => r.id);
  }

  searchCases(
    q: string,
    p: CaseSearchParams,
  ): Promise<{ id: string; created_at: Date }[]> {
    return this.prisma.$queryRaw<{ id: string; created_at: Date }[]>(
      buildVisibleCasesSql({
        attorneyId: p.attorneyId,
        practiceAreaId: p.practiceAreaId,
        state: p.state,
        cursor: p.cursor,
        limit: p.limit + 1,
        text: q,
        since: p.since,
      }),
    );
  }

  async searchPosts(q: string, max: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH m AS (
        SELECT p.id, p.created_at, p.search_tsv FROM posts p
        WHERE p.search_tsv @@ plainto_tsquery('english', ${q})
          AND p.status = 'published' AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT ${POST_CANDIDATES}
      )
      SELECT m.id::STRING AS id FROM m
      JOIN posts p ON p.id = m.id
      JOIN users u ON u.id = p.author_id AND u.status = 'active'
      JOIN attorney_profiles a ON a.user_id = p.author_id
        AND a.verification_status <> 'suspended'
      ORDER BY ts_rank(m.search_tsv, plainto_tsquery('english', ${q})) DESC,
               m.created_at DESC, m.id DESC
      LIMIT ${max}`;
    return rows.map((r) => r.id);
  }

  async searchTags(prefix: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.tag.findMany({
      where: { tag_lower: { startsWith: prefix } },
      orderBy: { tag_lower: 'asc' },
      take: limit,
      select: { tag_lower: true },
    });
    return rows.map((r) => r.tag_lower);
  }
}
