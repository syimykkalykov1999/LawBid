import { NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

/**
 * Verify batch 11 (B2): an employee limited to some countries can open only
 * those countries' people (card, contacts) — and may act only on them too.
 * Before the fix the single actions (suspend, restore, warn, end sessions,
 * reset password, change phone, bulk by ids) found the user by id alone.
 */
describe('AdminUsersService actions keep the admin country scope (B2)', () => {
  const US_USER = '00000000-0000-4000-8000-000000000001';
  function build() {
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    const seen: unknown[] = [];
    const row = {
      id: US_USER,
      role: 'client',
      status: 'active',
      deleted_at: null,
      suspended_reason: null,
      country_code: 'US',
    };
    const match = (where: Record<string, unknown>) => {
      seen.push(where);
      if (where.id !== row.id) return null;
      const cc = where.country_code as { in?: string[] } | undefined;
      if (cc?.in && !cc.in.includes(row.country_code)) return null;
      return row;
    };
    const user = {
      findUnique: jest.fn(({ where }) => Promise.resolve(match(where))),
      findFirst: jest.fn(({ where }) => Promise.resolve(match(where))),
    };
    Object.assign(svc, {
      prisma: { user },
      audit: { record: jest.fn() },
      sessions: { revokeAllChainsForUser: jest.fn().mockResolvedValue([]) },
      passwordAuth: { clearPasswordByAdmin: jest.fn() },
    });
    return { svc, seen };
  }
  const caOnly = {
    id: 'staff',
    ip: null,
    adminRole: 'support',
    countries: ['CA'],
  } as never;
  const everyCountry = {
    id: 'staff',
    ip: null,
    adminRole: 'support',
    countries: null,
  } as never;

  it('ending sessions of a person outside the scope is 404', async () => {
    const { svc } = build();
    await expect(svc.revokeSessions(caOnly, US_USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resetting the password of a person outside the scope is 404', async () => {
    const { svc } = build();
    await expect(svc.resetPassword(caOnly, US_USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('suspending a person outside the scope is 404', async () => {
    const { svc } = build();
    await expect(
      svc.suspend(caOnly, US_USER, 'spam spam'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a bulk id list skips people outside the scope', async () => {
    const { svc } = build();
    const out = await svc.bulk(caOnly, {
      action: 'logout',
      ids: [US_USER],
      reason: '',
    } as never);
    expect(out.done).toHaveLength(0);
  });

  it('an admin with every country still acts', async () => {
    const { svc } = build();
    await expect(svc.revokeSessions(everyCountry, US_USER)).resolves.toEqual(
      expect.objectContaining({ userId: US_USER }),
    );
  });
});
