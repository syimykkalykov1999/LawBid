import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { PrivacyAudience } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsConsentService } from '../analytics/analytics-consent.service';
import {
  AUDIENCE_BITS,
  type AudienceOption,
  effectiveMask,
  type LegacyAudience,
  legacyFromMask,
  maskFromLegacy,
  maskFromOptions,
  optionsFromMask,
} from './privacy-audience';

export const PRIVACY_FIELDS = [
  'lastSeen',
  'messageFrom',
  'callFrom',
  'photoFrom',
  'aboutFrom',
  'groupAddFrom',
] as const;
export type PrivacyField = (typeof PRIVACY_FIELDS)[number];

/** API field → DB column (the old enum; its mask is `<column>_mask`). */
const COLUMN = {
  lastSeen: 'last_seen',
  messageFrom: 'message_from',
  callFrom: 'call_from',
  photoFrom: 'photo_from',
  aboutFrom: 'about_from',
  groupAddFrom: 'group_add_from',
} as const satisfies Record<PrivacyField, string>;
type Column = (typeof COLUMN)[PrivacyField];
type MaskColumn = `${Column}_mask`;

export interface PrivacySettings {
  /** The closest old value (old app builds read these). */
  lastSeen: LegacyAudience;
  messageFrom: LegacyAudience;
  callFrom: LegacyAudience;
  photoFrom: LegacyAudience;
  aboutFrom: LegacyAudience;
  groupAddFrom: LegacyAudience;
  /** Owner 2026-10-28: the real sets (contacts / followers / following). */
  lastSeenAudiences: AudienceOption[];
  messageFromAudiences: AudienceOption[];
  callFromAudiences: AudienceOption[];
  photoFromAudiences: AudienceOption[];
  aboutFromAudiences: AudienceOption[];
  groupAddFromAudiences: AudienceOption[];
  /** Owner 2026-10-22 (CCPA/CPRA «Do not sell or share my personal
   * information»): true = opted out. Stored as an append-only
   * `do_not_sell` consent row (latest wins), so the choice is in the data
   * export and the journal. */
  doNotSell: boolean;
}

/** A partial change: the old single value or the new set, per field. */
export type PrivacyPatch = Partial<
  Record<PrivacyField, LegacyAudience> &
    Record<`${PrivacyField}Audiences`, AudienceOption[]> & {
      doNotSell: boolean;
    }
>;

const everyone = (): AudienceOption[] => ['everyone'];

export const DEFAULT_PRIVACY: PrivacySettings = {
  lastSeen: 'everyone',
  messageFrom: 'everyone',
  callFrom: 'everyone',
  photoFrom: 'everyone',
  aboutFrom: 'everyone',
  groupAddFrom: 'everyone',
  lastSeenAudiences: everyone(),
  messageFromAudiences: everyone(),
  callFromAudiences: everyone(),
  photoFromAudiences: everyone(),
  aboutFromAudiences: everyone(),
  groupAddFromAudiences: everyone(),
  doNotSell: false,
};

export interface PrivacyPatchMeta {
  ip?: string;
}

type PrivacyRow = Partial<
  Record<Column, PrivacyAudience> & Record<MaskColumn, number | null>
>;

const maskOf = (row: PrivacyRow | undefined | null, field: PrivacyField) => {
  const col = COLUMN[field];
  return effectiveMask(row?.[`${col}_mask`], row?.[col]);
};

const ACTION_FIELD = {
  message: 'messageFrom',
  call: 'callFrom',
  group: 'groupAddFrom',
} as const;

/**
 * Owner 2026-10-20: who may see my "last seen", photo, "about", write to me
 * first, call me and add me to groups. Owner 2026-10-28: each is a set of
 * everyone / my contacts (phone-book people in LawBid, contact_matches) /
 * my followers / people I follow / nobody (privacy-audience.ts). A case in
 * work keeps its chat and calls whatever the settings say (callers check
 * caseWorkOngoing), and existing chats stay open.
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
    const out = { ...DEFAULT_PRIVACY, doNotSell };
    for (const f of PRIVACY_FIELDS) {
      const mask = maskOf(row, f);
      out[f] = legacyFromMask(mask);
      out[`${f}Audiences`] = optionsFromMask(mask);
    }
    return out;
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
    patch: PrivacyPatch,
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
    const masks = new Map<PrivacyField, number>();
    for (const f of PRIVACY_FIELDS) {
      // The new set wins; an old build's single value means what it meant
      // (its «contacts» = phone book or people I follow).
      const set = patch[`${f}Audiences`];
      const one = patch[f];
      if (set && set.length > 0) masks.set(f, maskFromOptions(set));
      else if (one) masks.set(f, maskFromLegacy(one));
    }
    if (masks.size === 0) return this.get(userId);
    return this.updateAudiences(userId, masks);
  }

  private async updateAudiences(
    userId: string,
    masks: Map<PrivacyField, number>,
  ): Promise<PrivacySettings> {
    const data: Record<string, unknown> = {};
    for (const [f, mask] of masks) {
      // Both columns: the old one keeps a release that is one version older
      // (rolling deploy, rollback) close to the truth.
      data[COLUMN[f]] = legacyFromMask(mask);
      data[`${COLUMN[f]}_mask`] = mask;
    }
    const lastSeen = masks.get('lastSeen');
    await this.prisma.$transaction(async (tx) => {
      await tx.userPrivacySettings.upsert({
        where: { user_id: userId },
        create: { user_id: userId, ...data },
        update: data,
      });
      // The old switch (Settings → activity status) stays in step: it is
      // what hides the viewer's own view of others (reciprocal).
      if (lastSeen !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { show_activity_status: lastSeen !== 0 },
        });
      }
    });
    return this.get(userId);
  }

  /** The old on/off switch maps to everyone / nobody. */
  async setActivityVisible(userId: string, show: boolean): Promise<void> {
    await this.update(userId, { lastSeen: show ? 'everyone' : 'nobody' });
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
    const f: PrivacyField =
      field === 'last_seen'
        ? 'lastSeen'
        : field === 'photo_from'
          ? 'photoFrom'
          : 'aboutFrom';
    return this.audienceAllows(viewerId, ownerIds, f);
  }

  /**
   * Which of [ownerIds] let [viewerId] in for [field]. At most four
   * indexed queries for any number of owners: the owners' settings, then
   * only the relations their sets ask about (contact_matches PK,
   * follows PK and follows(followee_id, follower_id)).
   */
  private async audienceAllows(
    viewerId: string,
    ownerIds: string[],
    field: PrivacyField,
  ): Promise<Set<string>> {
    const ids = [...new Set(ownerIds)];
    if (ids.length === 0) return new Set();
    const col = COLUMN[field];
    const rows = (await this.prisma.userPrivacySettings.findMany({
      where: { user_id: { in: ids } },
      select: { user_id: true, [col]: true, [`${col}_mask`]: true },
    })) as unknown as (PrivacyRow & { user_id: string })[];
    const masks = new Map<string, number>(
      rows.map((r) => [r.user_id, maskOf(r, field)]),
    );
    const maskFor = (id: string) => masks.get(id) ?? AUDIENCE_BITS.everyone;
    const need = (bit: number) =>
      ids.filter((id) => id !== viewerId && (maskFor(id) & bit) !== 0);
    const rel = await this.relationsOf(viewerId, {
      contacts: need(AUDIENCE_BITS.contacts),
      followers: need(AUDIENCE_BITS.followers),
      following: need(AUDIENCE_BITS.following),
    });
    return new Set(
      ids.filter((id) => {
        if (id === viewerId) return true;
        const m = maskFor(id);
        if (m & AUDIENCE_BITS.everyone) return true;
        return (
          ((m & AUDIENCE_BITS.contacts) !== 0 && rel.contacts.has(id)) ||
          ((m & AUDIENCE_BITS.followers) !== 0 && rel.followers.has(id)) ||
          ((m & AUDIENCE_BITS.following) !== 0 && rel.following.has(id))
        );
      }),
    );
  }

  /**
   * For [viewerId] and some owners: which owners have the viewer in their
   * phone book (contacts), are followed by the viewer (followers: the
   * viewer follows the owner) and follow the viewer (following: the owner
   * follows the viewer). Empty lists cost no query.
   */
  private async relationsOf(
    viewerId: string,
    owners: { contacts: string[]; followers: string[]; following: string[] },
  ): Promise<{
    contacts: Set<string>;
    followers: Set<string>;
    following: Set<string>;
  }> {
    const none = Promise.resolve([] as string[]);
    const [contacts, followers, following] = await Promise.all([
      owners.contacts.length === 0
        ? none
        : this.prisma.contactMatch
            .findMany({
              where: {
                matched_id: viewerId,
                owner_id: { in: owners.contacts },
              },
              select: { owner_id: true },
            })
            .then((r) => r.map((x) => x.owner_id)),
      owners.followers.length === 0
        ? none
        : this.prisma.follow
            .findMany({
              where: {
                follower_id: viewerId,
                followee_id: { in: owners.followers },
              },
              select: { followee_id: true },
            })
            .then((r) => r.map((x) => x.followee_id)),
      owners.following.length === 0
        ? none
        : this.prisma.follow
            .findMany({
              where: {
                followee_id: viewerId,
                follower_id: { in: owners.following },
              },
              select: { follower_id: true },
            })
            .then((r) => r.map((x) => x.follower_id)),
    ]);
    return {
      contacts: new Set(contacts),
      followers: new Set(followers),
      following: new Set(following),
    };
  }

  /**
   * Of [targetIds], the ones whose settings let [actorId] do [what]
   * (batch [allows]: a few queries for the whole list, no N+1).
   */
  allowsMany(
    actorId: string,
    targetIds: string[],
    what: 'message' | 'call' | 'group',
  ): Promise<Set<string>> {
    return this.audienceAllows(actorId, targetIds, ACTION_FIELD[what]);
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
    const ok = await this.audienceAllows(
      actorId,
      [targetId],
      ACTION_FIELD[what],
    );
    if (ok.has(targetId)) return;
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
