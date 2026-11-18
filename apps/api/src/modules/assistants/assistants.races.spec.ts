import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { AssistantsService } from './assistants.service';

/**
 * Verify 17.11, batch 6. A2: two "Add assistant" taps (or two devices)
 * read the seat count before either wrote, so both passed a one-seat
 * limit. A4: accepting an invite flipped the seat to active without
 * checking it was still an invite, and a lost race against the unique
 * "one active team" index surfaced as a 500.
 */
const attorney = { sub: 'atty-1', role: 'attorney' } as RequestUser;

/** A tiny database: memberships in an array, transactions that honour a
 * pg_advisory_xact_lock (held until the transaction ends). */
function fakeDb(seats: number) {
  const rows: { id: string; attorney_id: string; status: string }[] = [];
  let chain: Promise<void> = Promise.resolve();
  const membership = {
    count: jest.fn((args: { where: { attorney_id: string } }) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            r.attorney_id === args.where.attorney_id && r.status !== 'removed',
        ).length,
      ),
    ),
    create: jest.fn(
      (args: { data: { attorney_id: string; status: string } }) => {
        const row = { id: `m${rows.length + 1}`, ...args.data };
        rows.push(row);
        return Promise.resolve(row);
      },
    ),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
  };
  const base = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue({ plan: 'monthly' }),
    },
    assistantMembership: membership,
    // Batch 9: a seat decrease waiting for the renewal (none here).
    assistantSeatChange: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...base,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      const tx = {
        ...base,
        $executeRaw: jest.fn(async () => {
          const prev = chain;
          chain = prev.then(() => held);
          await prev;
          return 1;
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    }),
  };
  const entitlements = {
    seats: jest.fn().mockResolvedValue({ total: seats }),
  };
  const cipher = { seal: jest.fn().mockReturnValue('enc') };
  return { rows, prisma, entitlements, cipher };
}

function service(
  prisma: unknown,
  extra: { entitlements?: unknown; cipher?: unknown; context?: unknown } = {},
) {
  const s = new AssistantsService(
    prisma as never,
    {} as never,
    (extra.cipher ?? {}) as never,
    (extra.context ?? { invalidate: jest.fn() }) as never,
    {} as never,
    (extra.entitlements ?? {}) as never,
    { emit: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(s, 'team').mockResolvedValue({} as never);
  return s;
}

describe('AssistantsService.add — one seat, two taps (A2)', () => {
  it('only one assistant takes the last seat; the other is ASSISTANT_NO_FREE_SEAT', async () => {
    const { rows, prisma, entitlements, cipher } = fakeDb(1);
    const s = service(prisma, { entitlements, cipher });
    const results = await Promise.allSettled([
      s.add(attorney, {}),
      s.add(attorney, {}),
    ]);
    expect(rows).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: { code: 'ASSISTANT_NO_FREE_SEAT' },
    });
  });

  it('with seats left both are added', async () => {
    const { rows, prisma, entitlements, cipher } = fakeDb(2);
    const s = service(prisma, { entitlements, cipher });
    await Promise.all([s.add(attorney, {}), s.add(attorney, {})]);
    expect(rows).toHaveLength(2);
  });
});

describe('AssistantsService.acceptInvite — the invite is claimed once (A4)', () => {
  function setup(update: jest.Mock) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: null,
          phone_e164: '+12125550199',
          phone_verified_at: new Date(),
        }),
        update: jest.fn().mockReturnValue('user-update'),
      },
      assistantMembership: {
        findFirst: jest
          .fn()
          // assertCanJoin: no active team yet; inviteFor: the invite.
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'm1', attorney_id: 'atty-1' }),
        update,
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const s = service(prisma);
    jest.spyOn(s, 'me').mockResolvedValue({ state: 'active' } as never);
    return { s, update };
  }
  const asst = { sub: 'asst-1', role: 'assistant' } as RequestUser;

  it('the seat is activated only while it is still an invite', async () => {
    const { s, update } = setup(jest.fn().mockResolvedValue({}));
    await s.acceptInvite(asst);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', status: 'invited' },
      }),
    );
  });

  it('losing the race to the one-active-team index is ASSISTANT_PHONE_TAKEN', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const { s } = setup(jest.fn().mockRejectedValue(p2002));
    await expect(s.acceptInvite(asst)).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSISTANT_PHONE_TAKEN' },
    });
  });

  it('an invite taken or removed meanwhile is ASSISTANT_INVITE_NOT_FOUND', async () => {
    const p2025 = Object.assign(new Error('Record not found'), {
      code: 'P2025',
    });
    const { s } = setup(jest.fn().mockRejectedValue(p2025));
    await expect(s.acceptInvite(asst)).rejects.toMatchObject({
      status: 404,
      response: { code: 'ASSISTANT_INVITE_NOT_FOUND' },
    });
  });
});
