import { ForbiddenException } from '@nestjs/common';
import { AdminsService } from './admins.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: (prisma: unknown, fn: (tx: unknown) => unknown) => fn(prisma),
}));

const actor = {
  id: 'super-1',
  ip: null,
  adminRole: 'super_admin',
} as unknown as AdminActor;
/** An admin the super admin gave the right to manage others; holds users
 * (manage) and support (view) himself. */
const manager = {
  id: 'mgr-1',
  ip: null,
  adminRole: 'support',
  manageAdmins: true,
  permissions: { users: 'manage', support: 'view' },
} as unknown as AdminActor;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'u2',
    email: 'a@x.io',
    status: 'active',
    created_at: new Date('2026-10-01T00:00:00Z'),
    admin_profile: { admin_role: 'support', permissions: { users: 'view' } },
    admin_credential: {
      totp_enabled_at: new Date(),
      last_login_at: null,
      login: 'ann',
      password_hash: 'scrypt$x',
    },
    ...over,
  };
}

function build(found = row()) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(found),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(
          row({
            admin_profile: {
              admin_role: data.admin_profile.create.admin_role,
              permissions: data.admin_profile.create.permissions,
            },
          }),
        ),
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(
          row(
            data.admin_profile
              ? {
                  admin_profile: {
                    admin_role: 'support',
                    permissions: data.admin_profile.update.permissions,
                  },
                }
              : {},
          ),
        ),
      ),
    },
    adminCredential: { updateMany: jest.fn(), deleteMany: jest.fn() },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
  const svc = new AdminsService(
    prisma as never,
    audit as never,
    sessions as never,
  );
  return { svc, prisma, audit, sessions };
}

describe('AdminsService access toggles', () => {
  it('stores only known areas and levels, never money or keys', async () => {
    const { svc, prisma, sessions } = build();
    const out = await svc.setPermissions(actor, 'u2', {
      users: 'manage',
      support: 'view',
      money: 'manage',
      integrations: 'manage',
      content: 'root',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          admin_profile: {
            update: { permissions: { users: 'manage', support: 'view' } },
          },
        },
      }),
    );
    expect(out.permissions).toEqual({ users: 'manage', support: 'view' });
    // Applies live: no session is ended.
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('refuses to change toggles of yourself or of a super admin', async () => {
    const a = build();
    await expect(
      a.svc.setPermissions(actor, 'super-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const b = build(
      row({ admin_profile: { admin_role: 'super_admin', permissions: {} } }),
    );
    await expect(b.svc.setPermissions(actor, 'u2', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a new admin starts with the defaults of the role', async () => {
    const { svc, prisma } = build();
    await svc.create(actor, 'New@X.io', 'moderator');
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.admin_profile.create.permissions).toMatchObject({
      moderation: 'manage',
    });
    expect(data.admin_profile.create.permissions).not.toHaveProperty('money');
  });

  it('reset 2FA keeps the login and password', async () => {
    const { svc, prisma, sessions } = build();
    await svc.resetTotp(actor, 'u2');
    expect(prisma.adminCredential.deleteMany).not.toHaveBeenCalled();
    expect(prisma.adminCredential.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u2' },
      data: { totp_enabled_at: null, recovery_codes_hash: [] },
    });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u2');
  });

  it('the list shows login and whether a password is set, never the hash', async () => {
    const { svc, prisma } = build();
    (prisma.user as unknown as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([row()]);
    const [a] = await svc.list(actor);
    expect(a).toMatchObject({ login: 'ann', hasPassword: true });
    expect(JSON.stringify(a)).not.toContain('scrypt');
  });
});

describe('AdminsService delegated management', () => {
  it('the super admin can hand out the manager right; it is kept when toggles change', async () => {
    const { svc, prisma } = build();
    await svc.setPermissions(actor, 'u2', { users: 'view' }, true);
    expect(prisma.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          admin_profile: {
            update: { permissions: { users: 'view', manage_admins: true } },
          },
        },
      }),
    );
    const kept = build(
      row({
        admin_profile: {
          admin_role: 'support',
          permissions: { users: 'view', manage_admins: true },
        },
      }),
    );
    await kept.svc.setPermissions(actor, 'u2', { support: 'view' });
    expect(kept.prisma.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          admin_profile: {
            update: {
              permissions: { support: 'view', manage_admins: true },
            },
          },
        },
      }),
    );
  });

  it('a manager grants only what they hold, never more or the manager right', async () => {
    const { svc, prisma } = build();
    await svc.setPermissions(manager, 'u2', { users: 'view', support: 'view' });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    await expect(
      svc.setPermissions(manager, 'u2', { support: 'manage' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.setPermissions(manager, 'u2', { verification: 'view' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.setPermissions(manager, 'u2', { users: 'view' }, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('a manager cannot touch a super admin, another manager or a stronger admin', async () => {
    const cases = [
      { admin_role: 'super_admin', permissions: {} },
      {
        admin_role: 'support',
        permissions: { users: 'view', manage_admins: true },
      },
      { admin_role: 'moderator', permissions: { moderation: 'manage' } },
    ];
    for (const profile of cases) {
      const { svc, prisma, sessions } = build(row({ admin_profile: profile }));
      await expect(svc.setEnabled(manager, 'u2', false)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(svc.resetTotp(manager, 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(svc.remove(manager, 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(svc.assertCanManage(manager, 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    }
  });

  it('a manager cannot touch their own account', async () => {
    const { svc } = build();
    await expect(svc.assertCanManage(manager, 'mgr-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.remove(manager, 'mgr-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a manager creates admins inside their own access, never a super admin or a manager', async () => {
    const { svc, prisma } = build();
    // Role defaults are capped at what the manager holds.
    await svc.create(manager, 'n@x.io', 'moderator');
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.admin_profile.create.permissions).toEqual({ users: 'view' });
    await expect(
      svc.create(manager, 'n2@x.io', 'super_admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.create(manager, 'n3@x.io', 'support', undefined, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.create(manager, 'n4@x.io', 'support', { verification: 'view' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('a manager can remove an admin within reach: account closed, sessions ended', async () => {
    const { svc, prisma, sessions, audit } = build();
    await svc.remove(manager, 'u2');
    expect(prisma.adminCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'u2' },
        data: expect.objectContaining({ login: null, password_hash: null }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'suspended' }),
      }),
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admins.delete' }),
      expect.anything(),
    );
  });

  it('the list hides the login of admins outside a manager’s reach', async () => {
    const { svc, prisma } = build();
    (prisma.user as unknown as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([
        row(),
        row({
          id: 'boss',
          admin_profile: { admin_role: 'super_admin', permissions: {} },
          admin_credential: { login: 'thesima', password_hash: 'x' },
        }),
      ]);
    const [mine, boss] = await svc.list(manager);
    expect(mine.login).toBe('ann');
    expect(boss.login).toBeNull();
  });
});
