import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { forEachDatabase } from '../../../sharding/for-each-database';
import { HIDDEN_TAG_PREFIX } from '../../posts/hidden-tags';
import type { SearchEntity } from './search-engine.mappings';

export type SearchDoc = Record<string, unknown>;

/** Text kept per document: enough to find it, bounded for the index size. */
const TEXT_CAP = 20_000;

/** The table a full reindex walks, and the id column (keyset by id). */
export const REINDEX_SOURCE: Record<
  SearchEntity,
  { table: string; where: string }
> = {
  person: { table: 'users', where: `role IN ('attorney', 'client')` },
  case: { table: 'cases', where: 'TRUE' },
  post: { table: 'posts', where: 'TRUE' },
  question: { table: 'legal_questions', where: 'TRUE' },
  tag: { table: 'tags', where: 'TRUE' },
};

/**
 * Builds the search documents from the CURRENT database rows. The outbox
 * only says "this entity changed", so replaying an event any number of
 * times, in any order, gives the same index (idempotent). A row that is not
 * searchable any more (deleted, closed, suspended, hidden) yields no
 * document and is removed from the engine.
 */
@Injectable()
export class SearchDocsLoader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * id → document, only for ids that are searchable right now. Rows live on
   * the physical database of their shard, so every database is asked (one
   * database: one plain call, as before) and the answers are merged.
   */
  async load(
    entity: SearchEntity,
    ids: string[],
  ): Promise<Map<string, SearchDoc>> {
    if (ids.length === 0) return new Map();
    const parts = await forEachDatabase(this.prisma, () =>
      this.loadHere(entity, ids),
    );
    if (parts.length === 1) return parts[0];
    const out = new Map<string, SearchDoc>();
    for (const part of parts) {
      for (const [id, doc] of part) if (!out.has(id)) out.set(id, doc);
    }
    return out;
  }

  private loadHere(
    entity: SearchEntity,
    ids: string[],
  ): Promise<Map<string, SearchDoc>> {
    switch (entity) {
      case 'person':
        return this.people(ids);
      case 'case':
        return this.cases(ids);
      case 'post':
        return this.posts(ids);
      case 'question':
        return this.questions(ids);
      case 'tag':
        return this.tags(ids);
    }
  }

  /**
   * The next [limit] ids after [after] (uuid order) for a reindex walk. One
   * global keyset over all physical databases: each returns its next
   * [limit] ids, the union is sorted and cut, so the checkpoint stays a
   * plain id (one database: identical to a single query).
   */
  async idsAfter(
    entity: SearchEntity,
    after: string | null,
    limit: number,
  ): Promise<string[]> {
    const parts = await forEachDatabase(this.prisma, () =>
      this.idsAfterHere(entity, after, limit),
    );
    if (parts.length === 1) return parts[0];
    const all = [...new Set(parts.flat())].sort();
    return all.slice(0, Math.max(1, Math.floor(limit)));
  }

  private async idsAfterHere(
    entity: SearchEntity,
    after: string | null,
    limit: number,
  ): Promise<string[]> {
    const src = REINDEX_SOURCE[entity];
    // Table and condition come from the constant above, never from input.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::TEXT AS id FROM ${Prisma.raw(src.table)}
       WHERE ${Prisma.raw(src.where)}
         AND (${after}::UUID IS NULL OR id > ${after}::UUID)
       ORDER BY id LIMIT ${Math.max(1, Math.floor(limit))}`,
    );
    return rows.map((r) => r.id);
  }

  /** [limit] random ids of the rows a reindex walks (verification sample). */
  async sampleIds(entity: SearchEntity, limit: number): Promise<string[]> {
    const parts = await forEachDatabase(this.prisma, () =>
      this.sampleIdsHere(entity, limit),
    );
    if (parts.length === 1) return parts[0];
    return [...new Set(parts.flat())].slice(0, Math.max(1, Math.floor(limit)));
  }

  private async sampleIdsHere(
    entity: SearchEntity,
    limit: number,
  ): Promise<string[]> {
    const src = REINDEX_SOURCE[entity];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::TEXT AS id FROM ${Prisma.raw(src.table)}
       WHERE ${Prisma.raw(src.where)}
       ORDER BY random() LIMIT ${Math.max(1, Math.floor(limit))}`,
    );
    return rows.map((r) => r.id);
  }

  private async people(ids: string[]): Promise<Map<string, SearchDoc>> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        role: string;
        a_uname: string | null;
        c_uname: string | null;
        fname: string | null;
        skel: string | null;
        cons: string | null;
        verified: boolean | null;
        rating: number | null;
        languages: string[] | null;
        client_state: string | null;
        practice_ids: string[] | null;
        practice_ids_all: string[] | null;
        practice_names: string[] | null;
        states: string[] | null;
        state_names: string[] | null;
      }[]
    >`
      SELECT u.id::TEXT AS id, u.role::TEXT AS role,
             a.username_lower AS a_uname, c.username_lower AS c_uname,
             u.full_name_lower AS fname,
             -- Stored keys (trigger, load test 2026-10-28); same values.
             COALESCE(u.name_skel, public.f_name_skel(u.full_name_lower)) AS skel,
             COALESCE(u.name_cons, public.f_name_cons(u.full_name_lower)) AS cons,
             (a.verification_status = 'verified') AS verified,
             a.rating_avg::FLOAT8 AS rating, a.languages,
             c.state_code AS client_state,
             (SELECT array_agg(ap.practice_area_id::TEXT)
                FROM attorney_practice_areas ap
               WHERE ap.attorney_id = u.id) AS practice_ids,
             (SELECT array_agg(DISTINCT x.id) FROM (
                SELECT ap.practice_area_id::TEXT AS id
                  FROM attorney_practice_areas ap WHERE ap.attorney_id = u.id
                UNION
                SELECT pa.parent_id::TEXT FROM attorney_practice_areas ap
                  JOIN practice_areas pa ON pa.id = ap.practice_area_id
                 WHERE ap.attorney_id = u.id AND pa.parent_id IS NOT NULL
              ) x) AS practice_ids_all,
             (SELECT array_agg(DISTINCT lower(pa.name_en))
                FROM attorney_practice_areas ap
                JOIN practice_areas pa ON pa.id = ap.practice_area_id
               WHERE ap.attorney_id = u.id) AS practice_names,
             (SELECT array_agg(DISTINCT l.state_code::TEXT)
                FROM attorney_licenses l
               WHERE l.attorney_id = u.id AND l.license_status = 'verified') AS states,
             (SELECT array_agg(DISTINCT lower(s.name))
                FROM attorney_licenses l JOIN states s ON s.code = l.state_code
               WHERE l.attorney_id = u.id AND l.license_status = 'verified') AS state_names
      FROM users u
      LEFT JOIN attorney_profiles a ON a.user_id = u.id
      LEFT JOIN client_profiles c ON c.user_id = u.id
      WHERE u.id = ANY(${ids}::UUID[])
        AND u.status = 'active' AND u.deleted_at IS NULL
        AND ((u.role = 'attorney' AND a.user_id IS NOT NULL
              AND a.verification_status <> 'suspended')
          OR (u.role = 'client' AND c.username_lower IS NOT NULL))`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          role: r.role,
          username: r.role === 'attorney' ? r.a_uname : r.c_uname,
          full_name: r.fname,
          name_skel: r.skel,
          name_cons: r.cons,
          verified: r.verified ?? false,
          rating: r.rating ?? 0,
          languages: r.languages ?? [],
          client_state: r.client_state,
          practice_ids: r.practice_ids ?? [],
          practice_ids_all: r.practice_ids_all ?? [],
          practice_names: r.practice_names ?? [],
          states: r.states ?? [],
          state_names: r.state_names ?? [],
        },
      ]),
    );
  }

  private async cases(ids: string[]): Promise<Map<string, SearchDoc>> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        description: string;
        state: string;
        states: string[] | null;
        state_name: string | null;
        city: string | null;
        practice_ids: string[] | null;
        created_at: Date;
      }[]
    >`
      SELECT c.id::TEXT AS id, c.title, left(c.description, ${TEXT_CAP}::INT) AS description,
             c.primary_state_code::TEXT AS state,
             (SELECT array_agg(cs.state_code::TEXT) FROM case_states cs
               WHERE cs.case_id = c.id) AS states,
             lower(s.name) AS state_name, lower(c.city) AS city,
             (SELECT array_agg(DISTINCT x) FROM unnest(ARRAY[
                c.practice_area_id::TEXT, c.inferred_practice_id::TEXT]) x
               WHERE x IS NOT NULL) AS practice_ids,
             c.created_at
      FROM cases c LEFT JOIN states s ON s.code = c.primary_state_code
      WHERE c.id = ANY(${ids}::UUID[])
        AND c.status = 'open' AND c.deleted_at IS NULL`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          title: r.title,
          description: r.description,
          state: r.state,
          states: r.states ?? [r.state],
          state_name: r.state_name,
          city: r.city,
          practice_ids: r.practice_ids ?? [],
          created_at: r.created_at.toISOString(),
        },
      ]),
    );
  }

  private async posts(ids: string[]): Promise<Map<string, SearchDoc>> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string | null;
        body: string;
        kind: string;
        content_class: string;
        tags: string[] | null;
        created_at: Date;
      }[]
    >`
      SELECT p.id::TEXT AS id, p.title, left(p.body, ${TEXT_CAP}::INT) AS body,
             p.kind::TEXT AS kind, p.content_class,
             (SELECT array_agg(t.tag_lower) FROM post_tags pt
                JOIN tags t ON t.id = pt.tag_id
               WHERE pt.post_id = p.id) AS tags,
             p.created_at
      FROM posts p
      WHERE p.id = ANY(${ids}::UUID[])
        AND p.status = 'published' AND p.deleted_at IS NULL
        AND p.archived_at IS NULL`;
    return new Map(
      rows.map((r) => {
        const tags = r.tags ?? [];
        return [
          r.id,
          {
            title: r.title,
            body: r.body,
            kind: r.kind,
            content_class: r.content_class,
            // Hidden topic tags (~…) hold the post's qualification code.
            tags: tags.filter((t) => !t.startsWith(HIDDEN_TAG_PREFIX)),
            practice_ids: [],
            created_at: r.created_at.toISOString(),
          },
        ];
      }),
    );
  }

  private async questions(ids: string[]): Promise<Map<string, SearchDoc>> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        body: string;
        answers: string | null;
        practice_ids: string[] | null;
        created_at: Date;
      }[]
    >`
      SELECT q.id::TEXT AS id, q.title, q.body,
             (SELECT left(string_agg(a.body, ' '), ${TEXT_CAP}::INT)
                FROM legal_answers a
               WHERE a.question_id = q.id AND a.status = 'published'
                 AND a.deleted_at IS NULL) AS answers,
             CASE WHEN q.practice_area_id IS NULL THEN NULL
                  ELSE ARRAY[q.practice_area_id::TEXT] END AS practice_ids,
             q.created_at
      FROM legal_questions q
      WHERE q.id = ANY(${ids}::UUID[])
        AND q.status = 'published' AND q.deleted_at IS NULL`;
    return new Map(
      rows.map((r) => [
        r.id,
        {
          title: r.title,
          body: r.body,
          answers: r.answers,
          practice_ids: r.practice_ids ?? [],
          created_at: r.created_at.toISOString(),
        },
      ]),
    );
  }

  private async tags(ids: string[]): Promise<Map<string, SearchDoc>> {
    const rows = await this.prisma.$queryRaw<{ id: string; tag: string }[]>`
      SELECT id::TEXT AS id, tag_lower AS tag FROM tags
      WHERE id = ANY(${ids}::UUID[]) AND tag_lower NOT LIKE ${`${HIDDEN_TAG_PREFIX}%`}`;
    return new Map(rows.map((r) => [r.id, { tag: r.tag }]));
  }
}
