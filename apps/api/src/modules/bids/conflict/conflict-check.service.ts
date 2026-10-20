import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { matchesIn, type MatchBy, type Person } from './conflict.logic';
import { ApiProperty } from '@nestjs/swagger';

export class ConflictMatchDto {
  @ApiProperty({
    enum: ['former_client', 'opposing_party'],
    description:
      'former_client: a client of yours is named in this case. opposing_party: this case’s client is named in a case you handled.',
  })
  kind!: 'former_client' | 'opposing_party';
  @ApiProperty({ enum: ['name', 'phone', 'email'] }) by!: MatchBy;
  @ApiProperty({ description: 'Your earlier case.' }) caseId!: string;
  @ApiProperty() caseTitle!: string;
}

export class ConflictCheckDto {
  @ApiProperty() conflict!: boolean;
  @ApiProperty({ type: [ConflictMatchDto] }) matches!: ConflictMatchDto[];
}

/** The cases an attorney looks back through: the most recent accepted. */
const LOOKBACK = 300;

const textOf = (c: {
  title: string;
  description: string;
  private_details: string | null;
}): string => `${c.title}\n${c.description}\n${c.private_details ?? ''}`;

/**
 * Owner 2026-10-20: before an attorney bids on a case, look for a conflict
 * of interest in the attorney's own history (cases where their bid was
 * accepted): (1) a former client of theirs named in this case — possibly
 * the other side — and (2) this case's client named in a case they handled
 * — possibly the other side there. Names, phones and e-mails are looked
 * for in the case card text. It is a warning, never a block, and each
 * check is kept as the attorney's own record. The client's identity is
 * never part of the answer — only that a match exists and which of the
 * attorney's own cases it is in.
 */
@Injectable()
export class ConflictCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async check(attorneyId: string, caseId: string): Promise<ConflictCheckDto> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        id: true,
        title: true,
        description: true,
        private_details: true,
        client_id: true,
        client: {
          select: {
            first_name: true,
            last_name: true,
            phone_e164: true,
            email: true,
          },
        },
      },
    });
    if (!kase) return { conflict: false, matches: [] };
    const past = await this.prisma.case.findMany({
      where: {
        deleted_at: null,
        id: { not: caseId },
        client_id: { not: kase.client_id },
        accepted_bid: { is: { attorney_id: attorneyId } },
      },
      orderBy: { created_at: 'desc' },
      take: LOOKBACK,
      select: {
        id: true,
        title: true,
        description: true,
        private_details: true,
        client: {
          select: {
            first_name: true,
            last_name: true,
            phone_e164: true,
            email: true,
          },
        },
      },
    });
    const person = (u: {
      first_name: string | null;
      last_name: string | null;
      phone_e164: string | null;
      email: string | null;
    }): Person => ({
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      phone: u.phone_e164,
      email: u.email,
    });
    const thisClient = person(kase.client);
    const thisText = textOf(kase);
    const matches: ConflictMatchDto[] = [];
    for (const p of past) {
      for (const by of matchesIn(person(p.client), thisText)) {
        matches.push({
          kind: 'former_client',
          by,
          caseId: p.id,
          caseTitle: p.title,
        });
      }
      for (const by of matchesIn(thisClient, textOf(p))) {
        matches.push({
          kind: 'opposing_party',
          by,
          caseId: p.id,
          caseTitle: p.title,
        });
      }
    }
    return { conflict: matches.length > 0, matches };
  }

  /** The attorney's own record of what was found (best effort: a failed
   * write never stops the bid). */
  async record(
    attorneyId: string,
    caseId: string,
    trigger: 'bid' | 'view',
    result: ConflictCheckDto,
    bidId: string | null = null,
  ): Promise<void> {
    if (trigger === 'view' && !result.conflict) return;
    await this.prisma.caseConflictCheck.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        trigger,
        bid_id: bidId,
        matches: result.matches as unknown as Prisma.InputJsonArray,
      },
    });
  }

  /** On a bid: check, keep the record, never throw. */
  async onBid(
    attorneyId: string,
    caseId: string,
    bidId: string,
  ): Promise<void> {
    try {
      const result = await this.check(attorneyId, caseId);
      await this.record(attorneyId, caseId, 'bid', result, bidId);
    } catch {
      // The check is a warning; the bid already stands.
    }
  }
}
