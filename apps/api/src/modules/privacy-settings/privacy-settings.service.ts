import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { Prisma, PrismaClient, PrivacyAudience } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsConsentService } from '../analytics/analytics-consent.service';

type Db = Prisma.TransactionClient | PrismaClient;

export interface PrivacySettings {
  lastSeen: PrivacyAudience;
  messageFrom: PrivacyAudience;
  callFrom: PrivacyAudience;
  photoFrom: PrivacyAudience;
  aboutFrom: PrivacyAudience;
  groupAddFrom: PrivacyAudience;
  /** Owner 2026-10-22 (CCPA/CPRA «Do not sell or share my personal
   * information»): true = opted out. Stored as an append-only
   * `do_not_sell` consent row (latest wins), so the choice is in the data
   * export and the journal. */
  doNotSell: boolean;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  lastSeen: 'everyone',
  messageFrom: 'everyone',
  callFrom: 'everyone',
  photoFrom: 'everyone',
  aboutFrom: 'everyone',
  groupAddFrom: 'everyone',
  doNotSell: false,
};

export interface PrivacyPatchMeta {
  ip?: string;
}

/**
 * Owner 2026-10-20: who may see my "last seen", write to me first and call
 * me. "Contacts" of a person are the people in their phone book who use
 * LawBid (contact_matches) and the people they follow. A case in work keeps
 * its chat and calls whatever the settings say (see caseWorkOngoing).
 */
@Injectable()
export class PrivacySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly analyticsConsent?: AnalyticsConsentService,
  ) {}

  async get(userId: string): Promise<PrivacySettings> {
    const [row, doNotSell] = await Promise.all([
      this.prisma.userPrivacySettings.findUnique({
        where: { user_id: userId },
      }),
      this.doNotSell(userId),
    ]);
    return row
      ? {
          lastSeen: row.last_seen,
          messageFrom: row.message_from,
          callFrom: row.call_from,
          photoFrom: row.photo_from,
          aboutFrom: row.about_from,
          groupAddFrom: row.group_add_from,
          doNotSell,
        }
      : { ...DEFAULT_PRIVACY, doNotSell };
  }

  /** The latest `do_not_sell` answer (false when never set). */
  async doNotSell(userId: string): Promise<boolean> {
    const row = await this.prisma.userConsent.findFirst({
      where: { user_id: userId, consent_type: 'do_not_sell' },
      orderBy: { created_at: 'desc' },
      select: { granted: true },
    });
    return row?.granted ?? false;
  }

  async update(
    userId: string,
    patch: Partial<PrivacySettings>,
    meta: PrivacyPatchMeta = {},
  ): Promise<PrivacySettings> {
    if (typeof patch.doNotSell === 'boolean') {
      // Append-only, like every consent; the analytics gate reads the
      // latest row (cached), so drop that cache at once.
      await this.prisma.userConsent.create({
        data: {
          user_id: userId,
          consent_type: 'do_not_sell',
          granted: patch.doNotSell,
          ip: meta.ip,
        },
      });
      await this.analyticsConsent?.invalidate(userId);
    }
    const audience = { ...patch };
    delete audience.doNotSell;
    if (Object.keys(audience).length === 0) return this.get(userId);
    return this.updateAudiences(userId, audience);
  }

  private async updateAudiences(
    userId: string,
    patch: Partial<PrivacySettings>,
  ): Promise<PrivacySettings> {
    const data = {
      ...(patch.lastSeen ? { last_seen: patch.lastSeen } : {}),
      ...(patch.messageFrom ? { message_from: patch.messageFrom } : {}),
      ...(patch.callFrom ? { call_from: patch.callFrom } : {}),
      ...(patch.photoFrom ? { photo_from: patch.photoFrom } : {}),
      ...(patch.aboutFrom ? { about_from: patch.aboutFrom } : {}),
      ...(patch.groupAddFrom ? { group_add_from: patch.groupAddFrom } : {}),
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
  lastSeenVisibleTo(
    viewerId: string,
    ownerIds: string[],
  ): Promise<Set<string>> {
    return this.visibleTo(viewerId, ownerIds, 'last_seen');
  }

  /**
   * Which of [ownerIds] let [viewerId] see their profile photo / "about"
   * (the viewer always sees their own).
   */
  visibleTo(
    viewerId: string,
    ownerIds: string[],
    field: 'last_seen' | 'photo_from' | 'about_from',
  ): Promise<Set<string>> {
    return this.audienceAllows(viewerId, ownerIds, field);
  }

  private async audienceAllows(
    viewerId: string,
    ownerIds: string[],
    field: 'last_seen' | 'photo_from' | 'about_from',
  ): Promise<Set<string>> {
    if (ownerIds.length === 0) return new Set();
    const rows = await this.prisma.userPrivacySettings.findMany({
      where: { user_id: { in: ownerIds } },
      select: {
        user_id: true,
        last_seen: true,
        photo_from: true,
        about_from: true,
      },
    });
    const audience = new Map<string, PrivacyAudience>(
      rows.map((r) => [r.user_id, r[field]]),
    );
    const needContact = ownerIds.filter(
      (id) => audience.get(id) === 'contacts',
    );
    const contacts = await this.contactsAmong(viewerId, needContact);
    return new Set(
      ownerIds.filter((id) => {
        if (id === viewerId) return true;
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
   * Owner 2026-10-21: strangers do not get to ring or add each other — they
   * go through «Requests» first. Two people are connected when a chat
   * between them was accepted (a case chat counts), or one has the other in
   * their phone book. Judged on the chat's state, not on who follows whom:
   * an unfollow leaves an accepted chat open.
   */
  async isConnected(a: string, b: string): Promise<boolean> {
    if (a === b) return true;
    const [chat, book] = await Promise.all([
      this.prisma.conversation.findFirst({
        where: {
          OR: [
            { client_id: a, attorney_id: b },
            { client_id: b, attorney_id: a },
          ],
          request_status: { in: ['none', 'accepted'] },
          contacts_unlocked: true,
        },
        select: { id: true },
      }),
      this.prisma.contactMatch.findFirst({
        where: {
          OR: [
            { owner_id: a, matched_id: b },
            { owner_id: b, matched_id: a },
          ],
        },
        select: { owner_id: true },
      }),
    ]);
    return chat !== null || book !== null;
  }

  /** Non-throwing [assertAllowed]. */
  async allows(
    actorId: string,
    targetId: string,
    what: 'message' | 'call' | 'group',
  ): Promise<boolean> {
    try {
      await this.assertAllowed(actorId, targetId, what);
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
  }

  /**
   * 403 PRIVACY_RESTRICTED when [targetId]'s settings keep [actorId] from
   * [what] ("message" starts a chat, "call" rings them, "group" adds them
   * to a group chat — for the groups module to call per invited person).
   */
  async assertAllowed(
    actorId: string,
    targetId: string,
    what: 'message' | 'call' | 'group',
  ): Promise<void> {
    if (actorId === targetId) return;
    const s = await this.get(targetId);
    const audience =
      what === 'message'
        ? s.messageFrom
        : what === 'call'
          ? s.callFrom
          : s.groupAddFrom;
    if (audience === 'everyone') return;
    if (audience === 'contacts' && (await this.isContactOf(targetId, actorId)))
      return;
    throw new ForbiddenException({
      code: ErrorCode.PRIVACY_RESTRICTED,
      message:
        what === 'message'
          ? 'This person does not accept new chats from you.'
          : what === 'call'
            ? 'This person does not accept calls from you.'
            : 'This person does not let you add them to groups.',
      details: { what },
    });
  }
}
