/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { VoipTokensService } from './voip-tokens.service';

/**
 * Owner 2026-11-03 (an unlocked iPhone showed «НЕОТЛОЖНЫЕ · Входящий звонок»
 * beside CallKit's call banner): the iPhone that rang by VoIP must not get
 * the FCM call alert. Its FCM and VoIP tokens were registered at different
 * times, so they sit on DIFFERENT session rows of the same sign-in chain
 * (each token refresh adds a row) — the match is by chain.
 */
describe('VoipTokensService.fcmTokensCoveredBy', () => {
  const sessions = [
    { id: 's-old', session_chain_id: 'chain-iphone' },
    { id: 's-new', session_chain_id: 'chain-iphone' },
    { id: 's-other', session_chain_id: 'chain-ipad' },
  ];
  const pushTokens = [
    // FCM token registered before the last refresh: the older row.
    { fcm_token: 'fcm-iphone', platform: 'ios', session_id: 's-old' },
    { fcm_token: 'fcm-ipad', platform: 'ios', session_id: 's-other' },
    { fcm_token: 'fcm-android', platform: 'android', session_id: 's-new' },
  ];
  const prisma = {
    session: {
      findMany: jest.fn(async (a: { where: { id: { in: string[] } } }) =>
        sessions
          .filter((s) => a.where.id.in.includes(s.id))
          .map((s) => ({ session_chain_id: s.session_chain_id })),
      ),
    },
    pushToken: {
      findMany: jest.fn(
        async (a: {
          where: {
            platform: string;
            session: { session_chain_id: { in: string[] } };
          };
        }) =>
          pushTokens
            .filter(
              (t) =>
                t.platform === a.where.platform &&
                a.where.session.session_chain_id.in.includes(
                  sessions.find((s) => s.id === t.session_id)
                    ?.session_chain_id ?? '',
                ),
            )
            .map((t) => ({ fcm_token: t.fcm_token })),
      ),
    },
  };
  const svc = new VoipTokensService(prisma as never);

  it('covers the iPhone FCM token on another session row of the same chain', async () => {
    // The VoIP token sits on the newer row.
    await expect(svc.fcmTokensCoveredBy(['s-new'])).resolves.toEqual([
      'fcm-iphone',
    ]);
  });

  it('never covers another device or an Android token', async () => {
    const out = await svc.fcmTokensCoveredBy(['s-new']);
    expect(out).not.toContain('fcm-ipad');
    expect(out).not.toContain('fcm-android');
  });

  it('nothing rang: nothing is skipped', async () => {
    await expect(svc.fcmTokensCoveredBy([])).resolves.toEqual([]);
    await expect(svc.fcmTokensCoveredBy(['unknown'])).resolves.toEqual([]);
  });
});
