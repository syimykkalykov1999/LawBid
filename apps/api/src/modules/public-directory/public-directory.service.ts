import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PublicAttorneyDto } from './public-directory.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async attorneys(q: {
    state?: string;
    practice?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PublicAttorneysPage> {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
    const where: Prisma.AttorneyProfileWhereInput = {
      verification_status: 'verified',
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
    const rows = await this.prisma.attorneyProfile.findMany({
      where,
      orderBy: [
        { trust_level: 'desc' },
        { rating_avg: 'desc' },
        { username_lower: 'asc' },
      ],
      take: limit + 1,
      ...(q.cursor
        ? { cursor: { username_lower: q.cursor.toLowerCase() }, skip: 0 }
        : {}),
      select: {
        username: true,
        username_lower: true,
        bio: true,
        firm_names: true,
        languages: true,
        rating_avg: true,
        rating_count: true,
        trust_badge: true,
        user: { select: { first_name: true, last_name: true } },
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
    const next = rows.length > limit ? rows[limit].username_lower : null;
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
