/* eslint-disable @typescript-eslint/require-await -- hand-made Redis fakes */
import { PresenceService } from './presence.service';

/**
 * Verify batch 7 (BL2, 2026-11-17): a block hides "online / last seen" both
 * ways, as Instagram and WhatsApp do (a blocked person sees no activity
 * status). The watcher who opened the chat before the block is dropped on
 * the next announcement (mayWatch answers no).
 */
describe('PresenceService and blocks', () => {
  function make(blocks: { blocker_id: string; blocked_id: string }[]) {
    const kv = new Map<string, string>();
    const redis = {
      set: jest.fn(async (k: string, v: string) => {
        kv.set(k, v);
        return 'OK';
      }),
      get: jest.fn(async (k: string) => kv.get(k) ?? null),
      del: jest.fn(async (k: string) => (kv.delete(k) ? 1 : 0)),
      pipeline: () => {
        const p = {
          zcount: () => p,
          exec: async () => [
            [null, 1],
            [null, 1],
          ],
        };
        return p;
      },
    };
    // The block-set cache is down (every read a miss): the query answers.
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
    };
    const prisma = {
      user: {
        findMany: jest.fn(async () => [
          { id: 'v', last_active_at: null, show_activity_status: true },
          { id: 't', last_active_at: null, show_activity_status: true },
          { id: 'o', last_active_at: null, show_activity_status: true },
        ]),
      },
      userBlock: { findMany: jest.fn(async () => blocks) },
    };
    const privacy = {
      lastSeenVisibleTo: jest.fn(
        async (_v: string, ids: string[]) => new Set(ids),
      ),
    };
    const svc = new PresenceService(
      prisma as never,
      redis as never,
      privacy as never,
      cache as never,
    );
    return { svc };
  }

  it('snapshot leaves out a person the viewer blocked, and one who blocked the viewer', async () => {
    const mine = make([{ blocker_id: 'v', blocked_id: 't' }]);
    const a = await mine.svc.snapshot('v', ['t', 'o']);
    expect([...a.keys()]).toEqual(['o']);
    const theirs = make([{ blocker_id: 't', blocked_id: 'v' }]);
    const b = await theirs.svc.snapshot('v', ['t', 'o']);
    expect([...b.keys()]).toEqual(['o']);
  });

  it('mayWatch answers no across a block (the gateway drops the watcher)', async () => {
    const { svc } = make([{ blocker_id: 't', blocked_id: 'v' }]);
    expect(await svc.mayWatch('v', 't', 0)).toBe(false);
    expect(await svc.mayWatch('v', 't', 30)).toBe(false);
    expect(await svc.mayWatch('v', 'o', 30)).toBe(true);
  });
});
