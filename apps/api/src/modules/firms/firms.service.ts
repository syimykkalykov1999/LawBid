import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';

export const FIRMS_FLAG = 'firm_profiles';
const MAX_MEMBERS = 50;

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
}

/**
 * Owner 2026-10-14: a firm has no bar number; it is its lawyers. Each member
 * keeps their own licenses and verification, the firm's states are the union
 * of the active members' verified licenses, and a bid goes out from the
 * member who holds a matching license (the bid itself is still the lawyer's).
 */
@Injectable()
export class FirmsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const firm = await this.prisma.firm.findUnique({
      where: { id: firmId },
      include: { members: true },
    });
    if (!firm) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const members = firm.members.filter(
      (m) =>
        viewerIsMember || m.status === 'active' || m.attorney_id === viewerId,
    );
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
    };
  }

  private async myMembership(userId: string) {
    return this.prisma.firmMember.findUnique({
      where: { attorney_id: userId },
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
    const m = await this.myMembership(userId);
    if (!m) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    return this.view(m.firm_id, m.status === 'active', userId);
  }

  /** Public page of a firm: active members and the union of their states. */
  async publicPage(firmId: string): Promise<FirmView> {
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
    const count = await this.prisma.firmMember.count({
      where: { firm_id: firmId },
    });
    if (count >= MAX_MEMBERS) {
      throw new ConflictException({ code: ErrorCode.FIRM_FULL });
    }
    if (await this.myMembership(attorneyId)) {
      throw new ConflictException({
        code: ErrorCode.FIRM_ALREADY_MEMBER,
        message: 'This lawyer is already in a firm or has an invitation.',
      });
    }
    await this.prisma.firmMember.create({
      data: { firm_id: firmId, attorney_id: attorneyId },
    });
    return this.view(firmId, true);
  }

  async accept(userId: string): Promise<FirmView> {
    const m = await this.myMembership(userId);
    if (!m || m.status !== 'invited') {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    await this.prisma.firmMember.update({
      where: { attorney_id: userId },
      data: { status: 'active' },
    });
    return this.view(m.firm_id, true);
  }

  /** Decline an invitation, leave the firm, or (the owner) remove someone. */
  async remove(userId: string, attorneyId: string): Promise<void> {
    const mine = await this.myMembership(userId);
    if (!mine) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    if (attorneyId !== userId && mine.role !== 'owner') {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN });
    }
    const target = await this.myMembership(attorneyId);
    if (!target || target.firm_id !== mine.firm_id) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    if (target.role === 'owner') {
      // The owner closes the firm instead of leaving it headless.
      await this.prisma.firm.delete({ where: { id: mine.firm_id } });
      return;
    }
    await this.prisma.firmMember.delete({ where: { attorney_id: attorneyId } });
  }

  /** The lawyer a firm member sends a bid as: both active members of one
   * firm, and the sender holds a verified licence that fits the case. */
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
    return senderId;
  }

  /** Members who can bid on a case: an active, verified licence in one of
   * the case's states (the firm owner picks who sends the bid). */
  async eligibleForCase(
    userId: string,
    caseId: string,
  ): Promise<FirmMemberView[]> {
    const m = await this.myMembership(userId);
    if (!m || m.status !== 'active') {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
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
    return firm.members.filter((x) => x.states.some((s) => wanted.has(s)));
  }
}
