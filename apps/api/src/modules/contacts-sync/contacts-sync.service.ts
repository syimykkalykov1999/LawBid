import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  ContactSyncStatusDto,
  ContactUploadResultDto,
} from './contacts-sync.dto';

/**
 * Owner 2026-10-13 — contacts sync like Instagram, built to keep the
 * address book private:
 * - the app sends SHA-256 hashes of E.164 numbers, never the numbers;
 * - the answer lists who matched with the hash the app itself sent, so it
 *   can show the phone-book name; nothing but owner → user is stored;
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
    private readonly files: FilesService,
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
      select: {
        id: true,
        phone_sha256: true,
        role: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
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
    const avatars = await this.files.avatarUrlsMany(
      found.map((u) => u.avatar_file_id),
    );
    return {
      matched: found.length,
      people: found.flatMap((u) =>
        u.phone_sha256
          ? [
              {
                hash: u.phone_sha256,
                userId: u.id,
                username:
                  u.attorney_profile?.username ??
                  u.client_profile?.username ??
                  null,
                displayName: [u.first_name, u.last_name]
                  .filter(Boolean)
                  .join(' '),
                avatarUrl: u.avatar_file_id
                  ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
                  : null,
                role: u.role ?? null,
              },
            ]
          : [],
      ),
    };
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
}
