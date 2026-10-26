import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { privateDetailsAad } from '../../../common/secrets/field-aad';
import { MessageBodyCipher } from '../../../common/secrets/message-body-cipher';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { matchesIn, type MatchBy, type Person } from './conflict.logic';
import { CaseAccessPolicy, caseNotFound } from '../../cases/cases.public';
import { assertNoBlockBetween } from '../../blocks/block-check';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { attachUsers } from '../../../sharding/user-directory';

const CLIENT_CONTACT = {
  first_name: true,
  last_name: true,
  phone_e164: true,
  email: true,
} as const;

export class ConflictMatchDto {
  @ApiProperty({
    enum: ['former_client', 'opposing_party'],
    description:
      'former_client: a client of yours is named in this case. opposing_party: this case’s client is named in a case you handled.',
  })
  kind!: 'former_client' | 'opposing_party';
  @ApiPropertyOptional({
    enum: ['name', 'phone', 'email'],
    description:
      'How your former client appears in this case (former_client only). Never given for opposing_party: that match is by name alone.',
  })
  by?: MatchBy;
  @ApiProperty({ description: 'Your earlier case.' }) caseId!: string;
  @ApiProperty() caseTitle!: string;
}

export class ConflictCheckDto {
  @ApiProperty() conflict!: boolean;
  @ApiProperty({ type: [ConflictMatchDto] }) matches!: ConflictMatchDto[];
}

/** The cases an attorney looks back through: the most recent accepted. */
const LOOKBACK = 300;

/** Checks an attorney may run from the case screen in 24 hours: more would
 * let them probe who the clients are. */
export const CHECKS_PER_DAY = 30;

const textOf = (c: {
  title: string;
  description: string;
  private_details: string | null;
}): string => `${c.title}\n${c.description}\n${c.private_details ?? ''}`;

/** A case the attorney has not been hired on: only what every attorney can
 * read; its private details stay out of the comparison. */
const publicTextOf = (c: { title: string; description: string }): string =>
  `${c.title}\n${c.description}`;

/**
 * Owner 2026-10-20: before an attorney bids on a case, look for a conflict
 * of interest in the attorney's own history (cases where their bid was
 * accepted): (1) a former client of theirs named in this case — possibly
 * the other side — and (2) this case's client named in a case they handled
 * — possibly the other side there. Names, phones and e-mails are looked
 * for in the case card text. It is a warning, never a block, and each
 * check is kept as the attorney's own record. The client's identity is
 * never part of the answer — only that a match exists and which of the
 * attorney's own cases it is in. The other side is matched by name alone
 * (no phone or e-mail, and no `by`), and the case's private details are
 * never compared before the attorney is hired.
 */
@Injectable()
export class ConflictCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessPolicy,
    // S3-5: private details are stored sealed.
    @Optional() private readonly cipher?: MessageBodyCipher,
  ) {}

  private opened<T extends { id: string; private_details: string | null }>(
    row: T,
  ): T {
    if (row.private_details === null || !this.cipher) return row;
    return {
      ...row,
      private_details: this.cipher.openField(
        row.private_details,
        privateDetailsAad(row.id),
      ),
    };
  }

  /**
   * Owner 2026-10-22 (security audit #3, finding 7): the check used to load
   * ANY case by id — another client's closed case answered whether that
   * client's name appears in the attorney's own past cases. Now the case
   * must be one this attorney may open (CaseAccessPolicy: 404 otherwise,
   * never a hint it exists), and a block either way refuses it (the block
   * screen promises no contact at all).
   */
  async assertAllowed(attorneyId: string, caseId: string): Promise<void> {
    const access = await this.access.decide(
      { userId: attorneyId, role: 'attorney' },
      caseId,
    );
    if (!access) throw caseNotFound();
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { client_id: true },
    });
    if (!kase) throw caseNotFound();
    await assertNoBlockBetween(this.prisma, attorneyId, kase.client_id);
  }

  async check(attorneyId: string, caseId: string): Promise<ConflictCheckDto> {
    const kaseRow = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        id: true,
        title: true,
        description: true,
        private_details: true,
        client_id: true,
      },
    });
    if (!kaseRow) return { conflict: false, matches: [] };
    const kaseOpen = this.opened(kaseRow);
    // Shard-ready step 6: the client's name / phone / email come from the
    // user directory (users are a global family), not from a join.
    const kase = (
      await attachUsers(
        this.prisma,
        [kaseOpen],
        'client_id',
        'client',
        CLIENT_CONTACT,
      )
    )[0];
    const pastRows = await this.prisma.case.findMany({
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
        client_id: true,
      },
    });
    const pastWithClient = await attachUsers(
      this.prisma,
      pastRows.map((r) => this.opened(r)),
      'client_id',
      'client',
      CLIENT_CONTACT,
    );
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
    const thisClient = person(kase.client!);
    const thisText = publicTextOf(kase);
    const matches: ConflictMatchDto[] = [];
    for (const p of pastWithClient) {
      for (const by of matchesIn(person(p.client!), thisText)) {
        matches.push({
          kind: 'former_client',
          by,
          caseId: p.id,
          caseTitle: p.title,
        });
      }
      if (matchesIn(thisClient, textOf(p)).includes('name')) {
        matches.push({
          kind: 'opposing_party',
          caseId: p.id,
          caseTitle: p.title,
        });
      }
    }
    return { conflict: matches.length > 0, matches };
  }

  /** The case screen's check is limited per attorney and day. */
  async assertQuota(attorneyId: string): Promise<void> {
    const used = await this.prisma.caseConflictCheck.count({
      where: {
        attorney_id: attorneyId,
        trigger: 'view',
        created_at: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    });
    if (used >= CHECKS_PER_DAY) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many conflict checks today. Try again tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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
