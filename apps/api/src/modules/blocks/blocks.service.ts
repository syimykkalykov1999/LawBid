import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { FilesService } from '../files/files.service';
import type { BlockedUserDto } from './blocks.dto';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Owner decision 2026-09-29 (OQ-028): any signed-in user can block any
 * other user (attorney or client) and unblock later. A block is one-way
 * in storage and symmetric in effect: neither side can message, follow
 * or find the other in People search while it exists; profiles carry
 * `isBlocked` / `hasBlockedMe`. Existing follows between the two are
 * removed at block time. Cases and bids already in progress are not
 * touched (business records, docs/04).
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async block(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot block yourself.',
      });
    }
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.userBlock.createMany({
        data: [{ blocker_id: userId, blocked_id: targetId }],
        skipDuplicates: true,
      });
      // No follows either way while blocked.
      await tx.follow.deleteMany({
        where: {
          OR: [
            { follower_id: userId, followee_id: targetId },
            { follower_id: targetId, followee_id: userId },
          ],
        },
      });
    });
  }

  async unblock(userId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blocker_id: userId, blocked_id: targetId },
    });
  }

  /** `{ isBlocked, hasBlockedMe }` between a viewer and a target. */
  async relation(
    viewerId: string,
    targetId: string,
    db: Db = this.prisma,
  ): Promise<{ isBlocked: boolean; hasBlockedMe: boolean }> {
    if (viewerId === targetId) return { isBlocked: false, hasBlockedMe: false };
    const rows = await db.userBlock.findMany({
      where: {
        OR: [
          { blocker_id: viewerId, blocked_id: targetId },
          { blocker_id: targetId, blocked_id: viewerId },
        ],
      },
      select: { blocker_id: true },
    });
    return {
      isBlocked: rows.some((r) => r.blocker_id === viewerId),
      hasBlockedMe: rows.some((r) => r.blocker_id === targetId),
    };
  }

  /** True when either of the two blocked the other. */
  async isBlockedEitherWay(
    a: string,
    b: string,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const r = await this.relation(a, b, db);
    return r.isBlocked || r.hasBlockedMe;
  }

  /** Every user id the viewer must not see / be seen by (both directions),
   * for filtering lists. Bounded by the viewer's own block activity. */
  async hiddenIds(viewerId: string): Promise<Set<string>> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blocker_id: viewerId }, { blocked_id: viewerId }] },
      select: { blocker_id: true, blocked_id: true },
      take: 5000,
    });
    const out = new Set<string>();
    for (const r of rows) {
      out.add(r.blocker_id === viewerId ? r.blocked_id : r.blocker_id);
    }
    return out;
  }

  /** 403 USER_BLOCKED when the two users may not interact. */
  async assertNotBlocked(a: string, b: string, db: Db = this.prisma) {
    if (await this.isBlockedEitherWay(a, b, db)) {
      throw new ForbiddenException({
        code: ErrorCode.USER_BLOCKED,
        message: 'This user is not available.',
      });
    }
  }

  /** `GET /users/me/blocks`: who the viewer blocked, newest first. */
  async list(userId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blocker_id: userId },
      orderBy: { created_at: 'desc' },
      take: 500,
      select: {
        created_at: true,
        blocked: {
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: { select: { username: true } },
            client_profile: { select: { username: true } },
          },
        },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      rows.map((r) => r.blocked.avatar_file_id),
    );
    return rows.flatMap((r) => {
      const u = r.blocked;
      if (u.role !== 'attorney' && u.role !== 'client') return [];
      return [
        {
          id: u.id,
          role: u.role,
          username:
            u.attorney_profile?.username ?? u.client_profile?.username ?? null,
          firstName: u.first_name,
          lastName: u.last_name,
          avatarUrl: u.avatar_file_id
            ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
            : null,
          blockedAt: r.created_at.toISOString(),
        },
      ];
    });
  }
}
