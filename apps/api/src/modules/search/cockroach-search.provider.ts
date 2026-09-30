import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildVisibleCasesSql } from '../cases/queries/cases-visible.sql';
import type {
  AttorneySearchFilters,
  PostSearchFilters,
  CaseSearchParams,
  PersonRole,
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
    const rows = await this.people(q, f, max, false);
    return rows.map((r) => r.id);
  }

  searchPeople(
    q: string,
    f: AttorneySearchFilters,
    max: number,
  ): Promise<{ id: string; role: PersonRole }[]> {
    // Attorney-only filters leave clients out; state also fits clients.
    const attorneyOnly =
      f.practiceAreaId !== undefined ||
      f.minRating !== undefined ||
      f.language !== undefined ||
      f.role === 'attorney';
    return this.people(q, f, max, !attorneyOnly);
  }

  /**
   * Attorneys (docs/05 §7.3 branches: @username, name, practice name,
   * state) and — OQ-026, when [withClients] — clients (@username, name),
   * ranked together: exact handle, handle prefix, trigram similarity,
   * attorneys before clients, verified first, rating.
   */
  private async people(
    q: string,
    f: AttorneySearchFilters,
    max: number,
    withClients: boolean,
  ): Promise<{ id: string; role: PersonRole }[]> {
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
      ${f.language ? Prisma.sql`AND a.languages @> ARRAY[${f.language}]::STRING[]` : Prisma.empty}
      ${f.verifiedOnly ? Prisma.sql`AND a.verification_status = 'verified'` : Prisma.empty}
      ${f.role === 'client' ? Prisma.sql`AND FALSE` : Prisma.empty}`;
    // Clients: state of residence; the check mark = verified phone (OQ-029).
    const clientFilters = Prisma.sql`
      ${f.state ? Prisma.sql`AND c.state_code = ${f.state}` : Prisma.empty}
      ${f.verifiedOnly ? Prisma.sql`AND u.phone_verified_at IS NOT NULL` : Prisma.empty}`;
    const clients = withClients
      ? Prisma.sql`
        UNION ALL
        SELECT u.id, 'client' AS role, c.username_lower AS uname,
               u.full_name_lower AS fname, FALSE AS verified,
               0::DECIMAL AS rating
        FROM (
          (SELECT user_id FROM client_profiles
            WHERE username_lower IS NOT NULL
              AND (username_lower LIKE ${prefix} OR username_lower % ${q})
            LIMIT ${BRANCH_CAP})
          UNION
          (SELECT id AS user_id FROM users
            WHERE full_name_lower IS NOT NULL AND role = 'client'
              AND (full_name_lower % ${q} OR full_name_lower LIKE ${contains})
            LIMIT ${BRANCH_CAP})
        ) cc
        JOIN users u ON u.id = cc.user_id AND u.role = 'client'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN client_profiles c ON c.user_id = u.id
          AND c.username_lower IS NOT NULL
        WHERE TRUE ${clientFilters}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { id: string; role: PersonRole }[]
    >`
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
      ),
      people AS (
        SELECT u.id, 'attorney' AS role, a.username_lower AS uname,
               u.full_name_lower AS fname,
               (a.verification_status = 'verified') AS verified,
               a.rating_avg AS rating
        FROM cand
        JOIN users u ON u.id = cand.id AND u.role = 'attorney'
          AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN attorney_profiles a ON a.user_id = u.id
          AND a.verification_status <> 'suspended'
        WHERE TRUE ${filters}
        ${clients}
      )
      SELECT id::STRING AS id, role
      FROM people
      ORDER BY
        (uname = ${q}) DESC,
        (uname LIKE ${prefix}) DESC,
        GREATEST(similarity(uname, ${q}),
                 similarity(COALESCE(fname, ''), ${q})) DESC,
        (role = 'attorney') DESC,
        verified DESC,
        rating DESC,
        id
      LIMIT ${max}`;
    return rows;
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
        practiceCategory: p.practiceCategory,
        extra: Prisma.sql`
          ${p.budgetMinCents !== undefined ? Prisma.sql`AND c.budget_cents >= ${p.budgetMinCents}` : Prisma.empty}
          ${p.budgetMaxCents !== undefined ? Prisma.sql`AND c.budget_cents <= ${p.budgetMaxCents}` : Prisma.empty}
          ${p.budgetUnknown ? Prisma.sql`AND c.budget_mode = 'clarify_later'` : Prisma.empty}
          ${p.noBids ? Prisma.sql`AND c.bids_count = 0` : Prisma.empty}`,
      }),
    );
  }

  async searchPosts(
    q: string,
    max: number,
    f: PostSearchFilters = {},
  ): Promise<string[]> {
    const where = Prisma.sql`
      ${f.tag ? Prisma.sql`AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.tag_lower = ${f.tag})` : Prisma.empty}
      ${f.state ? Prisma.sql`AND EXISTS (SELECT 1 FROM attorney_licenses l WHERE l.attorney_id = p.author_id AND l.state_code = ${f.state} AND l.license_status = 'verified')` : Prisma.empty}
      ${f.since ? Prisma.sql`AND p.created_at >= ${f.since}` : Prisma.empty}
      ${f.withPhotos ? Prisma.sql`AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id)` : Prisma.empty}`;
    const order =
      f.sort === 'newest'
        ? Prisma.sql`m.created_at DESC, m.id DESC`
        : f.sort === 'popular'
          ? Prisma.sql`p.like_count + p.comment_count DESC, m.created_at DESC, m.id DESC`
          : Prisma.sql`ts_rank(m.search_tsv, plainto_tsquery('english', ${q})) DESC,
               m.created_at DESC, m.id DESC`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH m AS (
        SELECT p.id, p.created_at, p.search_tsv FROM posts p
        WHERE p.search_tsv @@ plainto_tsquery('english', ${q})
          AND p.status = 'published' AND p.deleted_at IS NULL
          ${where}
        ORDER BY p.created_at DESC
        LIMIT ${POST_CANDIDATES}
      )
      SELECT m.id::STRING AS id FROM m
      JOIN posts p ON p.id = m.id
      JOIN users u ON u.id = p.author_id AND u.status = 'active'
        -- OQ-038: clients post too; suspended attorneys never show.
        AND NOT EXISTS (SELECT 1 FROM attorney_profiles sa
          WHERE sa.user_id = p.author_id AND sa.verification_status = 'suspended')
      ORDER BY ${order}
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
