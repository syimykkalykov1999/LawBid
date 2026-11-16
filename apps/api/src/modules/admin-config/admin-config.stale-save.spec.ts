import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminConfigService } from './admin-config.service';

/**
 * Owner 14.11 (row 179, B5 / detective R3A-6): two admin tabs must not
 * overwrite each other. A save carries the `updatedAt` the editor saw; if
 * the row changed since, 409 STALE_VERSION (RFC 9110 §13.1.1 If-Match,
 * the Retool / Linear «changed by someone else» refusal). Without the field
 * the old last-write-wins stays (other screens, older admin builds).
 */
describe('settings and switches refuse a stale save', () => {
  const admin = {
    id: 'a1',
    adminRole: 'super_admin',
    sessionId: 's1',
    ip: null,
  } as unknown as AdminActor;
  const SEEN = new Date('2026-11-14T10:00:00.000Z');
  const NEWER = new Date('2026-11-14T10:05:00.000Z');

  function build(current: { config?: Date | null; flag?: Date }) {
    const configRow =
      current.config === undefined || current.config === null
        ? null
        : {
            key: 'feed.reco_scan_max',
            value: 1000,
            updated_at: current.config,
          };
    const flagRow = {
      key: 'video_posts',
      enabled: false,
      rollout_percent: 100,
      description: null,
      updated_by: null,
      updated_at: current.flag ?? SEEN,
    };
    const tx = {
      appConfig: {
        findUnique: jest.fn(() => Promise.resolve(configRow)),
        upsert: jest.fn(() =>
          Promise.resolve({
            key: 'feed.reco_scan_max',
            value: 900,
            updated_at: NEWER,
          }),
        ),
      },
      featureFlag: {
        findUnique: jest.fn(() => Promise.resolve(flagRow)),
        update: jest.fn(() =>
          Promise.resolve({
            ...flagRow,
            rollout_percent: 50,
            updated_at: NEWER,
          }),
        ),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const redis = { del: jest.fn(), incr: jest.fn(), set: jest.fn() };
    const svc = new AdminConfigService(
      prisma as never,
      redis as never,
      { get: () => undefined } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    return { svc, tx };
  }

  it('config: the value the editor saw → saved', async () => {
    const { svc, tx } = build({ config: SEEN });
    await expect(
      svc.updateConfig(admin, 'feed.reco_scan_max', 900, SEEN.toISOString()),
    ).resolves.toMatchObject({ value: 900 });
    expect(tx.appConfig.upsert).toHaveBeenCalled();
  });

  it('config: changed in another tab since → 409 STALE_VERSION, nothing written', async () => {
    const { svc, tx } = build({ config: NEWER });
    await expect(
      svc.updateConfig(admin, 'feed.reco_scan_max', 900, SEEN.toISOString()),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'STALE_VERSION',
        details: {
          currentUpdatedAt: NEWER.toISOString(),
          // Owner 15.11: the fresh row, so the admin shows it at once.
          current: {
            key: 'feed.reco_scan_max',
            value: 1000,
            stored: true,
            updatedAt: NEWER.toISOString(),
          },
        },
      },
    });
    expect(tx.appConfig.upsert).not.toHaveBeenCalled();
  });

  it('config: the editor saw the default (null) but someone saved a value → 409', async () => {
    const { svc } = build({ config: NEWER });
    await expect(
      svc.updateConfig(admin, 'feed.reco_scan_max', 900, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('config: no expectedUpdatedAt keeps last-write-wins', async () => {
    const { svc, tx } = build({ config: NEWER });
    await svc.updateConfig(admin, 'feed.reco_scan_max', 900);
    expect(tx.appConfig.upsert).toHaveBeenCalled();
  });

  it('flags: stale → 409, fresh → saved', async () => {
    const stale = build({ flag: NEWER });
    await expect(
      stale.svc.updateFlag(admin, 'video_posts', {
        rolloutPercent: 50,
        expectedUpdatedAt: SEEN.toISOString(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'STALE_VERSION',
        details: {
          current: {
            key: 'video_posts',
            enabled: false,
            rolloutPercent: 100,
            updatedAt: NEWER.toISOString(),
          },
        },
      },
    });
    expect(stale.tx.featureFlag.update).not.toHaveBeenCalled();
    const fresh = build({ flag: SEEN });
    await expect(
      fresh.svc.updateFlag(admin, 'video_posts', {
        rolloutPercent: 50,
        expectedUpdatedAt: SEEN.toISOString(),
      }),
    ).resolves.toMatchObject({ rolloutPercent: 50 });
  });
});
