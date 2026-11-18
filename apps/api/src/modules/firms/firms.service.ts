import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { primaryClient } from '../../prisma/primary-client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LegalAcceptanceService } from '../legal-documents/legal-acceptance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BidTeamService } from './bid-team.service';

export const FIRMS_FLAG = 'firm_profiles';
/** Firms audit 16.11 (PR-3): the admin settings' defaults (rule 11). */
const MAX_MEMBERS_DEFAULT = 50;
const INVITE_DAYS_DEFAULT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FirmMemberView {
  attorneyId: string;
  firstName: string | null;
  lastName: string | null;
  role: 'owner' | 'member';
  status: 'invited' | 'active';
  /** States of the member's verified licenses. */
  states: string[];
}

export interface FirmView {
  id: string;
  name: string;
  ownerId: string;
  /** Union of the active members' verified states. */
  states: string[];
  members: FirmMemberView[];
  /** Firms audit 16.11 (PR-3): the viewer's own pending invitation to this
   * firm is valid until then (ISO); null otherwise. */
  inviteExpiresAt: string | null;
}

/**
 * Owner 2026-10-14: a firm has no bar number; it is its lawyers. Each member
 * keeps their own licenses and verification, the firm's states are the union
 * of the active members' verified licenses, and a bid goes out from the
 * member who holds a matching license (the bid itself is still the lawyer's).
 */
@Injectable()
export class FirmsService {
  constructor(
    private readonly prisma: PrismaService,
    // R2B-1: the lawyer a bid is sent as must have accepted the current
    // legal documents themselves (the route guard checks only the caller).
    @Optional() private readonly acceptance?: LegalAcceptanceService,
    // Firms audit 16.11: a firm's events reach its lawyers (`firm_update`).
    @Optional() private readonly notifications?: NotificationsService,
    // Firms audit 16.11 (PR-3): `firms.max_members`, `firms.invite_expiry_days`.
    @Optional() private readonly settings?: AppSettingsService,
    // Firms audit 16.11 (PR-5): leaving the firm ends the bid-team access.
    @Optional() private readonly bidTeam?: BidTeamService,
  ) {}

  private async maxMembers(): Promise<number> {
    const n = await this.settings?.number('firms.max_members');
    return n && n > 0 ? n : MAX_MEMBERS_DEFAULT;
  }

  private async inviteDays(): Promise<number> {
    const n = await this.settings?.number('firms.invite_expiry_days');
    return n && n > 0 ? n : INVITE_DAYS_DEFAULT;
  }

  /** Active members plus the pending (unexpired) invitations of a firm. */
  private async headcount(firmId: string, except?: string): Promise<number> {
    const [active, invited] = await Promise.all([
      this.prisma.firmMember.count({
        where: { firm_id: firmId, status: 'active' },
      }),
      this.prisma.firmInvitation.count({
        where: {
          firm_id: firmId,
          expires_at: { gt: new Date() },
          ...(except ? { attorney_id: { not: except } } : {}),
        },
      }),
    ]);
    return active + invited;
  }

  /** The lawyer's newest valid invitation (the one «Моя фирма» shows). */
  private async newestInvitation(userId: string, firmId?: string) {
    return this.prisma.firmInvitation.findFirst({
      where: {
        attorney_id: userId,
        expires_at: { gt: new Date() },
        ...(firmId ? { firm_id: firmId } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { firm_id: 'asc' }],
    });
  }

  /** One `firm_update` row (bell + push) per lawyer; `kind` picks the
   * `notif.firm.<kind>` text. */
  private async notify(
    recipientIds: string[],
    kind: string,
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    for (const recipientId of recipientIds) {
      await this.notifications?.emit({
        type: 'firm_update',
        recipientId,
        payload: { kind, ...payload },
      });
    }
  }

  private async assertEnabled(): Promise<void> {
    const f = await this.prisma.featureFlag.findUnique({
      where: { key: FIRMS_FLAG },
    });
    if (!f?.enabled) {
      throw new ConflictException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Firm profiles are off.',
      });
    }
  }

  private async assertAttorney(userId: string): Promise<void> {
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });
    if (!p) throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
  }

  private async view(
    firmId: string,
    viewerIsMember: boolean,
    viewerId?: string,
  ): Promise<FirmView> {
    const now = new Date();
    const firm = await this.prisma.firm.findUnique({
      where: { id: firmId },
      include: {
        // Firms audit 16.11 (PR-3): legacy `invited` rows are not members;
        // invitations come from firm_invitations.
        members: { where: { status: 'active' } },
        invitations: {
          where: {
            expires_at: { gt: now },
            ...(viewerIsMember
              ? {}
              : { attorney_id: viewerId ? viewerId : { in: [] } }),
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!firm) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const members: { attorney_id: string; role: string; status: string }[] = [
      ...firm.members,
      ...firm.invitations
        .filter(
          (i) => !firm.members.some((m) => m.attorney_id === i.attorney_id),
        )
        .map((i) => ({
          attorney_id: i.attorney_id,
          role: 'member',
          status: 'invited',
        })),
    ];
    const mine = viewerId
      ? firm.invitations.find((i) => i.attorney_id === viewerId)
      : undefined;
    const ids = members.map((m) => m.attorney_id);
    const [users, licenses] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, first_name: true, last_name: true },
      }),
      this.prisma.attorneyLicense.findMany({
        where: { attorney_id: { in: ids }, license_status: 'verified' },
        select: { attorney_id: true, state_code: true },
      }),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    const statesOf = (id: string): string[] =>
      [
        ...new Set(
          licenses.filter((l) => l.attorney_id === id).map((l) => l.state_code),
        ),
      ].sort();
    const out: FirmMemberView[] = members.map((m) => ({
      attorneyId: m.attorney_id,
      firstName: byUser.get(m.attorney_id)?.first_name ?? null,
      lastName: byUser.get(m.attorney_id)?.last_name ?? null,
      role: m.role as 'owner' | 'member',
      status: m.status as 'invited' | 'active',
      states: statesOf(m.attorney_id),
    }));
    const states = [
      ...new Set(
        out.filter((m) => m.status === 'active').flatMap((m) => m.states),
      ),
    ].sort();
    return {
      id: firm.id,
      name: firm.name,
      ownerId: firm.owner_id,
      states,
      members: out,
      inviteExpiresAt:
        mine && !firm.members.some((m) => m.attorney_id === viewerId)
          ? mine.expires_at.toISOString()
          : null,
    };
  }

  /** The lawyer's ACTIVE membership. Firms audit 16.11 (PR-3): a legacy
   * `invited` row (before firm_invitations) is not a membership. */
  private async myMembership(userId: string) {
    const m = await this.prisma.firmMember.findUnique({
      where: { attorney_id: userId },
    });
    return m?.status === 'active' ? m : null;
  }

  /** attorney_id is unique in firm_members: a legacy `invited` row would
   * block the lawyer's real membership, so it goes first. */
  private async dropLegacyInvite(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<void> {
    await db.firmMember.deleteMany({
      where: { attorney_id: userId, status: 'invited' },
    });
  }

  async create(userId: string, name: string): Promise<FirmView> {
    await this.assertEnabled();
    await this.assertAttorney(userId);
    const clean = name.trim();
    if (clean.length < 2) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR });
    }
    if (await this.myMembership(userId)) {
      throw new ConflictException({
        code: ErrorCode.FIRM_ALREADY_MEMBER,
        message: 'You are already in a firm.',
      });
    }
    // A pending invitation never blocks starting one's own firm (PR-3).
    await this.dropLegacyInvite(this.prisma, userId);
    const firm = await this.prisma.firm.create({
      data: {
        name: clean,
        owner_id: userId,
        members: {
          create: { attorney_id: userId, role: 'owner', status: 'active' },
        },
      },
    });
    return this.view(firm.id, true);
  }

  /** The viewer's firm, or 404; invitations show to the invited lawyer. */
  async mine(userId: string): Promise<FirmView> {
    await this.assertEnabled();
    const m = await this.myMembership(userId);
    if (m) return this.view(m.firm_id, true, userId);
    // Firms audit 16.11 (PR-3): no firm yet — the newest valid invitation.
    const inv = await this.newestInvitation(userId);
    if (!inv) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    return this.view(inv.firm_id, false, userId);
  }

  /** Public page of a firm: active members and the union of their states. */
  async publicPage(firmId: string): Promise<FirmView> {
    await this.assertEnabled();
    return this.view(firmId, false);
  }

  private async ownedFirm(userId: string): Promise<string> {
    const m = await this.myMembership(userId);
    if (!m || m.role !== 'owner') {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
    }
    return m.firm_id;
  }

  async invite(userId: string, username: string): Promise<FirmView> {
    await this.assertEnabled();
    const firmId = await this.ownedFirm(userId);
    const target = await this.prisma.attorneyProfile.findUnique({
      where: {
        username_lower: username.trim().replace(/^@/, '').toLowerCase(),
      },
      select: { user_id: true },
    });
    if (!target) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const attorneyId = target.user_id;
    // Firms audit 16.11 (PR-3): invitations elsewhere do not matter, only
    // being in a firm already does.
    if (await this.myMembership(attorneyId)) {
      throw new ConflictException({
        code: ErrorCode.FIRM_ALREADY_MEMBER,
        message: 'This lawyer is already in a firm.',
      });
    }
    if (
      (await this.headcount(firmId, attorneyId)) >= (await this.maxMembers())
    ) {
      throw new ConflictException({ code: ErrorCode.FIRM_FULL });
    }
    const now = new Date();
    const expires = new Date(
      now.getTime() + (await this.inviteDays()) * DAY_MS,
    );
    // Inviting again renews the invitation (and tells the lawyer again).
    await this.prisma.firmInvitation.upsert({
      where: {
        firm_id_attorney_id: { firm_id: firmId, attorney_id: attorneyId },
      },
      create: {
        firm_id: firmId,
        attorney_id: attorneyId,
        invited_by: userId,
        created_at: now,
        expires_at: expires,
      },
      update: { invited_by: userId, created_at: now, expires_at: expires },
    });
    await this.notify([attorneyId], 'invite', { firmId, actorId: userId });
    return this.view(firmId, true, userId);
  }

  /** Accept an invitation: the one to [firmId], else the newest. The other
   * invitations of the lawyer go (one firm at a time). */
  async accept(userId: string, firmId?: string): Promise<FirmView> {
    await this.assertEnabled();
    if (await this.myMembership(userId)) {
      throw new ConflictException({
        code: ErrorCode.FIRM_ALREADY_MEMBER,
        message: 'You are already in a firm.',
      });
    }
    const inv = await this.newestInvitation(userId, firmId);
    if (!inv) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const max = await this.maxMembers();
    // Verify 17.11 (batch 9): only a lawyer joins a firm — one who switched
    // to a client account kept the invitation and became a member the owner
    // could send bids as.
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (me?.role !== 'attorney' || me.status !== 'active') {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
    }
    try {
      await primaryClient(this.prisma).$transaction(async (tx) => {
        // Verify 17.11: the member limit was counted outside the
        // transaction (parallel accepts went past it) and the invitation
        // was not read again (one withdrawn, or a firm closed meanwhile,
        // was still accepted). The firm row is locked — accepts and a
        // close run one at a time — and both are checked under it.
        const firm = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text FROM firms WHERE id = ${inv.firm_id}::uuid FOR UPDATE`;
        const still = await tx.firmInvitation.findFirst({
          where: {
            firm_id: inv.firm_id,
            attorney_id: userId,
            expires_at: { gt: new Date() },
          },
          select: { firm_id: true },
        });
        if (firm.length === 0 || !still) {
          throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
        }
        const active = await tx.firmMember.count({
          where: { firm_id: inv.firm_id, status: 'active' },
        });
        if (active >= max) {
          throw new ConflictException({ code: ErrorCode.FIRM_FULL });
        }
        await this.dropLegacyInvite(tx, userId);
        await tx.firmMember.create({
          data: { firm_id: inv.firm_id, attorney_id: userId, status: 'active' },
        });
        await tx.firmInvitation.deleteMany({ where: { attorney_id: userId } });
      });
    } catch (e) {
      // Two firms accepted at once: UQ firm_members.attorney_id.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: ErrorCode.FIRM_ALREADY_MEMBER,
          message: 'You are already in a firm.',
        });
      }
      throw e;
    }
    return this.view(inv.firm_id, true, userId);
  }

  /** Decline an invitation, leave the firm, or (the owner) remove someone. */
  async remove(userId: string, attorneyId: string): Promise<void> {
    await this.assertEnabled();
    const mine = await this.myMembership(userId);
    if (!mine) {
      // Firms audit 16.11 (PR-3): declining = the invitation «Моя фирма»
      // shows (the newest valid one) goes.
      const inv =
        attorneyId === userId ? await this.newestInvitation(userId) : null;
      if (!inv) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
      await this.prisma.firmInvitation.deleteMany({
        where: { firm_id: inv.firm_id, attorney_id: userId },
      });
      await this.dropLegacyInvite(this.prisma, userId);
      return;
    }
    if (attorneyId !== userId && mine.role !== 'owner') {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
    }
    const target = await this.myMembership(attorneyId);
    if (!target || target.firm_id !== mine.firm_id) {
      // The owner withdraws an invitation of his firm.
      const gone =
        attorneyId !== userId
          ? await this.prisma.firmInvitation.deleteMany({
              where: { firm_id: mine.firm_id, attorney_id: attorneyId },
            })
          : { count: 0 };
      if (gone.count === 0) {
        throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
      }
      return;
    }
    if (target.role === 'owner') {
      // Firms audit 16.11 (PR-2): like a GitHub organisation or a WhatsApp
      // community, the owner hands the firm over first. Alone (no other
      // active lawyer) leaving closes it, and pending invitations are told.
      const others = await this.prisma.firmMember.count({
        where: {
          firm_id: mine.firm_id,
          status: 'active',
          attorney_id: { not: userId },
        },
      });
      if (others > 0) {
        throw new ConflictException({
          code: ErrorCode.FIRM_OWNER_MUST_TRANSFER,
          message: 'Make another lawyer the owner, or close the firm.',
        });
      }
      await this.closeFirm(mine.firm_id, userId, true);
      return;
    }
    await this.prisma.firmMember.delete({ where: { attorney_id: attorneyId } });
    await this.bidTeam?.revoke([attorneyId]);
  }

  /** Firms audit 16.11 (PR-2): the owner makes an active member the owner
   * and stays in the firm as a member. The new owner is told. */
  async transferOwnership(
    userId: string,
    attorneyId: string,
  ): Promise<FirmView> {
    await this.assertEnabled();
    const firmId = await this.ownedFirm(userId);
    if (attorneyId === userId) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR });
    }
    await this.prisma.$transaction((tx) =>
      this.handOver(tx, firmId, userId, attorneyId),
    );
    await this.notify([attorneyId], 'owner_transferred', {
      firmId,
      actorId: userId,
    });
    return this.view(firmId, true, userId);
  }

  /** Firms audit 16.11 (PR-2): the owner closes the firm; every other
   * lawyer in it (and anyone invited) is told. */
  async close(userId: string): Promise<void> {
    await this.assertEnabled();
    const firmId = await this.ownedFirm(userId);
    await this.closeFirm(firmId, userId);
  }

  /** Moves ownership inside one transaction. The conditional update makes
   * two racing hand-overs safe: only the call that still sees [fromId] as
   * the owner wins. */
  private async handOver(
    tx: Prisma.TransactionClient,
    firmId: string,
    fromId: string,
    toId: string,
  ): Promise<void> {
    const target = await tx.firmMember.findUnique({
      where: { attorney_id: toId },
    });
    if (!target || target.firm_id !== firmId || target.status !== 'active') {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    const moved = await tx.firm.updateMany({
      where: { id: firmId, owner_id: fromId },
      data: { owner_id: toId },
    });
    if (moved.count !== 1) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
    }
    await tx.firmMember.updateMany({
      where: { firm_id: firmId, attorney_id: fromId },
      data: { role: 'member' },
    });
    await tx.firmMember.update({
      where: { attorney_id: toId },
      data: { role: 'owner' },
    });
  }

  private async closeFirm(
    firmId: string,
    actorId: string | null,
    aloneOnly = false,
  ) {
    const notMe = actorId ? { attorney_id: { not: actorId } } : {};
    // Verify 17.11 (batch 9): an accept committed between "alone?" and
    // the delete lost its new member silently. The close re-checks under
    // the firm row lock that accepts take. Only the owner's «leave» while
    // alone asks this; «Close the firm» closes it with everyone in it.
    if (aloneOnly) {
      const joined = await primaryClient(this.prisma).$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM firms WHERE id = ${firmId}::uuid FOR UPDATE`;
          return tx.firmMember.count({
            where: { firm_id: firmId, status: 'active', ...notMe },
          });
        },
      );
      if (joined > 0) {
        throw new ConflictException({
          code: ErrorCode.FIRM_OWNER_MUST_TRANSFER,
          message: 'Make another lawyer the owner, or close the firm.',
        });
      }
    }
    const [members, invited] = await Promise.all([
      this.prisma.firmMember.findMany({
        where: { firm_id: firmId, ...notMe },
        select: { attorney_id: true },
      }),
      this.prisma.firmInvitation.findMany({
        where: { firm_id: firmId, expires_at: { gt: new Date() }, ...notMe },
        select: { attorney_id: true },
      }),
    ]);
    const others = [
      ...new Set([...members, ...invited].map((o) => o.attorney_id)),
    ];
    const all = await this.prisma.firmMember.findMany({
      where: { firm_id: firmId },
      select: { attorney_id: true },
    });
    const gone = await this.prisma.firm.deleteMany({ where: { id: firmId } });
    if (gone.count === 0) return;
    await this.bidTeam?.revoke(all.map((m) => m.attorney_id));
    await this.notify(
      others,
      'closed',
      actorId ? { firmId, actorId } : { firmId },
    );
  }

  /**
   * Firms audit 16.11 (PR-2): the account of a firm lawyer is erased. A
   * member simply leaves. The owner's firm goes to the longest-standing
   * active member (earliest to join), who is told; with nobody left it is
   * closed. Runs whatever the `firm_profiles` switch says: a firm must
   * never keep a deleted owner.
   */
  async onAccountErased(userId: string): Promise<void> {
    await this.prisma.firmInvitation.deleteMany({
      where: { attorney_id: userId },
    });
    await this.dropLegacyInvite(this.prisma, userId);
    const m = await this.myMembership(userId);
    if (!m) return;
    if (m.role !== 'owner') {
      await this.prisma.firmMember.deleteMany({
        where: { attorney_id: userId },
      });
      await this.bidTeam?.revoke([userId]);
      return;
    }
    const heir = await this.prisma.firmMember.findFirst({
      where: {
        firm_id: m.firm_id,
        status: 'active',
        attorney_id: { not: userId },
      },
      orderBy: [{ created_at: 'asc' }, { attorney_id: 'asc' }],
      select: { attorney_id: true },
    });
    if (!heir) {
      await this.closeFirm(m.firm_id, userId);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.handOver(tx, m.firm_id, userId, heir.attorney_id);
      await tx.firmMember.deleteMany({ where: { attorney_id: userId } });
    });
    await this.bidTeam?.revoke([userId]);
    await this.notify([heir.attorney_id], 'owner_transferred', {
      firmId: m.firm_id,
    });
  }

  /** Firms audit 16.11 (PR-4, owner): the lawyer's firm and the other
   * active lawyers in it (with names, for the «colleague already bid»
   * answer); null without a firm or with the switch off. One firm bid per
   * case is checked against these. */
  async colleaguesOf(attorneyId: string): Promise<{
    firmId: string;
    colleagues: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    }[];
  } | null> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: FIRMS_FLAG },
      select: { enabled: true },
    });
    if (!flag?.enabled) return null;
    const m = await this.myMembership(attorneyId);
    if (!m) return null;
    const rows = await this.prisma.firmMember.findMany({
      where: {
        firm_id: m.firm_id,
        status: 'active',
        attorney_id: { not: attorneyId },
      },
      select: { attorney_id: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.attorney_id) } },
      select: { id: true, first_name: true, last_name: true },
    });
    return {
      firmId: m.firm_id,
      colleagues: users.map((u) => ({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
      })),
    };
  }

  /** The lawyer a bid is sent as. R2B-1 (14.11): only the firm owner picks
   * another member (like an org owner acting for the org on GitHub); the
   * sender is an active member whose verified licence fits the case and who
   * has accepted the current legal documents. A plain member sends only as
   * themselves. */
  async resolveSender(
    callerId: string,
    senderId: string,
    caseId: string,
  ): Promise<string> {
    if (senderId === callerId) return callerId;
    await this.assertEnabled();
    const fit = await this.eligibleForCase(callerId, caseId);
    if (!fit.some((m) => m.attorneyId === senderId)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This lawyer cannot send a bid on this case for the firm.',
      });
    }
    // Verify 17.11 (batch 9): the sender is a lawyer with a live account
    // (a member who switched to a client account or was suspended is not
    // someone a bid goes out as).
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { role: true, status: true },
    });
    if (sender?.role !== 'attorney' || sender.status !== 'active') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This lawyer cannot send a bid on this case for the firm.',
      });
    }
    await this.acceptance?.assertAccepted(senderId);
    return senderId;
  }

  /** Members who can bid on a case: an active, verified licence in one of
   * the case's states. The firm owner picks who sends the bid, so a plain
   * member sees only themselves (R2B-1). */
  async eligibleForCase(
    userId: string,
    caseId: string,
  ): Promise<FirmMemberView[]> {
    await this.assertEnabled();
    const m = await this.myMembership(userId);
    if (!m || m.status !== 'active') {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    const isOwner = m.role === 'owner';
    const c = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        primary_state_code: true,
        states: { select: { state_code: true } },
      },
    });
    if (!c) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const wanted = new Set([
      c.primary_state_code,
      ...c.states.map((s) => s.state_code),
    ]);
    const firm = await this.view(m.firm_id, false);
    return firm.members.filter(
      (x) =>
        (isOwner || x.attorneyId === userId) &&
        x.states.some((s) => wanted.has(s)),
    );
  }
}
