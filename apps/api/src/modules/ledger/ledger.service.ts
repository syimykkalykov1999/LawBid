import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashShard } from '../../sharding/shard-id';
import { PLATFORM_OWNER, typeOf } from './ledger.chart';
import { isBalanced, type Line } from './ledger.recipes';

/** A transaction client (or the root client) with the ledger delegates. */
export type LedgerDb = Pick<
  Prisma.TransactionClient,
  'ledgerAccount' | 'ledgerEntry' | 'ledgerLine'
>;

export interface PostEntryInput {
  /** What happened: case_payment, payment, refund, stripe_balance_txn ... */
  sourceType: string;
  /** Id of the source row, or of the Stripe event / balance transaction. */
  sourceId: string;
  /** paid, refunded ...: with sourceType + sourceId the idempotency key. */
  event: string;
  currency: string;
  description: string;
  lines: readonly Line[];
  occurredAt?: Date;
  stripeRef?: string | null;
  /** The main user party (payer / payee): its shard is stored for later splits. */
  partyUserId?: string | null;
}

export interface PostResult {
  /** false = the same (sourceType, sourceId, event) was already posted, or nothing to post. */
  created: boolean;
  entryId: string | null;
}

/**
 * The only writer of the double-entry money ledger (design:
 * docs/architecture/MONEY_LEDGER.md; sources: Stripe «Ledger», Modern
 * Treasury «Ledgers», TigerBeetle debit/credit schema, Formance).
 *
 * Rules:
 *  - call it with the SAME transaction client as the money event it records,
 *    so the event and its entry commit or roll back together;
 *  - idempotent: (sourceType, sourceId, event) is unique, a replay (webhook
 *    redelivery, retry) returns `created: false` and writes nothing;
 *  - the database refuses an entry that does not balance, mixes currencies,
 *    or is later updated / deleted (migration 20261026110000_money_ledger).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(db: LedgerDb, input: PostEntryInput): Promise<PostResult> {
    const currency = input.currency.toLowerCase();
    if (!isBalanced(input.lines)) {
      // Nothing to record (a zero-amount payment) vs. a programming error.
      if (input.lines.length === 0) return { created: false, entryId: null };
      throw new Error(
        `ledger: unbalanced entry ${input.sourceType}/${input.sourceId}/${input.event}`,
      );
    }
    for (const l of input.lines) {
      if (!Number.isInteger(l.cents) || l.cents <= 0) {
        throw new Error('ledger: line amounts are positive integer cents');
      }
    }
    const partyShard = input.partyUserId ? safeShard(input.partyUserId) : 0;

    const entry = await db.ledgerEntry.createMany({
      data: [
        {
          source_type: input.sourceType,
          source_id: input.sourceId,
          event: input.event,
          currency,
          description: input.description.slice(0, 200),
          stripe_ref: input.stripeRef ?? null,
          party_shard: partyShard,
          occurred_at: input.occurredAt ?? new Date(),
        },
      ],
      skipDuplicates: true,
    });
    if (entry.count === 0) return { created: false, entryId: null };
    const row = await db.ledgerEntry.findUniqueOrThrow({
      where: {
        source_type_source_id_event: {
          source_type: input.sourceType,
          source_id: input.sourceId,
          event: input.event,
        },
      },
      select: { id: true },
    });

    const wanted = new Map<
      string,
      { code: Line['account']['code']; ownerId?: string }
    >();
    for (const l of input.lines) {
      wanted.set(accountKey(l.account.code, l.account.ownerId), l.account);
    }
    await db.ledgerAccount.createMany({
      data: [...wanted.values()].map((a) => ({
        code: a.code,
        owner_key: a.ownerId ?? PLATFORM_OWNER,
        owner_id: a.ownerId ?? null,
        currency,
        type: typeOf(a.code),
        party_shard: a.ownerId ? safeShard(a.ownerId) : 0,
      })),
      skipDuplicates: true,
    });
    const accounts = await db.ledgerAccount.findMany({
      where: {
        currency,
        OR: [...wanted.values()].map((a) => ({
          code: a.code,
          owner_key: a.ownerId ?? PLATFORM_OWNER,
        })),
      },
      select: { id: true, code: true, owner_key: true },
    });
    const idOf = new Map(
      accounts.map((a) => [
        accountKey(a.code as Line['account']['code'], a.owner_key),
        a.id,
      ]),
    );
    await db.ledgerLine.createMany({
      data: input.lines.map((l) => ({
        entry_id: row.id,
        account_id: idOf.get(accountKey(l.account.code, l.account.ownerId))!,
        direction: l.direction,
        amount_cents: l.cents,
      })),
    });
    return { created: true, entryId: row.id };
  }

  /** Lines of an earlier entry (for a proportional reversal). Null if none. */
  async linesOf(
    db: LedgerDb,
    key: { sourceType: string; sourceId: string; event: string },
  ): Promise<{ currency: string; lines: Line[]; grossCents: number } | null> {
    const entry = await db.ledgerEntry.findUnique({
      where: {
        source_type_source_id_event: {
          source_type: key.sourceType,
          source_id: key.sourceId,
          event: key.event,
        },
      },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) return null;
    const lines: Line[] = entry.lines.map((l) => ({
      account: {
        code: l.account.code as Line['account']['code'],
        ...(l.account.owner_id ? { ownerId: l.account.owner_id } : {}),
      },
      direction: l.direction,
      cents: l.amount_cents,
    }));
    const grossCents = lines
      .filter((l) => l.direction === 'debit')
      .reduce((s, l) => s + l.cents, 0);
    return { currency: entry.currency, lines, grossCents };
  }

  get db(): PrismaService {
    return this.prisma;
  }
}

function accountKey(code: string, owner?: string): string {
  return `${code}|${owner ?? PLATFORM_OWNER}`;
}

function safeShard(userId: string): number {
  try {
    return hashShard(userId);
  } catch {
    return 0;
  }
}
