import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import {
  conversationRoom,
  RealtimePublisher,
} from '../realtime/realtime-publisher.service';

/** Same key as FirmsService.FIRMS_FLAG (kept here so this file has no
 * import of the firms service: chat, cases and bids all read it). */
const FIRMS_FLAG = 'firm_profiles';

/** A bid as the team checks need it. */
export interface TeamBid {
  id: string;
  case_id: string;
  attorney_id: string;
}

export interface TeamMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Firms audit 16.11 (PR-5, owner): the firm's team on a bid, the way a
 * shared matter team works in Clio / MyCase. A lawyer who joined a
 * colleague's bid (`bid_participants`, PR-4) works on that bid's chat and,
 * once it is accepted, on the case — on the attorney's side of every
 * existing check (CaseAccessPolicy, the workspace roles, the chat rules).
 *
 * A member counts only while ALL of this holds, read live on every check
 * (so leaving or being removed from the firm takes the access away at
 * once, even before the cleanup below runs):
 *  - the `firm_profiles` switch is on;
 *  - a `bid_participants` row joins the lawyer to the bid;
 *  - the lawyer and the bid's attorney are active members of one firm.
 */
@Injectable()
export class BidTeamService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly realtime?: RealtimePublisher,
  ) {}

  /** The admin switch «Фирмы» (`firm_profiles`, off when missing). */
  async enabled(): Promise<boolean> {
    if (this.flags) return this.flags.isEnabled(FIRMS_FLAG, false);
    const f = await this.prisma.featureFlag.findUnique({
      where: { key: FIRMS_FLAG },
      select: { enabled: true },
    });
    return f?.enabled ?? false;
  }

  /** Of [candidates], those in the same firm as [leadId], both active. */
  private async sameFirm(
    leadId: string,
    candidates: string[],
  ): Promise<Set<string>> {
    if (candidates.length === 0) return new Set();
    const rows = await this.prisma.firmMember.findMany({
      where: {
        attorney_id: { in: [leadId, ...candidates] },
        status: 'active',
      },
      select: { attorney_id: true, firm_id: true },
    });
    const firm = rows.find((r) => r.attorney_id === leadId)?.firm_id;
    if (!firm) return new Set();
    return new Set(
      rows
        .filter((r) => r.firm_id === firm && r.attorney_id !== leadId)
        .map((r) => r.attorney_id),
    );
  }

  /** The ids of the bid's live team (the bid's own attorney not included). */
  async teamIds(bid: Pick<TeamBid, 'id' | 'attorney_id'>): Promise<string[]> {
    if (!(await this.enabled())) return [];
    const rows = await this.prisma.bidParticipant.findMany({
      where: { bid_id: bid.id },
      select: { attorney_id: true },
      orderBy: [{ created_at: 'asc' }, { attorney_id: 'asc' }],
    });
    const ok = await this.sameFirm(
      bid.attorney_id,
      rows.map((r) => r.attorney_id),
    );
    return rows.map((r) => r.attorney_id).filter((id) => ok.has(id));
  }

  /** The live team with names (the client's «Lawyers» on the bid). */
  async team(bid: Pick<TeamBid, 'id' | 'attorney_id'>): Promise<TeamMember[]> {
    const ids = await this.teamIds(bid);
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, first_name: true, last_name: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids.flatMap((id) => {
      const u = byId.get(id);
      return u ? [{ id, firstName: u.first_name, lastName: u.last_name }] : [];
    });
  }

  /** Whether [userId] is on the live team of [bid]. */
  async isMember(
    userId: string,
    bid: Pick<TeamBid, 'id' | 'attorney_id'>,
  ): Promise<boolean> {
    if (userId === bid.attorney_id || !(await this.enabled())) return false;
    const row = await this.prisma.bidParticipant.findUnique({
      where: { bid_id_attorney_id: { bid_id: bid.id, attorney_id: userId } },
      select: { bid_id: true },
    });
    if (!row) return false;
    return (await this.sameFirm(bid.attorney_id, [userId])).has(userId);
  }

  /** The live bid (active or accepted) on [caseId] that [userId] joined as
   * a team member, or null. */
  async joinedBidOnCase(
    userId: string,
    caseId: string,
  ): Promise<TeamBid | null> {
    if (!(await this.enabled())) return null;
    const rows = await this.prisma.bidParticipant.findMany({
      where: {
        attorney_id: userId,
        bid: { case_id: caseId, status: { in: ['active', 'accepted'] } },
      },
      select: {
        bid: { select: { id: true, case_id: true, attorney_id: true } },
      },
      take: 5,
    });
    for (const r of rows) {
      if ((await this.sameFirm(r.bid.attorney_id, [userId])).has(userId)) {
        return r.bid;
      }
    }
    return null;
  }

  /** The firm bid behind a case chat (the chat of the bid's attorney on
   * that case), or null for any other chat. */
  async bidOfChat(conv: {
    case_id: string | null;
    attorney_id: string;
    bid_id: string | null;
  }): Promise<TeamBid | null> {
    if (!conv.case_id) return null;
    if (conv.bid_id) {
      return this.prisma.bid.findFirst({
        where: { id: conv.bid_id, attorney_id: conv.attorney_id },
        select: { id: true, case_id: true, attorney_id: true },
      });
    }
    return this.prisma.bid.findFirst({
      where: {
        case_id: conv.case_id,
        attorney_id: conv.attorney_id,
        status: { in: ['active', 'accepted'] },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { id: true, case_id: true, attorney_id: true },
    });
  }

  /** The live team of a case chat ([] for any other chat, or the switch
   * off — no query then beyond the cached switch). */
  async teamOfChat(conv: {
    case_id: string | null;
    attorney_id: string;
    bid_id: string | null;
  }): Promise<string[]> {
    if (!conv.case_id || !(await this.enabled())) return [];
    const bid = await this.bidOfChat(conv);
    return bid ? this.teamIds(bid) : [];
  }

  /** Whether [userId] works on this case chat as a member of the firm's
   * team (the chat's own two sides are checked by the caller). */
  async inChat(
    userId: string,
    conv: {
      case_id: string | null;
      attorney_id: string;
      bid_id: string | null;
    },
  ): Promise<boolean> {
    if (!conv.case_id || !(await this.enabled())) return false;
    const bid = await this.bidOfChat(conv);
    return bid ? this.isMember(userId, bid) : false;
  }

  /** The case chats [userId] works on as a team member (their chat list). */
  async chatIdsOf(userId: string): Promise<string[]> {
    if (!(await this.enabled())) return [];
    // Verify 17.11 (batch 9): one firm query per joined bid ran on every
    // chat-list request (up to 200 in a row), and `take` had no order, so
    // past the cap an arbitrary set of chats was dropped. A lawyer is in
    // one firm: its active lawyers are read once and the joins are
    // filtered by them in the same query, newest first.
    const me = await this.prisma.firmMember.findFirst({
      where: { attorney_id: userId, status: 'active' },
      select: { firm_id: true },
    });
    if (!me) return [];
    const colleagues = await this.prisma.firmMember.findMany({
      where: { firm_id: me.firm_id, status: 'active' },
      select: { attorney_id: true },
    });
    const rows = await this.prisma.bidParticipant.findMany({
      where: {
        attorney_id: userId,
        bid: {
          status: { in: ['active', 'accepted'] },
          attorney_id: {
            in: colleagues.map((c) => c.attorney_id),
            not: userId,
          },
        },
      },
      select: {
        bid: { select: { id: true, case_id: true, attorney_id: true } },
      },
      orderBy: [{ created_at: 'desc' }, { bid_id: 'desc' }],
      take: 200,
    });
    const live: TeamBid[] = rows.map((r) => r.bid);
    if (live.length === 0) return [];
    const convs = await this.prisma.conversation.findMany({
      where: {
        OR: live.map((b) => ({
          case_id: b.case_id,
          attorney_id: b.attorney_id,
        })),
      },
      select: { id: true },
    });
    return convs.map((c) => c.id);
  }

  /**
   * Leaving or being removed from a firm (or the firm closing): the
   * lawyers' joins go — both the bids they joined and their colleagues'
   * joins of the bids they lead — and so do their places in those chats.
   * Runs on every database (the rows live with their cases).
   */
  async revoke(attorneyIds: string[]): Promise<void> {
    if (attorneyIds.length === 0) return;
    await forEachDatabase(this.prisma, async () => {
      const rows = await this.prisma.bidParticipant.findMany({
        where: {
          OR: [
            { attorney_id: { in: attorneyIds } },
            { bid: { attorney_id: { in: attorneyIds } } },
          ],
        },
        select: {
          bid_id: true,
          attorney_id: true,
          bid: { select: { case_id: true, attorney_id: true } },
        },
      });
      for (const r of rows) {
        const convs = await this.prisma.conversation.findMany({
          where: { case_id: r.bid.case_id, attorney_id: r.bid.attorney_id },
          select: { id: true },
        });
        await this.prisma.conversationParticipant.deleteMany({
          where: {
            user_id: r.attorney_id,
            conversation_id: { in: convs.map((c) => c.id) },
          },
        });
        // Verify 17.11 (batch 9): as for a removed group member, the
        // lawyer's open sockets leave the chat's room on every instance —
        // they kept hearing and sending «печатает…» until a reconnect.
        for (const c of convs) {
          this.realtime?.leaveRoom([r.attorney_id], conversationRoom(c.id));
        }
        await this.prisma.bidParticipant.deleteMany({
          where: { bid_id: r.bid_id, attorney_id: r.attorney_id },
        });
      }
    });
  }
}
