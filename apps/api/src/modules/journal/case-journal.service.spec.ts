import { createHash } from 'node:crypto';
import type { CaseJournal, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { canonicalJson } from './canonical-json';
import {
  CaseJournalService,
  SYSTEM_ACTOR,
  computeRowHash,
  retainUntil,
  trimmedHeadAllowed,
  verifyRows,
} from './case-journal.service';

/** In-memory stand-in for the transaction: one case, its journal rows. */
function fakeTx(clientId: string | null = 'client-1') {
  const rows: CaseJournal[] = [];
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      expect(strings.join('?')).toMatch(/FROM cases WHERE id = .* FOR UPDATE/s);
      return Promise.resolve(clientId ? [{ client_id: clientId }] : []);
    }),
    caseJournal: {
      findFirst: jest.fn(() => {
        const sorted = [...rows].sort(
          (a, b) => b.created_at.getTime() - a.created_at.getTime(),
        );
        return Promise.resolve(sorted[0] ?? null);
      }),
      create: jest.fn(({ data }: { data: CaseJournal }) => {
        // As read back from JSONB: keys reordered.
        const stored = {
          ...data,
          payload: JSON.parse(
            JSON.stringify(
              data.payload,
              Object.keys(data.payload as object).reverse(),
            ),
          ) as Prisma.JsonValue,
        };
        rows.push(stored);
        return Promise.resolve(stored);
      }),
    },
  };
  return { rows, tx: tx as unknown as Prisma.TransactionClient, raw: tx };
}

const service = new CaseJournalService({} as PrismaService);
const input = {
  caseId: 'case-1',
  clientId: 'client-1',
  actor: { userId: 'client-1', role: 'client' as const },
  event: 'created' as const,
  payload: { title: 'Speeding ticket', budgetCents: 60000 },
};

describe('canonicalJson', () => {
  it('sorts keys recursively, drops undefined, ISO dates', () => {
    expect(
      canonicalJson({
        b: 1,
        a: { d: [2, { z: 1, y: null }], c: undefined },
        t: new Date('2026-01-02T03:04:05.000Z'),
      }),
    ).toBe(
      '{"a":{"d":[2,{"y":null,"z":1}]},"b":1,"t":"2026-01-02T03:04:05.000Z"}',
    );
    expect(canonicalJson({ x: 'é"\n' })).toBe(JSON.stringify({ x: 'é"\n' }));
  });

  it('rejects values JSON cannot round-trip', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/unsupported/);
  });
});

describe('CaseJournalService (docs/02 §4.D hash chain)', () => {
  it('first row: prev_hash null, row_hash = SHA-256("" + canonical row), retain 5 years', async () => {
    const { tx } = fakeTx();
    const row = await service.append(tx, { ...input, attorneyId: 'att-1' });
    expect(row.prev_hash).toBeNull();
    expect(row.attorney_id).toBe('att-1');
    expect(row.actor_user_id).toBe('client-1');
    expect(row.actor_role).toBe('client');
    expect(row.row_hash).toMatch(/^[0-9a-f]{64}$/);
    const hashed = row;
    const expected = createHash('sha256')
      .update(
        canonicalJson({
          id: hashed.id,
          case_id: 'case-1',
          client_id: 'client-1',
          attorney_id: 'att-1',
          actor_user_id: 'client-1',
          actor_role: 'client',
          event_type: 'created',
          payload: input.payload,
          prev_hash: null,
          retain_until: hashed.retain_until,
          created_at: hashed.created_at,
        }),
      )
      .digest('hex');
    expect(row.row_hash).toBe(expected);
    expect(row.retain_until.getUTCFullYear()).toBe(
      row.created_at.getUTCFullYear() + 5,
    );
    expect(row.retain_until.toISOString().slice(4)).toBe(
      row.created_at.toISOString().slice(4),
    );
  });

  it('links each row to the previous one with strictly increasing created_at', async () => {
    const { tx, rows } = fakeTx();
    for (let i = 0; i < 5; i++) {
      await service.append(tx, {
        ...input,
        event: 'updated',
        actor: SYSTEM_ACTOR,
        payload: { i },
      });
    }
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prev_hash).toBe(rows[i - 1].row_hash);
      expect(rows[i].created_at.getTime()).toBeGreaterThan(
        rows[i - 1].created_at.getTime(),
      );
    }
    expect(rows[4].actor_user_id).toBeNull();
    expect(verifyRows(rows)).toEqual({ valid: true, checked: 5 });
  });

  it('unknown case → CASE_NOT_FOUND; a clientId that does not own the case is refused', async () => {
    await expect(service.append(fakeTx(null).tx, input)).rejects.toMatchObject({
      response: { code: ErrorCode.CASE_NOT_FOUND },
    });
    await expect(
      service.append(fakeTx('someone-else').tx, input),
    ).rejects.toThrow(/does not own/);
  });

  describe('verifyRows detects tampering', () => {
    async function chain(): Promise<CaseJournal[]> {
      const { tx, rows } = fakeTx();
      for (const event of [
        'created',
        'bid_placed',
        'offer_made',
        'bid_accepted',
      ] as const) {
        await service.append(tx, {
          ...input,
          event,
          payload: { event, cents: 100 },
        });
      }
      return rows.map((r) => ({ ...r }));
    }

    it('edited payload → hash_mismatch at that row', async () => {
      const rows = await chain();
      rows[2] = { ...rows[2], payload: { event: 'offer_made', cents: 1 } };
      expect(verifyRows(rows)).toEqual({
        valid: false,
        checked: 2,
        brokenAt: { id: rows[2].id, reason: 'hash_mismatch' },
      });
    });

    it('edited metadata (event, actor, retain_until) → hash_mismatch', async () => {
      for (const patch of [
        { event_type: 'closed' as const },
        { actor_user_id: 'x' },
        { retain_until: new Date('2099-01-01T00:00:00Z') },
        { attorney_id: 'att-9' },
      ]) {
        const rows = await chain();
        rows[1] = { ...rows[1], ...patch };
        expect(verifyRows(rows).brokenAt).toEqual({
          id: rows[1].id,
          reason: 'hash_mismatch',
        });
      }
    });

    it('re-hashed row (attacker recomputes its hash) breaks the next link', async () => {
      const rows = await chain();
      const forged = { ...rows[1], payload: { forged: true } };
      forged.row_hash = computeRowHash(forged);
      rows[1] = forged;
      expect(verifyRows(rows).brokenAt).toEqual({
        id: rows[2].id,
        reason: 'link_mismatch',
      });
    });

    it('deleted or reordered rows → link_mismatch', async () => {
      const rows = await chain();
      expect(verifyRows([rows[0], rows[2], rows[3]]).brokenAt).toEqual({
        id: rows[2].id,
        reason: 'link_mismatch',
      });
      expect(verifyRows([rows[1], rows[2], rows[3]]).brokenAt).toEqual({
        id: rows[1].id,
        reason: 'link_mismatch',
      });
      expect(verifyRows([rows[0], rows[2], rows[1], rows[3]]).valid).toBe(
        false,
      );
    });

    it('retention-trimmed head: accepted only when old enough (docs/06 §5.3)', async () => {
      const rows = await chain();
      const tail = [rows[1], rows[2], rows[3]];
      // Without the allowance a non-null head prev_hash is a break.
      expect(verifyRows(tail).valid).toBe(false);
      expect(verifyRows(tail, { allowTrimmedHead: true }).valid).toBe(true);
      // A fresh head cannot have lost its predecessor to retention.
      const now = new Date('2026-09-29T12:00:00Z');
      expect(trimmedHeadAllowed(tail[0], now)).toBe(false);
      expect(
        trimmedHeadAllowed(
          { ...tail[0], created_at: new Date('2022-01-01T00:00:00Z') },
          now,
        ),
      ).toBe(true);
      expect(trimmedHeadAllowed({ ...tail[0], prev_hash: null }, now)).toBe(
        false,
      );
    });

    it('verifyChain reads the case rows in chain order', async () => {
      const rows = await chain();
      const findMany = jest.fn().mockResolvedValue(rows);
      const res = await service.verifyChain('case-1', {
        caseJournal: { findMany },
      } as unknown as Prisma.TransactionClient);
      expect(res).toEqual({ valid: true, checked: 4 });
      expect(findMany).toHaveBeenCalledWith({
        where: { case_id: 'case-1' },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
    });
  });

  it('retainUntil adds 5 calendar years in UTC', () => {
    expect(
      retainUntil(new Date('2026-09-27T23:59:59.123Z')).toISOString(),
    ).toBe('2031-09-27T23:59:59.123Z');
  });
});
