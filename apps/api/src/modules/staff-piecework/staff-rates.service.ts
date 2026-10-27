import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminWorkspace, StaffRate } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PIECEWORK_CURRENCY } from './staff-piecework.service';
import type { SetStaffRateDto, StaffRateDto } from './staff-piecework.dto';

/** Rates are config: the whole list is a few dozen rows. */
const LIST_LIMIT = 300;

/**
 * Staff package T7: the owner's piecework rates (`staff_rates`, kept when
 * the test data is wiped). A rate is versioned, never edited in place:
 * setting a new amount closes the open rate of the same kind and workspace
 * at the new start, so every past day is recounted with the rate that was
 * in force that day. Every change is one audit row.
 */
@Injectable()
export class StaffRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(now = new Date()): Promise<StaffRateDto[]> {
    const rows = await this.prisma.staffRate.findMany({
      orderBy: [{ kind: 'asc' }, { workspace: 'asc' }, { valid_from: 'desc' }],
      take: LIST_LIMIT,
    });
    return rows.map((r) => toDto(r, now));
  }

  async set(
    actor: AdminActor,
    dto: SetStaffRateDto,
    now = new Date(),
  ): Promise<StaffRateDto> {
    const from = dto.validFrom ? new Date(dto.validFrom) : now;
    if (
      Number.isNaN(from.getTime()) ||
      from.getTime() < now.getTime() - 60_000
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A rate cannot start in the past.',
      });
    }
    const workspace = dto.workspace as AdminWorkspace;
    return this.prisma.$transaction(async (tx) => {
      const same = { kind: dto.kind, workspace } as const;
      const later = await tx.staffRate.findFirst({
        where: { ...same, valid_from: { gte: from } },
        select: { id: true },
      });
      if (later) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A rate for this kind already starts at or after that time.',
        });
      }
      const open = await tx.staffRate.findFirst({
        where: {
          ...same,
          valid_from: { lt: from },
          OR: [{ valid_to: null }, { valid_to: { gt: from } }],
        },
        orderBy: { valid_from: 'desc' },
      });
      if (open) {
        await tx.staffRate.update({
          where: { id: open.id },
          data: { valid_to: from },
        });
      }
      const row = await tx.staffRate.create({
        data: {
          ...same,
          amount_cents: dto.amountCents,
          currency: PIECEWORK_CURRENCY,
          valid_from: from,
          boost_mult: dto.boostMult ?? null,
          created_by: actor.id,
        },
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: 'staff.rate_set',
          targetType: 'staff_rate',
          targetId: row.id,
          before: open ? { id: open.id, amountCents: open.amount_cents } : null,
          after: {
            kind: row.kind,
            workspace: row.workspace,
            amountCents: row.amount_cents,
            validFrom: row.valid_from.toISOString(),
            boostMult: dto.boostMult ?? null,
          },
          ip: actor.ip,
        },
        tx,
      );
      return toDto(row, now);
    });
  }

  /** Ends a rate now (or cancels one that has not started yet). */
  async end(
    actor: AdminActor,
    id: string,
    now = new Date(),
  ): Promise<StaffRateDto> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.staffRate.findUnique({ where: { id } });
      if (!row) throw notFound();
      if (row.valid_to && row.valid_to.getTime() <= now.getTime()) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This rate has already ended.',
        });
      }
      const to =
        row.valid_from.getTime() > now.getTime() ? row.valid_from : now;
      const updated = await tx.staffRate.update({
        where: { id },
        data: { valid_to: to },
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: 'staff.rate_end',
          targetType: 'staff_rate',
          targetId: id,
          before: {
            kind: row.kind,
            validTo: row.valid_to?.toISOString() ?? null,
          },
          after: { validTo: to.toISOString() },
          ip: actor.ip,
        },
        tx,
      );
      return toDto(updated, now);
    });
  }
}

function toDto(r: StaffRate, now: Date): StaffRateDto {
  return {
    id: r.id,
    kind: r.kind,
    workspace: r.workspace,
    amountCents: r.amount_cents,
    currency: r.currency,
    validFrom: r.valid_from.toISOString(),
    validTo: r.valid_to ? r.valid_to.toISOString() : null,
    boostMult: r.boost_mult === null ? null : Number(r.boost_mult),
    active:
      r.valid_from.getTime() <= now.getTime() &&
      (!r.valid_to || r.valid_to.getTime() > now.getTime()),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}
