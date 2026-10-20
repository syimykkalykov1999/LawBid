import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, PrivacyAudience } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaClient;

export interface PrivacySettings {
  lastSeen: PrivacyAudience;
  messageFrom: PrivacyAudience;
  callFrom: PrivacyAudience;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  lastSeen: 'everyone',
  messageFrom: 'everyone',
  callFrom: 'everyone',
};

/**
 * Owner 2026-10-20: who may see my "last seen", write to me first and call
 * me. "Contacts" of a person are the people in their phone book who use
 * LawBid (contact_matches) and the people they follow. A case in work keeps
 * its chat and calls whatever the settings say (see caseWorkOngoing).
 */
@Injectable()
export class PrivacySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<PrivacySettings> {
    const row = await this.prisma.userPrivacySettings.findUnique({
      where: { user_id: userId },
    });
    return row
      ? {
          lastSeen: row.last_seen,
          messageFrom: row.message_from,
          callFrom: row.call_from,
        }
      : DEFAULT_PRIVACY;
  }

  async update(
    userId: string,
    patch: Partial<PrivacySettings>,
  ): Promise<PrivacySettings> {
    const data = {
      ...(patch.lastSeen ? { last_seen: patch.lastSeen } : {}),
      ...(patch.messageFrom ? { message_from: patch.messageFrom } : {}),
      ...(patch.callFrom ? { call_from: patch.callFrom } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.userPrivacySettings.upsert({
        where: { user_id: userId },
        create: { user_id: userId, ...data },
        update: data,
      });
      // The old switch (Settings → activity status) stays in step: it is
      // what hides the viewer's own view of others (reciprocal).
      if (patch.lastSeen) {
        await tx.user.update({
          where: { id: userId },
          data: { show_activity_status: patch.lastSeen !== 'nobody' },
        });
      }
    });
    return this.get(userId);
  }

  /** The old on/off switch maps to everyone / nobody. */
  async setActivityVisible(userId: string, show: boolean): Promise<void> {
    await this.update(userId, { lastSeen: show ? 'everyone' : 'nobody' });
  }

  /** Is [viewerId] one of [ownerId]'s contacts. */
  async isContactOf(
    ownerId: string,
    viewerId: string,
    db: Db = this.prisma,
  ): Promise<boolean> {
    if (ownerId === viewerId) return true;
    const [book, follow] = await Promise.all([
      db.contactMatch.findUnique({
        where: {
          owner_id_matched_id: { owner_id: ownerId, matched_id: viewerId },
        },
        select: { owner_id: true },
      }),
      db.follow.findUnique({
        where: {
          follower_id_followee_id: {
            follower_id: ownerId,
            followee_id: viewerId,
          },
        },
        select: { follower_id: true },
      }),
    ]);
    return book !== null || follow !== null;
  }

  /**
   * Which of [ownerIds] let [viewerId] see their last seen. A person who
   * never opened the screen shows it to everyone.
   */
  async lastSeenVisibleTo(
    viewerId: string,
    ownerIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.userPrivacySettings.findMany({
      where: { user_id: { in: ownerIds } },
      select: { user_id: true, last_seen: true },
    });
    const audience = new Map(rows.map((r) => [r.user_id, r.last_seen]));
    const needContact = ownerIds.filter(
      (id) => audience.get(id) === 'contacts',
    );
    const contacts = await this.contactsAmong(viewerId, needContact);
    return new Set(
      ownerIds.filter((id) => {
        const a = audience.get(id) ?? 'everyone';
        return a === 'everyone' || (a === 'contacts' && contacts.has(id));
      }),
    );
  }

  /** Subset of [ownerIds] that have [viewerId] as a contact. */
  private async contactsAmong(
    viewerId: string,
    ownerIds: string[],
  ): Promise<Set<string>> {
    if (ownerIds.length === 0) return new Set();
    const [book, follows] = await Promise.all([
      this.prisma.contactMatch.findMany({
        where: { matched_id: viewerId, owner_id: { in: ownerIds } },
        select: { owner_id: true },
      }),
      this.prisma.follow.findMany({
        where: { followee_id: viewerId, follower_id: { in: ownerIds } },
        select: { follower_id: true },
      }),
    ]);
    return new Set([
      ...book.map((r) => r.owner_id),
      ...follows.map((r) => r.follower_id),
    ]);
  }

  /**
   * 403 PRIVACY_RESTRICTED when [targetId]'s settings keep [actorId] from
   * [what] ("message" starts a chat, "call" rings them).
   */
  async assertAllowed(
    actorId: string,
    targetId: string,
    what: 'message' | 'call',
  ): Promise<void> {
    if (actorId === targetId) return;
    const s = await this.get(targetId);
    const audience = what === 'message' ? s.messageFrom : s.callFrom;
    if (audience === 'everyone') return;
    if (audience === 'contacts' && (await this.isContactOf(targetId, actorId)))
      return;
    throw new ForbiddenException({
      code: ErrorCode.PRIVACY_RESTRICTED,
      message:
        what === 'message'
          ? 'This person does not accept new chats from you.'
          : 'This person does not accept calls from you.',
      details: { what },
    });
  }
}
