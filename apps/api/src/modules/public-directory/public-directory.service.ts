import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../common/secrets/secrets.service';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaReadService } from '../../prisma/prisma-read.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../files/files.public';
import type { PublicAttorneyDto } from './public-directory.dto';

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
}
