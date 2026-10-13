import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { BlocksService } from '../blocks/blocks.service';
import type { AttorneyListPage } from '../follows/follows.dto';
import { FollowsService } from '../follows/follows.service';
import type {
  ContactSyncStatusDto,
  ContactUploadResultDto,
} from './contacts-sync.dto';

const PAGE = 20;
/** People shown in "From contacts" at most. */
const SHOWN_MAX = 100;

/**
 * Owner 2026-10-13 — contacts sync like Instagram, built to keep the
 * address book private:
 * - the app sends SHA-256 hashes of E.164 numbers, never the numbers;
 * - hashes are only compared with users.phone_sha256 and thrown away:
 *   what is stored is the pair "owner → registered user" (contact_matches);
 * - only verified-phone accounts may upload, with a daily limit, and the
 *   answer is a count, never which hash matched;
 * - DELETE removes every match of the owner and turns the sync off.
 */
@Injectable()
export class ContactsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly blocks: BlocksService,
    private readonly follows: FollowsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async status(userId: string): Promise<ContactSyncStatusDto> {
    const [setting, matches] = await Promise.all([
      this.prisma.contactSyncSetting.findUnique({
        where: { user_id: userId },
      }),
      this.prisma.contactMatch.count({ where: { owner_id: userId } }),
    ]);
    return {
      enabled: setting?.enabled ?? false,
      matches,
      syncedAt: setting?.synced_at?.toISOString() ?? null,
    };
  }

  /** Adds the matches of [hashes] (duplicates and own number ignored). */
  async upload(
    userId: string,
    hashes: string[],
  ): Promise<ContactUploadResultDto> {
    await this.limits.consume('contacts_sync', userId);
    const unique = [...new Set(hashes)];
    const found = await this.prisma.user.findMany({
      where: {
        phone_sha256: { in: unique },
        id: { not: userId },
        status: 'active',
        deleted_at: null,
        phone_verified_at: { not: null },
      },
      select: { id: true },
      take: unique.length,
    });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.contactMatch.createMany({
        data: found.map((u) => ({ owner_id: userId, matched_id: u.id })),
        skipDuplicates: true,
      }),
      this.prisma.contactSyncSetting.upsert({
        where: { user_id: userId },
        create: { user_id: userId, enabled: true, synced_at: now },
        update: { enabled: true, synced_at: now },
      }),
    ]);
    // The recommendations are rebuilt with the new signal.
    await this.redis.del(`reco:people:${userId}`);
    return { matched: found.length };
  }

  /** Turns the sync off and deletes every match of the user. */
  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contactMatch.deleteMany({ where: { owner_id: userId } }),
      this.prisma.contactSyncSetting.upsert({
        where: { user_id: userId },
        create: { user_id: userId, enabled: false, synced_at: null },
        update: { enabled: false, synced_at: null },
      }),
    ]);
    await this.redis.del(`reco:people:${userId}`);
  }

  /**
   * GET /suggestions/contacts — attorneys from the address book the user
   * does not follow yet, newest match first; never across a block.
   */
  async suggestions(
    userId: string,
    cursor: string | undefined,
  ): Promise<AttorneyListPage> {
    const setting = await this.prisma.contactSyncSetting.findUnique({
      where: { user_id: userId },
      select: { enabled: true },
    });
    if (!setting?.enabled) return { items: [], nextCursor: null };
    const [rows, followed, hidden] = await Promise.all([
      this.prisma.contactMatch.findMany({
        where: { owner_id: userId },
        orderBy: [{ created_at: 'desc' }, { matched_id: 'asc' }],
        take: SHOWN_MAX,
        select: { matched_id: true },
      }),
      this.prisma.follow.findMany({
        where: { follower_id: userId },
        select: { followee_id: true },
        take: 5000,
      }),
      this.blocks.hiddenIds(userId),
    ]);
    const skip = new Set(followed.map((f) => f.followee_id));
    const ids = rows
      .map((r) => r.matched_id)
      .filter((id) => !skip.has(id) && !hidden.has(id));
    const start = decodeOffset(cursor);
    const end = start + PAGE;
    return {
      // present() drops non-attorneys and suspended accounts.
      items: await this.follows.present(ids.slice(start, end), userId),
      nextCursor: end < ids.length ? encodeOffset(end) : null,
    };
  }
}

function encodeOffset(i: number): string {
  return Buffer.from(String(i)).toString('base64url');
}

function decodeOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(Buffer.from(raw, 'base64url').toString(), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
