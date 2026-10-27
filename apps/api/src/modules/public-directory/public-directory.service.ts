import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../common/secrets/secrets.service';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaReadService } from '../../prisma/prisma-read.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../files/files.public';
import type { PublicAttorneyDto } from './public-directory.dto';
import type { SeoPostRow, SeoQuestionRow } from './seo-lib';

/** Keyset position (newest first) of the posts and questions read for the static pages. */
interface TimeCursor {
  t: string;
  i: string;
}

function encodeTimeCursor(c: TimeCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeTimeCursor(raw: string): TimeCursor | null {
  try {
    const o = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<TimeCursor> | null;
    if (
      o &&
      typeof o.t === 'string' &&
      !Number.isNaN(new Date(o.t).getTime()) &&
      typeof o.i === 'string' &&
      /^[0-9a-f-]{36}$/i.test(o.i)
    ) {
      return { t: o.t, i: o.i };
    }
  } catch {
    // an invalid cursor starts from the beginning
  }
  return null;
}

/** A verified attorney with an active account: the same rule as the directory. */
const LISTED_ATTORNEY = {
  status: 'active',
  deleted_at: null,
  attorney_profile: { is: { verification_status: 'verified' } },
} satisfies Prisma.UserWhereInput;

/**
 * The answer rules of a public Q&A page (plan §2.1, "reviewed answers
 * only"). The schema has no editor-review state, so "reviewed" means: the
 * asker marked it as the best answer, it is published and not deleted, the
 * private-info / individualized-advice / state-not-licensed screening left it
 * unflagged, and a listed attorney wrote it.
 */
const REVIEWED_ANSWER = {
  is_best: true,
  status: 'published',
  deleted_at: null,
  safety_flags: { isEmpty: true },
  attorney: LISTED_ATTORNEY,
} satisfies Prisma.LegalAnswerWhereInput;

/**
 * Keyset position of the directory sort (trust_level DESC, rating_avg DESC,
 * username_lower ASC), carried as an opaque base64url string.
 */
interface DirectoryCursor {
  t: number;
  r: string;
  u: string;
}

export function encodeDirectoryCursor(c: DirectoryCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeDirectoryCursor(raw: string): DirectoryCursor | null {
  try {
    const o = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<DirectoryCursor> | null;
    if (
      o &&
      typeof o.t === 'number' &&
      Number.isInteger(o.t) &&
      typeof o.r === 'string' &&
      /^-?\d+(\.\d+)?$/.test(o.r) &&
      typeof o.u === 'string' &&
      o.u.length > 0
    ) {
      return { t: o.t, r: o.r, u: o.u };
    }
  } catch {
    // not a composite cursor: a plain username from an older page
  }
  return null;
}

export interface PublicAttorneysPage {
  items: PublicAttorneyDto[];
  nextCursor: string | null;
}

/**
 * Owner 2026-10-15 (web, SEO): the public part of attorney profiles that
 * search-engine landing pages are built from. Only attorneys who passed
 * verification, with an active account. Nothing about clients, cases or
 * contacts ever comes out of here.
 */
@Injectable()
export class PublicDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    // Owner 2026-10-22 (audit #4 §9): the photo of the SEO page (og:image)
    // needs the media CDN — a signed link would expire inside a static page.
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
    // Owner 2026-10-24: avatars stored in R2 have their own public domain.
    @Optional() private readonly storage?: S3StorageService,
    // DB-ops S5-6: a CDN-cached public list tolerates replica lag.
    @Optional() private readonly read?: PrismaReadService,
  ) {}

  private get db(): PrismaService {
    return this.read?.db ?? this.prisma;
  }

  private async cdnBase(): Promise<string | null> {
    const cdn =
      (await this.secrets?.field('storage', 'cdnBaseUrl')) ??
      this.config?.get<string>('MEDIA_CDN_BASE_URL');
    return cdn ? cdn.replace(/\/+$/, '') : null;
  }

  async attorneys(q: {
    state?: string;
    practice?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PublicAttorneysPage> {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
    // Keyset on the full sort key. A plain username (cursor of an older
    // page) is resolved to its sort key once, so such a link keeps working.
    let pos: DirectoryCursor | null = null;
    if (q.cursor) {
      pos = decodeDirectoryCursor(q.cursor);
      if (!pos) {
        const at = await this.prisma.attorneyProfile.findUnique({
          where: { username_lower: q.cursor.toLowerCase() },
          select: { trust_level: true, rating_avg: true, username_lower: true },
        });
        if (at) {
          pos = {
            t: at.trust_level,
            r: at.rating_avg.toString(),
            u: at.username_lower,
          };
        }
      }
    }
    const where: Prisma.AttorneyProfileWhereInput = {
      verification_status: 'verified',
      ...(pos
        ? {
            OR: [
              { trust_level: { lt: pos.t } },
              { trust_level: pos.t, rating_avg: { lt: pos.r } },
              {
                trust_level: pos.t,
                rating_avg: pos.r,
                username_lower: { gt: pos.u },
              },
            ],
          }
        : {}),
      user: { status: 'active', deleted_at: null },
      ...(q.state
        ? {
            licenses: {
              some: {
                state_code: q.state.toUpperCase(),
                license_status: 'verified',
              },
            },
          }
        : {}),
      ...(q.practice
        ? {
            practice_areas: {
              some: {
                practice_area: {
                  is_active: true,
                  OR: [
                    { code: q.practice },
                    { parent: { is: { code: q.practice } } },
                  ],
                },
              },
            },
          }
        : {}),
    };
    const rows = await this.db.attorneyProfile.findMany({
      where,
      orderBy: [
        { trust_level: 'desc' },
        { rating_avg: 'desc' },
        { username_lower: 'asc' },
      ],
      take: limit + 1,
      select: {
        trust_level: true,
        username: true,
        username_lower: true,
        bio: true,
        firm_names: true,
        languages: true,
        rating_avg: true,
        rating_count: true,
        trust_badge: true,
        updated_at: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            privacy_settings: { select: { photo_from: true } },
          },
        },
        practice_areas: {
          where: { practice_area: { is_active: true } },
          select: { practice_area: { select: { code: true, name_en: true } } },
        },
        licenses: {
          where: { license_status: 'verified' },
          select: { state_code: true },
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next =
      rows.length > limit && last
        ? encodeDirectoryCursor({
            t: last.trust_level,
            r: last.rating_avg.toString(),
            u: last.username_lower,
          })
        : null;
    // Owner 2026-10-22 (audit #4 §9): a stable public photo for og:image —
    // a clean avatar of someone who shows it to everyone, on a public CDN
    // link (R2 domain for R2 objects, the media CDN for AWS ones).
    const cdn = await this.cdnBase();
    await this.storage?.ready();
    const avatarIds =
      cdn || this.storage
        ? page
            .filter(
              (r) =>
                (r.user.privacy_settings?.photo_from ?? 'everyone') ===
                'everyone',
            )
            .map((r) => r.user.avatar_file_id)
            .filter((x): x is string => !!x)
        : [];
    const photos = new Map<string, string>();
    if (avatarIds.length) {
      const files = await this.db.file.findMany({
        where: {
          id: { in: avatarIds },
          purpose: 'avatar',
          scan_status: 'clean',
          deleted_at: null,
        },
        select: { id: true, s3_key: true, s3_bucket: true },
      });
      for (const f of files) {
        const url =
          this.storage?.publicObjectUrl(f.s3_bucket, f.s3_key) ??
          (cdn ? `${cdn}/${f.s3_key}` : null);
        if (url) photos.set(f.id, url);
      }
    }
    return {
      items: page.map((r) => ({
        username: r.username,
        displayName: [r.user.first_name, r.user.last_name]
          .filter((s): s is string => !!s)
          .join(' '),
        bio: r.bio,
        firmNames: r.firm_names,
        languages: r.languages,
        ratingAvg: Number(r.rating_avg),
        ratingCount: r.rating_count,
        trustBadge: r.trust_badge,
        updatedAt: r.updated_at.toISOString(),
        photoUrl: r.user.avatar_file_id
          ? (photos.get(r.user.avatar_file_id) ?? null)
          : null,
        practiceAreas: r.practice_areas.map((p) => ({
          code: p.practice_area.code,
          name: p.practice_area.name_en,
        })),
        licensedStates: [
          ...new Set(r.licenses.map((l) => l.state_code)),
        ].sort(),
      })),
      nextCursor: next,
    };
  }

  /**
   * Text posts for the static pages (/attorneys/<username>/posts/<slug>/),
   * newest first, `limit` (<= 100) per read. Visibility rules, all from the
   * existing state: published, not deleted or archived, no video, no image
   * or file attached, a law-topic post (content_class 'legal'), and a listed
   * attorney as the author. The schema has no per-post "show in search
   * engines" consent yet (plan §6 asks for one); until it exists the author's
   * public profile is the consent.
   */
  async seoPosts(q: {
    limit?: number;
    cursor?: string;
  }): Promise<{ items: SeoPostRow[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(q.limit ?? 100, 1), 100);
    const pos = q.cursor ? decodeTimeCursor(q.cursor) : null;
    const rows = await this.db.post.findMany({
      where: {
        status: 'published',
        deleted_at: null,
        archived_at: null,
        video_asset_id: null,
        content_class: 'legal',
        media: { none: {} },
        attachments: { none: {} },
        author: LISTED_ATTORNEY,
        ...(pos
          ? {
              OR: [
                { created_at: { lt: new Date(pos.t) } },
                { created_at: new Date(pos.t), id: { lt: pos.i } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
        language: true,
        created_at: true,
        updated_at: true,
        edited_at: true,
        author_id: true,
        practice_area_id: true,
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    // The author's username and the practice code come from their own
    // reads (one statement each per page), not from a join into other
    // table families (sharding guard: cross-family-include.allowlist.json).
    const [usernames, codes] = await Promise.all([
      this.usernamesOf(page.map((r) => r.author_id)),
      this.practiceCodes(page.map((r) => r.practice_area_id)),
    ]);
    const items: SeoPostRow[] = [];
    for (const r of page) {
      const username = usernames.get(r.author_id);
      if (!username) continue;
      items.push({
        id: r.id,
        authorUsername: username,
        title: r.title,
        body: r.body,
        kind: r.kind,
        practiceCode: r.practice_area_id
          ? (codes.get(r.practice_area_id) ?? null)
          : null,
        language: r.language,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        editedAt: r.edited_at ? r.edited_at.toISOString() : null,
      });
    }
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeTimeCursor({ t: last.created_at.toISOString(), i: last.id })
          : null,
    };
  }

  /**
   * Public legal questions with reviewed answers for /legal-questions/<slug>/,
   * newest first, `limit` (<= 100) per read. A question qualifies when it is
   * published and not deleted, its private-info screening left no flag, and at
   * least one answer passes the rules in REVIEWED_ANSWER; when the question
   * names a state the answering attorney must also hold a verified license
   * there. The asker's identity is never selected.
   */
  async seoQuestions(q: {
    limit?: number;
    cursor?: string;
  }): Promise<{ items: SeoQuestionRow[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(q.limit ?? 100, 1), 100);
    const pos = q.cursor ? decodeTimeCursor(q.cursor) : null;
    const rows = await this.db.legalQuestion.findMany({
      where: {
        status: 'published',
        deleted_at: null,
        safety_flags: { isEmpty: true },
        answers: { some: REVIEWED_ANSWER },
        ...(pos
          ? {
              OR: [
                { created_at: { lt: new Date(pos.t) } },
                { created_at: new Date(pos.t), id: { lt: pos.i } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        title: true,
        body: true,
        state_code: true,
        practice_area_id: true,
        created_at: true,
        updated_at: true,
        answers: {
          where: REVIEWED_ANSWER,
          select: {
            id: true,
            body: true,
            attorney_id: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const [usernames, codes, licenses] = await Promise.all([
      this.usernamesOf(
        page.flatMap((r) => r.answers.map((a) => a.attorney_id)),
      ),
      this.practiceCodes(page.map((r) => r.practice_area_id)),
      this.licensedStatesOf(
        page.flatMap((r) => r.answers.map((a) => a.attorney_id)),
      ),
    ]);
    const items: SeoQuestionRow[] = [];
    for (const r of page) {
      const answers: SeoQuestionRow['answers'] = [];
      for (const a of r.answers) {
        const username = usernames.get(a.attorney_id);
        if (!username) continue;
        if (r.state_code && !licenses.get(a.attorney_id)?.has(r.state_code)) {
          continue;
        }
        answers.push({
          id: a.id,
          attorneyUsername: username,
          body: a.body,
          reviewed: true,
          createdAt: a.created_at.toISOString(),
          updatedAt: a.updated_at.toISOString(),
        });
      }
      if (answers.length === 0) continue;
      items.push({
        id: r.id,
        title: r.title,
        body: r.body,
        practiceCode: r.practice_area_id
          ? (codes.get(r.practice_area_id) ?? null)
          : null,
        stateCode: r.state_code,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        answers,
      });
    }
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeTimeCursor({ t: last.created_at.toISOString(), i: last.id })
          : null,
    };
  }

  private async usernamesOf(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.attorneyProfile.findMany({
      where: { user_id: { in: unique } },
      select: { user_id: true, username: true },
    });
    return new Map(rows.map((r) => [r.user_id, r.username]));
  }

  private async licensedStatesOf(
    ids: string[],
  ): Promise<Map<string, Set<string>>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.attorneyLicense.findMany({
      where: { attorney_id: { in: unique }, license_status: 'verified' },
      select: { attorney_id: true, state_code: true },
    });
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = out.get(r.attorney_id) ?? new Set<string>();
      set.add(r.state_code);
      out.set(r.attorney_id, set);
    }
    return out;
  }

  private async practiceCodes(
    ids: Array<string | null>,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const rows = await this.db.practiceArea.findMany({
      where: { id: { in: unique } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.id, r.code]));
  }
}
