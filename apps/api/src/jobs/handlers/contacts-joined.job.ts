import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ContactsPepper } from '../../modules/contacts-sync/contacts-pepper';
import { emitOnce } from './reminder-claim';

/** New accounts handled per run (every 2 minutes; the rest next run). */
export const CONTACTS_JOINED_BATCH = 200;
/** Phone books read per new account. */
export const CONTACTS_JOINED_OWNERS_MAX = 5000;
/** One notice per (book owner, joiner) — also after "find me" off → on. */
const ONCE_TTL_SECONDS = 365 * 24 * 3600;

export interface ContactsJoinedResult {
  joiners: number;
  matched: number;
  notified: number;
}

/**
 * Owner 2026-10-22 (like Telegram: "X joined" comes from the server): a
 * person who can now be found by number (verified phone, attorney or
 * client with «find me by my number») and was not announced yet
 * (users.contacts_announced_at null) is matched with every stored phone
 * book that has the number (contact_book_hashes, by hash). Each such owner
 * gets the person in their list (contact_matches; matches_version bumped,
 * so their app's cheap daily check fetches the new list) and, while their
 * «Уведомлять, когда контакты появятся в LawBid» is on, ONE notice
 * `contact_joined` (push + bell, via the notifications queue). Blocked
 * pairs (either way) are skipped. Accounts that existed when this shipped
 * count as announced (migration), so nobody gets a burst of old news.
 */
@Injectable()
export class ContactsJoinedJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly pepper: ContactsPepper,
  ) {}

  async run(now: Date = new Date()): Promise<ContactsJoinedResult> {
    const joiners = await this.prisma.user.findMany({
      where: {
        contacts_announced_at: null,
        phone_verified_at: { not: null },
        phone_sha256: { not: null },
        status: 'active',
        deleted_at: null,
        OR: [{ role: 'attorney' }, { role: 'client', find_by_phone: true }],
      },
      select: { id: true, phone_sha256: true },
      orderBy: { id: 'asc' },
      take: CONTACTS_JOINED_BATCH,
    });
    const out: ContactsJoinedResult = {
      joiners: joiners.length,
      matched: 0,
      notified: 0,
    };
    for (const j of joiners) {
      const { matched, notified } = await this.announce(j.id, j.phone_sha256!);
      out.matched += matched;
      out.notified += notified;
    }
    if (joiners.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: joiners.map((j) => j.id) } },
        data: { contacts_announced_at: now },
      });
    }
    return out;
  }

  private async announce(
    joinerId: string,
    hash: string,
  ): Promise<{ matched: number; notified: number }> {
    // Security research #5 (A7): the peppered row, or the plain one not
    // re-hashed yet (ContactsPepper.where).
    const rows = await this.prisma.contactBookHash.findMany({
      where: { ...this.pepper.where([hash]), owner_id: { not: joinerId } },
      select: { owner_id: true },
      take: CONTACTS_JOINED_OWNERS_MAX,
    });
    if (rows.length === 0) return { matched: 0, notified: 0 };
    const owners = rows.map((r) => r.owner_id);
    const [blocks, existing] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blocker_id: joinerId, blocked_id: { in: owners } },
            { blocked_id: joinerId, blocker_id: { in: owners } },
          ],
        },
        select: { blocker_id: true, blocked_id: true },
      }),
      this.prisma.contactMatch.findMany({
        where: { matched_id: joinerId, owner_id: { in: owners } },
        select: { owner_id: true },
      }),
    ]);
    const skip = new Set([
      ...blocks.map((b) =>
        b.blocker_id === joinerId ? b.blocked_id : b.blocker_id,
      ),
      ...existing.map((m) => m.owner_id),
    ]);
    const fresh = owners.filter((o) => !skip.has(o));
    if (fresh.length === 0) return { matched: 0, notified: 0 };
    await this.prisma.$transaction([
      this.prisma.contactMatch.createMany({
        data: fresh.map((o) => ({ owner_id: o, matched_id: joinerId })),
        skipDuplicates: true,
      }),
      this.prisma.contactSyncSetting.updateMany({
        where: { user_id: { in: fresh } },
        data: { matches_version: { increment: 1 } },
      }),
    ]);
    const wants = await this.prisma.contactSyncSetting.findMany({
      where: { user_id: { in: fresh }, enabled: true, notify_joined: true },
      select: { user_id: true },
    });
    let notified = 0;
    for (const w of wants) {
      const sent = await emitOnce(
        this.redis,
        `contacts:joined:${w.user_id}:${joinerId}`,
        ONCE_TTL_SECONDS,
        () =>
          this.notifications.emit({
            type: 'contact_joined',
            recipientId: w.user_id,
            payload: { actorId: joinerId },
          }),
      );
      if (sent) notified++;
    }
    return { matched: fresh.length, notified };
  }
}
