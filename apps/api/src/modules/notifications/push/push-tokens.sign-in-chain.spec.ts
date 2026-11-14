/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { PrismaService } from '../../../prisma/prisma.service';
import { PushTokensService } from './push-tokens.service';
import { VoipTokensService } from './voip-tokens.service';

/**
 * DB scale review 14.11 (finding 8): a push / VoIP token belongs to the
 * device's sign-in chain, not to the one session row that was current when
 * it registered. Refreshes add rows to the chain and the nightly clean-up
 * removes the old ones; the token must stay while the chain is signed in.
 */
describe('push tokens keyed on the sign-in chain', () => {
  function prisma() {
    return {
      session: {
        findFirst: jest.fn(async () => ({ id: 's2' })),
        findMany: jest.fn(async () => [{ id: 's1' }, { id: 's2' }]),
        findUnique: jest.fn(async () => null),
      },
      pushToken: {
        upsert: jest.fn(async () => ({})),
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      voipToken: {
        upsert: jest.fn(async () => ({})),
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $queryRaw: jest.fn(async () => [] as unknown[]),
    };
  }

  it('register stores the chain next to the current row (create and update)', async () => {
    const p = prisma();
    await new PushTokensService(p as unknown as PrismaService).register(
      'u',
      'chain',
      'tok-a',
      'ios',
    );
    const [arg] = p.pushToken.upsert.mock.calls[0] as unknown as [
      { create: object; update: object },
    ];
    expect(arg.create).toMatchObject({
      session_id: 's2',
      session_chain_id: 'chain',
    });
    expect(arg.update).toMatchObject({
      session_id: 's2',
      session_chain_id: 'chain',
    });
  });

  it('VoIP register stores the chain and drops older tokens of the chain by it', async () => {
    const p = prisma();
    await new VoipTokensService(p as unknown as PrismaService).register(
      'u',
      'chain',
      'voip-new',
      't',
      'production',
    );
    const [arg] = p.voipToken.upsert.mock.calls[0] as unknown as [
      { create: object; update: object },
    ];
    expect(arg.create).toMatchObject({ session_chain_id: 'chain' });
    expect(arg.update).toMatchObject({ session_chain_id: 'chain' });
    expect(p.voipToken.deleteMany).toHaveBeenCalledWith({
      where: {
        user_id: 'u',
        token: { not: 'voip-new' },
        OR: [
          { session_chain_id: 'chain' },
          { session_chain_id: null, session: { session_chain_id: 'chain' } },
        ],
      },
    });
  });

  // Sessions of one account: chain A refreshed (row a1 removed by the
  // nightly clean-up, a2 live); chain B signed out; old-release row on b1.
  const sessions = [
    { id: 'a2', session_chain_id: 'A', live: true },
    { id: 'b1', session_chain_id: 'B', live: false },
    { id: 'c1', session_chain_id: 'C', live: true },
  ];
  const sessionFake = jest.fn(
    async (q: {
      where: { id?: { in: string[] }; session_chain_id?: { in: string[] } };
    }) =>
      q.where.id
        ? sessions.filter((x) => q.where.id!.in.includes(x.id))
        : sessions.filter(
            (x) =>
              x.live &&
              q.where.session_chain_id!.in.includes(x.session_chain_id),
          ),
  );

  it('activeDevices: alive by the token chain, though its own session row is gone; no SQL join', async () => {
    const p = prisma();
    p.session.findMany = sessionFake as never;
    p.pushToken.findMany = jest.fn(async () => [
      // registered on a1 (removed): pointer cleared, chain kept
      {
        fcm_token: 'tok-a',
        token_kind: 'fid',
        session_id: null,
        session_chain_id: 'A',
      },
      {
        fcm_token: 'tok-b',
        token_kind: 'token',
        session_id: 'b1',
        session_chain_id: 'B',
      },
      // older release: no chain, read through its session row
      {
        fcm_token: 'tok-c',
        token_kind: 'token',
        session_id: 'c1',
        session_chain_id: null,
      },
      // older release whose row is gone: nothing known, dead
      {
        fcm_token: 'tok-x',
        token_kind: 'token',
        session_id: null,
        session_chain_id: null,
      },
    ]) as never;
    const out = await new PushTokensService(
      p as unknown as PrismaService,
    ).activeDevices('u');
    expect(out).toEqual([
      { token: 'tok-a', fid: true },
      { token: 'tok-c', fid: false },
    ]);
    expect(p.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { fcm_token: { in: ['tok-b', 'tok-x'] } },
    });
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });

  it('VoIP activeDevices: the chain from the token, the live row as sessionId', async () => {
    const p = prisma();
    p.session.findMany = sessionFake as never;
    p.voipToken.findMany = jest.fn(async () => [
      {
        token: 'v1',
        topic: 't',
        environment: 'production',
        session_id: null,
        session_chain_id: 'A',
      },
      {
        token: 'v2',
        topic: 't',
        environment: 'production',
        session_id: 'b1',
        session_chain_id: 'B',
      },
    ]) as never;
    const out = await new VoipTokensService(
      p as unknown as PrismaService,
    ).activeDevices('u');
    expect(out).toEqual([
      {
        token: 'v1',
        topic: 't',
        environment: 'production',
        sessionId: 'a2',
        chainId: 'A',
      },
    ]);
    expect(p.voipToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['v2'] } },
    });
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });

  it('deviceSession reads the chain from the token row (its session row may be gone)', async () => {
    const p = prisma();
    p.pushToken.findUnique.mockResolvedValueOnce({
      user_id: 'u',
      session_id: null,
      session_chain_id: 'chain',
    });
    p.session.findFirst.mockResolvedValueOnce({ id: 's7' });
    await expect(
      new PushTokensService(p as unknown as PrismaService).deviceSession(
        'tok-a',
      ),
    ).resolves.toEqual({ userId: 'u', sessionChainId: 'chain' });
    expect(p.session.findUnique).not.toHaveBeenCalled();
  });

  it('fcmTokensCoveredBy matches FCM tokens by chain, also on rows whose session row is gone', async () => {
    const p = prisma();
    p.session.findMany
      .mockResolvedValueOnce([{ session_chain_id: 'chain' } as never])
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's9' }]);
    await new VoipTokensService(
      p as unknown as PrismaService,
    ).fcmTokensCoveredBy(['s9']);
    // Literal ids, no relation sub-select: the planner uses both indexes.
    expect(p.pushToken.findMany).toHaveBeenCalledWith({
      where: {
        platform: 'ios',
        OR: [
          { session_chain_id: { in: ['chain'] } },
          { session_chain_id: null, session_id: { in: ['s1', 's9'] } },
        ],
      },
      select: { fcm_token: true },
    });
  });
});
