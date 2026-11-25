import { ForbiddenException } from '@nestjs/common';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  AdminConfigService,
  OWNER_ONLY_FLAGS,
  isOwnerOnlyConfigKey,
} from './admin-config.service';

/**
 * Round 4 admin check (25.11, В5 + С1): the switches that move real money
 * (automatic refunds of bank inquiries, Stripe salary payouts, the economy
 * guard) and the admin / app security settings were changed by any
 * employee holding «Настройки: управление», without a code. Now only the
 * owner, and only with a fresh 2FA code — the same rule as the refund caps.
 */
describe('owner-only money switches and security settings', () => {
  const owner = {
    id: 'o1',
    adminRole: 'super_admin',
    sessionId: 's-owner',
    ip: null,
  } as unknown as AdminActor;
  const staff = {
    id: 'm1',
    adminRole: 'moderator',
    sessionId: 's-staff',
    ip: null,
  } as unknown as AdminActor;

  function build(stepUp: 'ok' | 'missing', key = 'dispute_auto_refund') {
    const flagRow = {
      key,
      enabled: false,
      rollout_percent: 100,
      description: null,
      updated_by: null,
      updated_at: new Date('2026-11-25T10:00:00.000Z'),
    };
    const tx = {
      appConfig: {
        findUnique: jest.fn(() => Promise.resolve(null)),
        upsert: jest.fn(() =>
          Promise.resolve({ key: 'x', value: 1, updated_at: new Date() }),
        ),
      },
      featureFlag: {
        findUnique: jest.fn(() => Promise.resolve(flagRow)),
        update: jest.fn(() => Promise.resolve({ ...flagRow, enabled: true })),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const auth = {
      assertStepUp: jest.fn(() =>
        stepUp === 'ok'
          ? Promise.resolve()
          : Promise.reject(
              new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
            ),
      ),
    };
    const svc = new AdminConfigService(
      prisma as never,
      { del: jest.fn(), incr: jest.fn(), set: jest.fn() } as never,
      { get: () => undefined } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { record: jest.fn() } as never,
      undefined,
      auth as never,
    );
    return { svc, tx, auth };
  }

  it('lists exactly the three money switches', () => {
    expect([...OWNER_ONLY_FLAGS].sort()).toEqual([
      'dispute_auto_refund',
      'economy_guard',
      'payroll_stripe_payouts',
    ]);
  });

  it.each([...OWNER_ONLY_FLAGS])(
    '%s: an employee with «Настройки» gets 403 and nothing changes',
    async (key) => {
      const { svc, tx } = build('ok', key);
      await expect(
        svc.updateFlag(staff, key, { enabled: true }),
      ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
      expect(tx.featureFlag.update).not.toHaveBeenCalled();
    },
  );

  it.each([...OWNER_ONLY_FLAGS])(
    '%s: the owner needs a fresh code',
    async (key) => {
      const { svc, tx, auth } = build('missing', key);
      await expect(
        svc.updateFlag(owner, key, { enabled: true }),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_STEP_UP_REQUIRED' } });
      expect(auth.assertStepUp).toHaveBeenCalledWith('s-owner');
      expect(tx.featureFlag.update).not.toHaveBeenCalled();
    },
  );

  it('the owner with a fresh code switches it', async () => {
    const { svc, tx } = build('ok');
    await svc.updateFlag(owner, 'dispute_auto_refund', { enabled: true });
    expect(tx.featureFlag.update).toHaveBeenCalled();
  });

  it('an ordinary flag stays the employee’s with «Настройки»', async () => {
    const { svc, tx, auth } = build('missing', 'crash_reports');
    await svc.updateFlag(staff, 'crash_reports', { enabled: true });
    expect(auth.assertStepUp).not.toHaveBeenCalled();
    expect(tx.featureFlag.update).toHaveBeenCalled();
  });

  it.each([
    'admin.ip_allowlist_enabled',
    'admin.ip_allowlist',
    'admin.country_allowlist',
    'admin.max_concurrent_sessions',
    'security.turnstile.mode',
    'security.app_check.mode',
  ])('%s is the owner’s, with a code', async (key) => {
    expect(isOwnerOnlyConfigKey(key)).toBe(true);
    const { svc, tx } = build('ok');
    await expect(svc.updateConfig(staff, key, 'off')).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    expect(tx.appConfig.upsert).not.toHaveBeenCalled();
  });
});
