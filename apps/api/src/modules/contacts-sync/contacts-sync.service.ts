import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Redis from 'ioredis';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { cachedBlockSet } from '../blocks/block-set.cache';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { bookHashOf, xorBookHash } from './contacts-book-hash';
import { ContactsPepper } from './contacts-pepper';
import {
  CONTACT_BOOK_MAX,
  type ContactSyncStatusDto,
  type ContactUploadResultDto,
  type UploadContactHashesDto,
} from './contacts-sync.dto';

/**
 * Most DIFFERENT hashes one account may upload per day. Owner 2026-10-22:
 * counted as distinct numbers (a Redis HyperLogLog), so syncing the same
 * book again costs nothing; only guessing new numbers does. Since the
 * delta sync only ADDED numbers are counted, and the cap fits two whole
 * books of the stored maximum (a first sync plus a reinstall), so a big
 * book is never locked out.
 */
export const HASHES_PER_ACCOUNT_PER_DAY = 2 * CONTACT_BOOK_MAX;
/** The same per client address (a carrier NAT hides many phones). */
export const HASHES_PER_IP_PER_DAY = 100000;
/** The day keys live a little longer than the day they count. */
const KEY_TTL_SECONDS = 2 * 86400;
/** Share of matched hashes that looks like number guessing, not a book. */
const SUSPICIOUS_MATCH_RATIO = 0.6;
const SUSPICIOUS_MIN_HASHES = 100;

/** Who may be found by number (privacy review 2026-10-20). */
const FINDABLE: Prisma.UserWhereInput = {
  OR: [{ role: 'attorney' }, { role: 'client', find_by_phone: true }],
  status: 'active',
  deleted_at: null,
  phone_verified_at: { not: null },
};

const PERSON_SELECT = {
  id: true,
  phone_sha256: true,
  role: true,
  first_name: true,
  last_name: true,
  avatar_file_id: true,
  attorney_profile: { select: { username: true } },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

/**
 * Owner 2026-10-13 — contacts sync like Instagram, built to keep the
 * address book private:
 * - the app sends SHA-256 hashes of E.164 numbers, never the numbers;
 * - the answer lists who matched with the hash the app itself sent, so it
 *   can show the phone-book name;
 * - only verified-phone accounts may upload, with limits;
 * - privacy review 2026-10-20: the answer is minimal — attorneys (public
 *   profiles) in full, clients only when they allow "find me by my number"
 *   and then first name + avatar only; blocked people (both ways) and
 *   assistants never; daily caps of distinct numbers per account and per
 *   address plus an hourly request limit (owner 2026-10-22); a high match
 *   share goes to Sentry. The hashes are plain SHA-256 of E.164 (the same
 *   as users.phone_sha256) on the wire; the stored book is peppered on the
 *   server (ContactsPepper, security research #5 A7) so a copy of the
 *   table can't be matched against precomputed numbers.
 * - DELETE removes every match and the stored book, and turns the sync off.
 *
 * Owner 2026-10-22 («нельзя ни в коем случае нагружать сервер», like
 * Telegram's contacts hash and WhatsApp's delta sync): the server keeps the
 * uploaded book as hashes (contact_book_hashes, at most CONTACT_BOOK_MAX)
 * and its XOR hash. The app asks "changed?" with its own hash first — the
 * daily check is one row read. Otherwise it sends only the numbers added
 * and removed; a removed number drops its match. A person who registers
 * later is announced by the server (ContactsJoinedJob, "X joined LawBid").
 */
@Injectable()
export class ContactsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly files: FilesService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly pepper: ContactsPepper,
    // Caching round 2 (S2-2): the block set and the "people you may know"
    // copy are per-user caches on the evictable cache Redis; the HyperLogLog
    // quota above stays on the main client.
    @Optional() @Inject(REDIS_CACHE_CLIENT) cache?: Redis,
  ) {
    this.cache = cache ?? redis;
  }

  private readonly cache: Redis;

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
      notifyJoined: setting?.notify_joined ?? true,
    };
  }

  /**
   * "Find me by my number". Off also removes me from others' lists (their
   * next daily check gets the new list); on again lets the joined job match
   * me with the books that have my number (no second notice: one per pair).
   */
  async setFindByPhone(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: enabled
        ? { find_by_phone: true, contacts_announced_at: null }
        : { find_by_phone: false },
    });
    if (!enabled) {
      const owners = await this.prisma.contactMatch.findMany({
        where: { matched_id: userId },
        select: { owner_id: true },
        take: 100000,
      });
      await this.prisma.contactMatch.deleteMany({
        where: { matched_id: userId },
      });
      if (owners.length > 0) {
        await this.prisma.contactSyncSetting.updateMany({
          where: { user_id: { in: owners.map((o) => o.owner_id) } },
          data: { matches_version: { increment: 1 } },
        });
      }
    }
  }

  /** «Notify me when contacts join LawBid» (the server sends it). */
  async setNotifyJoined(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.contactSyncSetting.upsert({
      where: { user_id: userId },
      // A switch flipped before the first sync does not turn the sync on.
      create: { user_id: userId, enabled: false, notify_joined: enabled },
      update: { notify_joined: enabled },
    });
  }

  /** Adds [hashes] to the day's distinct set behind [key]; 429 past [limit]. */
  private async charge(key: string, hashes: string[], limit: number) {
    if (hashes.length === 0) return;
    // In parts: one command with tens of thousands of arguments is heavy.
    for (let i = 0; i < hashes.length; i += 5000) {
      await this.redis.pfadd(key, ...hashes.slice(i, i + 5000));
    }
    await this.redis.expire(key, KEY_TTL_SECONDS);
    const used = await this.redis.pfcount(key);
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

  private async chargeAll(userId: string, hashes: string[], ip?: string) {
    const day = new Date().toISOString().slice(0, 10);
    await this.charge(
      `contacts:distinct:u:${userId}:${day}`,
      hashes,
      HASHES_PER_ACCOUNT_PER_DAY,
    );
    if (ip) {
      await this.charge(
        `contacts:distinct:ip:${ip}:${day}`,
        hashes,
        HASHES_PER_IP_PER_DAY,
      );
    }
  }

  /** Registered, findable people whose number is one of [hashes]. */
  private async lookup(userId: string, hashes: string[]): Promise<PersonRow[]> {
    if (hashes.length === 0) return [];
    const blocked = await cachedBlockSet(this.prisma, this.cache, userId);
    return this.prisma.user.findMany({
      where: {
        phone_sha256: { in: hashes },
        id: { notIn: [userId, ...blocked] },
        ...FINDABLE,
      },
      select: PERSON_SELECT,
      take: hashes.length,
    });
  }

  private warnIfGuessing(userId: string, hashes: number, matched: number) {
    if (
      hashes >= SUSPICIOUS_MIN_HASHES &&
      matched / hashes > SUSPICIOUS_MATCH_RATIO
    ) {
      Sentry.captureMessage('contacts_sync: unusually high match share', {
        level: 'warning',
        extra: { userId, hashes, matched },
      });
    }
  }

  private async toPeople(
    found: PersonRow[],
  ): Promise<ContactUploadResultDto['people']> {
    const avatars = await this.files.avatarUrlsMany(
      found.map((u) => u.avatar_file_id),
    );
    return found.flatMap((u) =>
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
    );
  }

  /** Every person of the user's stored matches who may be shown now. */
  private async currentPeople(
    userId: string,
  ): Promise<ContactUploadResultDto['people']> {
    const blocked = await cachedBlockSet(this.prisma, this.cache, userId);
    const found = await this.prisma.user.findMany({
      where: {
        contact_matched_by: { some: { owner_id: userId } },
        id: { notIn: [userId, ...blocked] },
        ...FINDABLE,
      },
      select: PERSON_SELECT,
      take: CONTACT_BOOK_MAX,
    });
    return this.toPeople(found);
  }

  /** Old builds (`{hashes}`): adds the matches of [hashes]. */
  async upload(
    userId: string,
    hashes: string[],
    ip?: string,
  ): Promise<ContactUploadResultDto> {
    await this.limits.consume('contacts_sync', userId);
    const unique = [...new Set(hashes)];
    await this.chargeAll(userId, unique, ip);
    const found = await this.lookup(userId, unique);
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
    await this.keepLegacy(userId, unique);
    this.warnIfGuessing(userId, unique.length, found.length);
    // The recommendations are rebuilt with the new signal.
    await this.cache.del(`reco:people:${userId}`);
    return { matched: found.length, people: await this.toPeople(found) };
  }

  /**
   * Owner 2026-10-22: an old build's hashes join the stored book too (so
   * "X joined" reaches its users), while it fits. The book hash becomes
   * unknown: a new build then sends its book whole once.
   */
  private async keepLegacy(userId: string, unique: string[]): Promise<void> {
    const setting = await this.prisma.contactSyncSetting.findUnique({
      where: { user_id: userId },
      select: { book_size: true },
    });
    if ((setting?.book_size ?? 0) + unique.length > CONTACT_BOOK_MAX) return;
    const added = await this.prisma.contactBookHash.createMany({
      data: unique.map((h) => ({ owner_id: userId, ...this.pepper.row(h) })),
      skipDuplicates: true,
    });
    await this.prisma.contactSyncSetting.update({
      where: { user_id: userId },
      data: { book_size: { increment: added.count }, book_hash: null },
    });
  }

  /**
   * Owner 2026-10-22: the hash-checked sync (see UploadContactHashesDto).
   * "Not modified" costs the hourly request counter and one row read.
   */
  async sync(
    userId: string,
    dto: UploadContactHashesDto,
    ip?: string,
  ): Promise<ContactUploadResultDto> {
    await this.limits.consume('contacts_sync', userId);
    const added = [...new Set(dto.added ?? [])];
    const addedSet = new Set(added);
    const removed = [...new Set(dto.removed ?? [])].filter(
      (h) => !addedSet.has(h),
    );
    const setting = await this.prisma.contactSyncSetting.findUnique({
      where: { user_id: userId },
      select: { book_hash: true, book_size: true, matches_version: true },
    });
    const version = setting?.matches_version ?? 0;
    const stored = setting?.book_hash ?? null;
    const resync: ContactUploadResultDto = {
      status: 'resync',
      matched: 0,
      people: [],
      bookHash: stored,
      bookSize: setting?.book_size ?? 0,
      matchesVersion: version,
    };

    if (!dto.full && added.length === 0 && removed.length === 0) {
      if (!dto.bookHash) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Send bookHash, or the numbers added / removed.',
        });
      }
      if (stored === null || stored !== dto.bookHash) return resync;
      if (dto.matchesVersion === version) {
        return { ...resync, status: 'not_modified' };
      }
      // The book is the same but the people changed (someone joined):
      // the list, without touching the book.
      const people = await this.currentPeople(userId);
      return { ...resync, status: 'ok', matched: people.length, people };
    }

    if (!dto.full) {
      if (!dto.baseHash) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'baseHash is required for a change of the book.',
        });
      }
      if (stored === null || stored !== dto.baseHash) return resync;
    }

    await this.chargeAll(userId, added, ip);

    let newAdded: string[];
    let gone: string[];
    let hash: string;
    let size: number;
    if (dto.full) {
      newAdded = added;
      gone = [];
      hash = bookHashOf(added);
      size = added.length;
    } else {
      // Both stored forms while the pepper backfill runs (ContactsPepper).
      const present = await this.prisma.contactBookHash.findMany({
        where: {
          owner_id: userId,
          ...this.pepper.where([...added, ...removed]),
        },
        select: { phone_hash: true },
      });
      const back = this.pepper.unsealMap([...added, ...removed]);
      const have = new Set(
        present.flatMap((p) => {
          const h = back.get(p.phone_hash);
          return h ? [h] : [];
        }),
      );
      newAdded = added.filter((h) => !have.has(h));
      gone = removed.filter((h) => have.has(h));
      hash = xorBookHash(stored!, [...newAdded, ...gone]);
      size = (setting?.book_size ?? 0) + newAdded.length - gone.length;
    }
    if (size > CONTACT_BOOK_MAX) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `At most ${CONTACT_BOOK_MAX} numbers are synced.`,
      });
    }

    const found = await this.lookup(userId, newAdded);
    const goneIds =
      gone.length > 0
        ? (
            await this.prisma.user.findMany({
              where: { phone_sha256: { in: gone } },
              select: { id: true },
              take: gone.length,
            })
          ).map((u) => u.id)
        : [];
    const now = new Date();
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.full) {
      ops.push(
        this.prisma.contactBookHash.deleteMany({ where: { owner_id: userId } }),
        // Numbers no longer in the book lose their match.
        this.prisma.contactMatch.deleteMany({
          where: {
            owner_id: userId,
            matched_id: { notIn: found.map((u) => u.id) },
          },
        }),
      );
    }
    if (gone.length > 0) {
      ops.push(
        this.prisma.contactBookHash.deleteMany({
          where: {
            owner_id: userId,
            phone_hash: { in: gone.flatMap((h) => this.pepper.forms(h)) },
          },
        }),
      );
    }
    if (goneIds.length > 0) {
      ops.push(
        this.prisma.contactMatch.deleteMany({
          where: { owner_id: userId, matched_id: { in: goneIds } },
        }),
      );
    }
    if (newAdded.length > 0) {
      ops.push(
        this.prisma.contactBookHash.createMany({
          data: newAdded.map((h) => ({
            owner_id: userId,
            ...this.pepper.row(h),
          })),
          skipDuplicates: true,
        }),
      );
    }
    if (found.length > 0) {
      ops.push(
        this.prisma.contactMatch.createMany({
          data: found.map((u) => ({ owner_id: userId, matched_id: u.id })),
          skipDuplicates: true,
        }),
      );
    }
    ops.push(
      this.prisma.contactSyncSetting.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          enabled: true,
          synced_at: now,
          book_hash: hash,
          book_size: size,
        },
        update: {
          enabled: true,
          synced_at: now,
          book_hash: hash,
          book_size: size,
        },
      }),
    );
    await this.prisma.$transaction(ops);
    this.warnIfGuessing(userId, newAdded.length, found.length);
    if (found.length > 0 || goneIds.length > 0 || dto.full) {
      await this.cache.del(`reco:people:${userId}`);
    }
    const people = await this.currentPeople(userId);
    return {
      status: 'ok',
      matched: people.length,
      people,
      bookHash: hash,
      bookSize: size,
      matchesVersion: version,
    };
  }

  /** Turns the sync off and deletes every match and the stored book. */
  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contactMatch.deleteMany({ where: { owner_id: userId } }),
      this.prisma.contactBookHash.deleteMany({ where: { owner_id: userId } }),
      this.prisma.contactSyncSetting.upsert({
        where: { user_id: userId },
        create: { user_id: userId, enabled: false, synced_at: null },
        update: {
          enabled: false,
          synced_at: null,
          book_hash: null,
          book_size: 0,
        },
      }),
    ]);
    await this.cache.del(`reco:people:${userId}`);
  }
}
