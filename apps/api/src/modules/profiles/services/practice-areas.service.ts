import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type {
  PracticeAreaCategoryDto,
  SelectedPracticeAreaDto,
} from '../dto/practice-areas.dto';
import {
  attorneyNotVerified,
  notFound,
  requireOwnAttorney,
  validationError,
} from './profile-access';

/** The tree changes only by a seed/migration (docs/02 §3.2), so a short
 * shared cache keeps every app start from re-reading ~400 rows. */
export const PRACTICE_TREE_CACHE_KEY = 'practice_areas:tree:v1';
export const PRACTICE_TREE_CACHE_TTL_SECONDS = 300;

export interface PracticeTree {
  etag: string;
  categories: PracticeAreaCategoryDto[];
}

interface AreaRow {
  id: string;
  parent_id: string | null;
  code: string;
  name_en: string;
  i18n_key: string;
  sort: number;
}

/** Builds the category → active-leaf tree from active rows. Categories
 * without an active leaf are left out (nothing to pick there). Sorted by
 * `sort`, then code. Exported for unit tests. */
export function buildPracticeTree(rows: AreaRow[]): PracticeAreaCategoryDto[] {
  const bySort = (a: AreaRow, b: AreaRow): number =>
    a.sort - b.sort || a.code.localeCompare(b.code);
  const leaves = new Map<string, AreaRow[]>();
  for (const r of rows) {
    if (r.parent_id === null) continue;
    const list = leaves.get(r.parent_id) ?? [];
    list.push(r);
    leaves.set(r.parent_id, list);
  }
  return rows
    .filter((r) => r.parent_id === null)
    .sort(bySort)
    .map((cat) => ({
      id: cat.id,
      code: cat.code,
      i18nKey: cat.i18n_key,
      nameEn: cat.name_en,
      children: (leaves.get(cat.id) ?? []).sort(bySort).map((leaf) => ({
        id: leaf.id,
        code: leaf.code,
        i18nKey: leaf.i18n_key,
        nameEn: leaf.name_en,
      })),
    }))
    .filter((cat) => cat.children.length > 0);
}

/**
 * docs/03 §3.2 practices: the reference tree and the attorney's own
 * selection (attorney_practice_areas, docs/02 §4.C — "Запись допускается
 * только при verification_status = 'verified' (проверка в сервисе)").
 */
@Injectable()
export class PracticeAreasService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async tree(): Promise<PracticeTree> {
    const cached = await this.redis.get(PRACTICE_TREE_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached) as PracticeTree;

    const rows = await this.prisma.practiceArea.findMany({
      where: { is_active: true },
      select: {
        id: true,
        parent_id: true,
        code: true,
        name_en: true,
        i18n_key: true,
        sort: true,
      },
    });
    const categories = buildPracticeTree(rows);
    const hash = createHash('sha256')
      .update(JSON.stringify(categories))
      .digest('hex')
      .slice(0, 24);
    const tree: PracticeTree = { etag: `"pa-${hash}"`, categories };
    await this.redis.set(
      PRACTICE_TREE_CACHE_KEY,
      JSON.stringify(tree),
      'EX',
      PRACTICE_TREE_CACHE_TTL_SECONDS,
    );
    return tree;
  }

  /** The attorney's selected, still-active specializations. */
  async selected(userId: string): Promise<SelectedPracticeAreaDto[]> {
    await requireOwnAttorney(this.prisma, userId);
    return this.selectedOf(userId);
  }

  /** Selected active leaves of any attorney (own list, public profile). */
  async selectedOf(userId: string): Promise<SelectedPracticeAreaDto[]> {
    const rows = await this.prisma.attorneyPracticeArea.findMany({
      where: {
        attorney_id: userId,
        practice_area: { is_active: true, parent: { is_active: true } },
      },
      select: {
        practice_area: {
          select: {
            id: true,
            code: true,
            i18n_key: true,
            name_en: true,
            sort: true,
            parent: {
              select: { id: true, code: true, i18n_key: true, sort: true },
            },
          },
        },
      },
    });
    return rows
      .flatMap(({ practice_area: a }) =>
        a.parent ? [{ ...a, parent: a.parent }] : [],
      )
      .sort(
        (a, b) =>
          a.parent.sort - b.parent.sort ||
          a.sort - b.sort ||
          a.code.localeCompare(b.code),
      )
      .map((a) => ({
        id: a.id,
        code: a.code,
        i18nKey: a.i18n_key,
        nameEn: a.name_en,
        categoryId: a.parent.id,
        categoryCode: a.parent.code,
        categoryI18nKey: a.parent.i18n_key,
      }));
  }

  /**
   * PUT /attorneys/me/practice-areas: replaces the whole set in one
   * transaction. Only a `verified` attorney (403 ATTORNEY_NOT_VERIFIED,
   * re-checked inside the transaction so a concurrent suspension wins);
   * only active leaves under an active category (400 VALIDATION_ERROR
   * with details.invalidIds). The change goes to audit_log (§3.2) with
   * the attorney as the actor.
   */
  async replace(
    userId: string,
    ids: string[],
    ip?: string,
  ): Promise<SelectedPracticeAreaDto[]> {
    const { verificationStatus } = await requireOwnAttorney(
      this.prisma,
      userId,
    );
    if (verificationStatus !== 'verified') throw attorneyNotVerified();

    const wanted = [...new Set(ids)];
    const valid =
      wanted.length === 0
        ? []
        : await this.prisma.practiceArea.findMany({
            where: {
              id: { in: wanted },
              is_active: true,
              parent_id: { not: null },
              parent: { is_active: true },
            },
            select: { id: true },
          });
    const validSet = new Set(valid.map((v) => v.id));
    const invalidIds = wanted.filter((id) => !validSet.has(id));
    if (invalidIds.length > 0) {
      throw validationError(
        'Only active specializations (not categories) can be selected.',
        { field: 'practiceAreaIds', invalidIds },
      );
    }

    await withTxRetry(this.prisma, async (tx) => {
      const profile = await tx.attorneyProfile.findUnique({
        where: { user_id: userId },
        select: { verification_status: true },
      });
      if (!profile) throw notFound();
      if (profile.verification_status !== 'verified') {
        throw attorneyNotVerified();
      }
      const current = (
        await tx.attorneyPracticeArea.findMany({
          where: { attorney_id: userId },
          select: { practice_area_id: true },
        })
      ).map((r) => r.practice_area_id);
      const currentSet = new Set(current);
      const toRemove = current.filter((id) => !validSet.has(id));
      const toAdd = wanted.filter((id) => !currentSet.has(id));
      if (toRemove.length === 0 && toAdd.length === 0) return;
      if (toRemove.length > 0) {
        await tx.attorneyPracticeArea.deleteMany({
          where: { attorney_id: userId, practice_area_id: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.attorneyPracticeArea.createMany({
          data: toAdd.map((practice_area_id) => ({
            attorney_id: userId,
            practice_area_id,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          admin_id: userId,
          action: 'attorney.practice_areas.replace',
          target_type: 'attorney_profile',
          target_id: userId,
          before: { practiceAreaIds: [...current].sort() },
          after: { practiceAreaIds: [...wanted].sort() },
          ip: ip ?? null,
        },
      });
    });
    return this.selectedOf(userId);
  }
}
