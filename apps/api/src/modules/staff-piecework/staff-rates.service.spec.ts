/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { OWNER } from '../../../test/support/staff-piecework-fixtures';
import { StaffRatesService } from './staff-rates.service';

const NOW = new Date('2026-10-27T10:00:00Z');

type Row = {
  id: string;
  kind: string;
  workspace: string;
  amount_cents: number;
  currency: string;
  valid_from: Date;
  valid_to: Date | null;
  boost_mult: number | null;
  created_by: string;
};

function make(rows: Row[] = []) {
  let n = 0;
  const tx: any = {
    staffRate: {
      findFirst: async ({ where }: any) => {
        const hit = rows
          .filter(
            (r) => r.kind === where.kind && r.workspace === where.workspace,
          )
          .filter((r) =>
            where.valid_from.gte
              ? r.valid_from >= where.valid_from.gte
              : r.valid_from < where.valid_from.lt &&
                (!r.valid_to || r.valid_to > where.OR[1].valid_to.gt),
          );
        return hit[0] ?? null;
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      create: async ({ data }: any) => {
        const r = { id: `r${++n}`, ...data } as Row;
        rows.push(r);
        return r;
      },
      findUnique: async ({ where }: any) =>
        rows.find((r) => r.id === where.id) ?? null,
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { svc: new StaffRatesService(prisma, audit as never), rows, audit };
}

describe('StaffRatesService', () => {
  it('sets a rate, audited', async () => {
    const { svc, rows, audit } = make();
    const out = await svc.set(
      OWNER,
      { kind: 'ticket', workspace: 'mass', amountCents: 250 },
      NOW,
    );
    expect(out).toMatchObject({
      kind: 'ticket',
      amountCents: 250,
      currency: 'usd',
      active: true,
      validTo: null,
    });
    expect(rows).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: OWNER.id,
        action: 'staff.rate_set',
        targetId: out.id,
      }),
      expect.anything(),
    );
  });

  it('a new amount closes the open rate of the same kind/workspace at its start', async () => {
    const { svc, rows } = make();
    const first = await svc.set(
      OWNER,
      { kind: 'ticket', workspace: 'mass', amountCents: 200 },
      new Date('2026-10-01T00:00:00Z'),
    );
    const from = '2026-11-01T00:00:00.000Z';
    await svc.set(
      OWNER,
      { kind: 'ticket', workspace: 'mass', amountCents: 300, validFrom: from },
      NOW,
    );
    expect(rows.find((r) => r.id === first.id)?.valid_to?.toISOString()).toBe(
      from,
    );
    expect(rows).toHaveLength(2);
  });

  it('refuses a start in the past and a start before an already planned rate', async () => {
    const { svc } = make();
    await expect(
      svc.set(
        OWNER,
        {
          kind: 'ticket',
          workspace: 'mass',
          amountCents: 100,
          validFrom: '2026-10-01T00:00:00Z',
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await svc.set(
      OWNER,
      {
        kind: 'ticket',
        workspace: 'mass',
        amountCents: 100,
        validFrom: '2026-12-01T00:00:00Z',
      },
      NOW,
    );
    await expect(
      svc.set(
        OWNER,
        { kind: 'ticket', workspace: 'mass', amountCents: 100 },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('end() stops a rate now; unknown and already-ended are refused', async () => {
    const { svc, rows, audit } = make();
    const r = await svc.set(
      OWNER,
      { kind: 'report', workspace: 'mass', amountCents: 100 },
      new Date('2026-10-01T00:00:00Z'),
    );
    const out = await svc.end(OWNER, r.id, NOW);
    expect(out).toMatchObject({ active: false, validTo: NOW.toISOString() });
    expect(rows[0].valid_to).toEqual(NOW);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.rate_end' }),
      expect.anything(),
    );
    await expect(svc.end(OWNER, r.id, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(svc.end(OWNER, 'nope', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
