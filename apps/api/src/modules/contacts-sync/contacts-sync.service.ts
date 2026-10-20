import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type Redis from 'ioredis';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { cachedBlockSet } from '../blocks/block-set.cache';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  ContactSyncStatusDto,
  ContactUploadResultDto,
} from './contacts-sync.dto';

/** Most unique hashes one account may upload per day (all chunks). */
export const HASHES_PER_ACCOUNT_PER_DAY = 5000;
/** The same per client address, against many accounts from one place. */
export const HASHES_PER_IP_PER_DAY = 20000;
const DAY_SECONDS = 86400;
/** Share of matched hashes that looks like number guessing, not a book. */
const SUSPICIOUS_MATCH_RATIO = 0.6;
const SUSPICIOUS_MIN_HASHES = 100;

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
 * - privacy review 2026-10-20: the answer is minimal — attorneys (public
 *   profiles) in full, clients only when they allow "find me by my number"
 *   and then first name + avatar only; blocked people (both ways) and
 *   assistants never; daily caps per account and per address; a high match
 *   share goes to Sentry. The hashes are plain SHA-256 of E.164 (the same
 *   as users.phone_sha256): TODO stage 2 — HMAC with a server pepper so the
 *   hash can't be precomputed.
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
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { find_by_phone: true, phone_e164: true },
    });
    return {
      enabled: setting?.enabled ?? false,
      matches,
      syncedAt: setting?.synced_at?.toISOString() ?? null,
      findByPhone: me?.find_by_phone ?? true,
      phoneRegion: me?.phone_e164
        ? (parsePhoneNumberFromString(me.phone_e164)?.country ?? null)
        : null,
    };
  }

  /** "Find me by my number". Off also removes me from others' lists. */
  async setFindByPhone(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { find_by_phone: enabled },
    });
    if (!enabled) {
      await this.prisma.contactMatch.deleteMany({
        where: { matched_id: userId },
      });
    }
  }

  private async charge(key: string, amount: number, limit: number) {
    const used = await this.redis.incrby(key, amount);
    if (used === amount) await this.redis.expire(key, DAY_SECONDS);
    if (used > limit) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many contacts today. Try again tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Adds the matches of [hashes] (duplicates and own number ignored). */
  async upload(
    userId: string,
    hashes: string[],
    ip?: string,
  ): Promise<ContactUploadResultDto> {
    await this.limits.consume('contacts_sync', userId);
    const unique = [...new Set(hashes)];
    const day = new Date().toISOString().slice(0, 10);
    await this.charge(
      `contacts:hashes:u:${userId}:${day}`,
      unique.length,
      HASHES_PER_ACCOUNT_PER_DAY,
    );
    if (ip) {
      await this.charge(
        `contacts:hashes:ip:${ip}:${day}`,
        unique.length,
        HASHES_PER_IP_PER_DAY,
      );
    }
    const blocked = await cachedBlockSet(this.prisma, this.redis, userId);
    const found = await this.prisma.user.findMany({
      where: {
        phone_sha256: { in: unique },
        id: { notIn: [userId, ...blocked] },
        OR: [{ role: 'attorney' }, { role: 'client', find_by_phone: true }],
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
    if (
      unique.length >= SUSPICIOUS_MIN_HASHES &&
      found.length / unique.length > SUSPICIOUS_MATCH_RATIO
    ) {
      Sentry.captureMessage('contacts_sync: unusually high match share', {
        level: 'warning',
        extra: { userId, hashes: unique.length, matched: found.length },
      });
    }
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
                // Attorneys are public; a client shows a first name only.
                username:
                  u.role === 'attorney'
                    ? (u.attorney_profile?.username ?? null)
                    : null,
                displayName:
                  u.role === 'attorney'
                    ? [u.first_name, u.last_name].filter(Boolean).join(' ')
                    : (u.first_name ?? ''),
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
