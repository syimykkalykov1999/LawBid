import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminConfigService, CONFIG_AUDIT } from './admin-config.service';

/**
 * Row 150 (R2 review of #1084): changing the bucketing hash of a flag that
 * is on for only part of the users re-picks who has it. That change gets
 * its own audit line («re-bucketed»), so a shift in a measurement can be
 * traced to it; a flag on for nobody or everybody moves nobody.
 */
describe('a hash-version change of a live flag is audited as re-bucketed', () => {
  const admin = {
    id: 'a1',
    adminRole: 'super_admin',
    sessionId: 's1',
    ip: '203.0.113.7',
  } as unknown as AdminActor;

  function build(before: {
    enabled: boolean;
    rollout_percent: number;
    hash_version: number;
  }) {
    const row = {
      key: 'reels',
      description: null,
      updated_by: null,
      updated_at: new Date('2026-11-14T10:00:00.000Z'),
      ...before,
    };
    const tx = {
      featureFlag: {
        findUnique: jest.fn(() => Promise.resolve(row)),
        update: jest.fn((a: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...row, ...a.data }),
        ),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { record: jest.fn() };
    const svc = new AdminConfigService(
      prisma as never,
      { del: jest.fn(), incr: jest.fn(), set: jest.fn() } as never,
      { get: () => undefined } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      audit as never,
    );
    const actions = () =>
      audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    return { svc, audit, actions };
  }

  it('30 % rollout, hash 1 → 2: a second line «re-bucketed» with both versions', async () => {
    const { svc, audit, actions } = build({
      enabled: true,
      rollout_percent: 30,
      hash_version: 1,
    });
    await svc.updateFlag(admin, 'reels', { hashVersion: 2 });
    expect(actions()).toEqual([CONFIG_AUDIT.flag, CONFIG_AUDIT.flagRebucketed]);
    expect(CONFIG_AUDIT.flagRebucketed).toBe('config.flag_rebucketed');
    expect(audit.record.mock.calls[1][0]).toMatchObject({
      adminId: 'a1',
      targetType: 'feature_flag',
      ip: '203.0.113.7',
      before: { key: 'reels', hashVersion: 1, rolloutPercent: 30 },
      after: { key: 'reels', hashVersion: 2, rolloutPercent: 30 },
    });
  });

  it.each([
    ['off', { enabled: false, rollout_percent: 30 }],
    ['on for everybody', { enabled: true, rollout_percent: 100 }],
    ['on for nobody', { enabled: true, rollout_percent: 0 }],
  ])(
    'a flag %s: hash change moves nobody, only the usual line',
    async (_n, f) => {
      const { svc, actions } = build({ ...f, hash_version: 1 });
      await svc.updateFlag(admin, 'reels', { hashVersion: 2 });
      expect(actions()).toEqual([CONFIG_AUDIT.flag]);
    },
  );

  it('same hash, other percent: no re-bucketed line', async () => {
    const { svc, actions } = build({
      enabled: true,
      rollout_percent: 30,
      hash_version: 2,
    });
    await svc.updateFlag(admin, 'reels', { rolloutPercent: 40 });
    expect(actions()).toEqual([CONFIG_AUDIT.flag]);
  });
});
