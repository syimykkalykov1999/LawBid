import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { TRUST_ACTOR } from './attorney-trust.constants';

type Db = PrismaService | Prisma.TransactionClient;

export interface BlockActor {
  type: string;
  id?: string | null;
  ip?: string | null;
}

export const BLOCK_SOURCE = {
  staffReject: 'staff_reject',
  verificationReject: 'verification_reject',
  suspend: 'suspend',
  manual: 'manual',
} as const;
export type BlockSource = (typeof BLOCK_SOURCE)[keyof typeof BLOCK_SOURCE];

export const BLOCK_EVENT = {
  blocked: 'blocked',
  unblocked: 'unblocked',
  attempt: 'attempt',
} as const;

/** `A-12 345` and `a12345` are the same number. */
export function barKey(barNumber: string): string {
  return barNumber.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

/**
 * Owner 2026-10-05 07:00 («Борьба с мошенниками» → «Заблокированные
 * номера»): once staff rejected an attorney or an account was blocked, its
 * bar number cannot be registered again under another name or a new
 * account. Staff unblock it with a reason when the person explains and
 * proves; every step is an append-only event.
 */
@Injectable()
export class BarNumberBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @InjectPinoLogger(BarNumberBlocksService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Both switches honour the master switch `trust.enabled`. */
  async blockOnReject(): Promise<boolean> {
    const [enabled, on] = await Promise.all([
      this.settings.boolean('trust.enabled'),
      this.settings.boolean('trust.block_on_reject'),
    ]);
    return enabled && on;
  }

  private async blockContacts(): Promise<boolean> {
    const [enabled, on] = await Promise.all([
      this.settings.boolean('trust.enabled'),
      this.settings.boolean('trust.block_contacts'),
    ]);
    return enabled && on;
  }

  /**
   * The registration gate: refuses a blocked (state, bar number), and, when
   * `trust.block_contacts` is on, the e-mail / phone of a blocked account.
   * Records the attempt on the block. 403 BAR_NUMBER_BLOCKED.
   */
  async assertNotBlocked(
    userId: string,
    stateCode: string,
    barNumber: string,
  ): Promise<void> {
    if (!(await this.settings.boolean('trust.enabled'))) return;
    const key = barKey(barNumber);
    let block = await this.prisma.barNumberBlock.findFirst({
      where: { state_code: stateCode, bar_key: key, active: true },
      select: { id: true, attorney_id: true },
    });
    let via: 'bar_number' | 'contacts' = 'bar_number';
    if (!block && (await this.blockContacts())) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phone_e164: true },
      });
      const email = user?.email?.toLowerCase() ?? null;
      const phone = user?.phone_e164 ?? null;
      if (email || phone) {
        block = await this.prisma.barNumberBlock.findFirst({
          where: {
            active: true,
            block_contacts: true,
            OR: [
              ...(email ? [{ email_lower: email }] : []),
              ...(phone ? [{ phone_e164: phone }] : []),
            ],
          },
          select: { id: true, attorney_id: true },
        });
        via = 'contacts';
      }
    }
    if (!block) return;
    // The original owner of the number keeps hitting their own block too:
    // that is the point (they must talk to support), but we record who.
    const sameAccount = block.attorney_id === userId;
    await this.prisma.$transaction([
      this.prisma.barNumberBlock.update({
        where: { id: block.id },
        data: { attempts: { increment: 1 }, last_attempt_at: new Date() },
      }),
      this.prisma.barNumberBlockEvent.create({
        data: {
          block_id: block.id,
          kind: BLOCK_EVENT.attempt,
          actor_type: TRUST_ACTOR.attorney,
          actor_id: userId,
          details: {
            via,
            stateCode,
            barNumber,
            sameAccount,
          },
        },
      }),
    ]);
    this.logger.warn(
      { userId, stateCode, via, blockId: block.id },
      'Registration with a blocked bar number refused',
    );
    throw new ForbiddenException({
      code: ErrorCode.BAR_NUMBER_BLOCKED,
      message:
        'This license number cannot be registered. Please contact support.',
      details: { via },
    });
  }

  /**
   * Blocks every bar number of an attorney (verified, pending or rejected
   * licenses). Used by a staff «Отклонить», an admin verification reject and
   * an admin suspension when `trust.block_on_reject` is on. Idempotent.
   */
  async blockAttorney(
    attorneyId: string,
    actor: BlockActor,
    reason: string,
    source: BlockSource,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const run = async (db: Db) => {
      const [licenses, user, contacts] = await Promise.all([
        db.attorneyLicense.findMany({
          where: { attorney_id: attorneyId },
          select: { state_code: true, bar_number: true },
        }),
        db.user.findUnique({
          where: { id: attorneyId },
          select: { email: true, phone_e164: true },
        }),
        this.blockContacts(),
      ]);
      let n = 0;
      for (const l of licenses) {
        const created = await this.upsertBlock(db, {
          stateCode: l.state_code,
          barNumber: l.bar_number,
          reason,
          source,
          actor,
          attorneyId,
          blockContacts: contacts,
          emailLower: user?.email?.toLowerCase() ?? null,
          phone: user?.phone_e164 ?? null,
        });
        if (created) n += 1;
      }
      return n;
    };
    return tx ? run(tx) : withTxRetry(this.prisma, run);
  }

  /** A block by hand (admin), one (state, bar number). */
  async block(input: {
    stateCode: string;
    barNumber: string;
    reason: string;
    actor: BlockActor;
    blockContacts: boolean;
  }) {
    return withTxRetry(this.prisma, async (tx) => {
      const holder = await tx.attorneyLicense.findFirst({
        where: {
          state_code: input.stateCode,
          bar_number: { in: spellings(input.barNumber) },
        },
        select: {
          attorney_id: true,
          attorney: {
            select: { user: { select: { email: true, phone_e164: true } } },
          },
        },
      });
      await this.upsertBlock(tx, {
        stateCode: input.stateCode,
        barNumber: input.barNumber,
        reason: input.reason,
        source: BLOCK_SOURCE.manual,
        actor: input.actor,
        attorneyId: holder?.attorney_id ?? null,
        blockContacts: input.blockContacts,
        emailLower: holder?.attorney.user.email?.toLowerCase() ?? null,
        phone: holder?.attorney.user.phone_e164 ?? null,
      });
      return this.get(input.stateCode, input.barNumber, tx);
    });
  }

  /** Lifts a block; the row and its history stay. */
  async unblock(id: string, actor: BlockActor, reason: string) {
    return withTxRetry(this.prisma, async (tx) => {
      const row = await tx.barNumberBlock.findUnique({ where: { id } });
      if (!row) return null;
      if (row.active) {
        await tx.barNumberBlock.update({
          where: { id },
          data: {
            active: false,
            unblocked_at: new Date(),
            unblocked_by: actor.id ?? null,
            unblock_reason: reason,
          },
        });
        await tx.barNumberBlockEvent.create({
          data: {
            block_id: id,
            kind: BLOCK_EVENT.unblocked,
            actor_type: actor.type,
            actor_id: actor.id ?? null,
            reason,
            details: { ip: actor.ip ?? null },
          },
        });
      }
      return tx.barNumberBlock.findUnique({
        where: { id },
        include: { events: { orderBy: { created_at: 'desc' }, take: 100 } },
      });
    });
  }

  async get(stateCode: string, barNumber: string, db: Db = this.prisma) {
    return db.barNumberBlock.findUnique({
      where: {
        state_code_bar_key: {
          state_code: stateCode,
          bar_key: barKey(barNumber),
        },
      },
      include: { events: { orderBy: { created_at: 'desc' }, take: 100 } },
    });
  }

  async getById(id: string) {
    return this.prisma.barNumberBlock.findUnique({
      where: { id },
      include: { events: { orderBy: { created_at: 'desc' }, take: 100 } },
    });
  }

  async list(opts: {
    q?: string | null;
    status?: 'active' | 'unblocked' | null;
    limit?: number;
  }) {
    return this.prisma.barNumberBlock.findMany({
      where: {
        ...(opts.status === 'active' ? { active: true } : {}),
        ...(opts.status === 'unblocked' ? { active: false } : {}),
        ...(opts.q
          ? {
              OR: [
                { bar_key: { contains: barKey(opts.q) } },
                { state_code: opts.q.toUpperCase() },
                { email_lower: { contains: opts.q.toLowerCase() } },
                { reason: { contains: opts.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { blocked_at: 'desc' },
      take: opts.limit ?? 200,
    });
  }

  /** Which of these licenses are blocked right now, as `STATE:KEY`. */
  async activeKeys(
    licenses: readonly { state_code: string; bar_number: string }[],
  ): Promise<Set<string>> {
    if (licenses.length === 0) return new Set();
    const rows = await this.prisma.barNumberBlock.findMany({
      where: {
        active: true,
        OR: licenses.map((l) => ({
          state_code: l.state_code,
          bar_key: barKey(l.bar_number),
        })),
      },
      select: { state_code: true, bar_key: true },
    });
    return new Set(rows.map((r) => `${r.state_code}:${r.bar_key}`));
  }

  async countActive(): Promise<number> {
    return this.prisma.barNumberBlock.count({ where: { active: true } });
  }

  /** Is this (state, bar number) blocked right now? For admin cards. */
  async isBlocked(stateCode: string, barNumber: string): Promise<boolean> {
    const row = await this.prisma.barNumberBlock.findUnique({
      where: {
        state_code_bar_key: {
          state_code: stateCode,
          bar_key: barKey(barNumber),
        },
      },
      select: { active: true },
    });
    return row?.active ?? false;
  }

  // --- internals ---------------------------------------------------------

  /** Creates or re-activates the block. True when it was not active before. */
  private async upsertBlock(
    db: Db,
    x: {
      stateCode: string;
      barNumber: string;
      reason: string;
      source: BlockSource;
      actor: BlockActor;
      attorneyId: string | null;
      blockContacts: boolean;
      emailLower: string | null;
      phone: string | null;
    },
  ): Promise<boolean> {
    const key = barKey(x.barNumber);
    if (!key) return false;
    const existing = await db.barNumberBlock.findUnique({
      where: { state_code_bar_key: { state_code: x.stateCode, bar_key: key } },
      select: { id: true, active: true },
    });
    const data = {
      reason: x.reason,
      source: x.source,
      attorney_id: x.attorneyId,
      blocked_by: x.actor.id ?? null,
      blocked_at: new Date(),
      block_contacts: x.blockContacts,
      email_lower: x.emailLower,
      phone_e164: x.phone,
      active: true,
      unblocked_at: null,
      unblocked_by: null,
      unblock_reason: null,
    };
    let id: string;
    if (existing) {
      if (existing.active) return false;
      await db.barNumberBlock.update({ where: { id: existing.id }, data });
      id = existing.id;
    } else {
      const row = await db.barNumberBlock.create({
        data: {
          state_code: x.stateCode,
          bar_number: x.barNumber,
          bar_key: key,
          ...data,
        },
        select: { id: true },
      });
      id = row.id;
    }
    await db.barNumberBlockEvent.create({
      data: {
        block_id: id,
        kind: BLOCK_EVENT.blocked,
        actor_type: x.actor.type,
        actor_id: x.actor.id ?? null,
        reason: x.reason,
        details: {
          source: x.source,
          attorneyId: x.attorneyId,
          blockContacts: x.blockContacts,
          ip: x.actor.ip ?? null,
        },
      },
    });
    return true;
  }
}

/** The bar number as typed plus its bare key, to find the holder. */
function spellings(barNumber: string): string[] {
  return [...new Set([barNumber, barKey(barNumber)])];
}
