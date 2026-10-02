import { ForbiddenException } from '@nestjs/common';
import { AdminsService } from './admins.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: (prisma: unknown, fn: (tx: unknown) => unknown) => fn(prisma),
}));

const actor = { id: 'super-1', ip: null } as unknown as AdminActor;

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
          row({
            admin_profile: {
              admin_role: 'support',
              permissions: data.admin_profile.update.permissions,
            },
          }),
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
    const [a] = await svc.list();
    expect(a).toMatchObject({ login: 'ann', hasPassword: true });
    expect(JSON.stringify(a)).not.toContain('scrypt');
  });
});
