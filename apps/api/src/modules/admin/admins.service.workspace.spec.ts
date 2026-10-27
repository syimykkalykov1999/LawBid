import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminsService } from './admins.service';

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: (prisma: unknown, fn: (tx: unknown) => unknown) => fn(prisma),
}));

/**
 * Staff package T2: the workspace rules of AdminsService — the head hires
 * and grants only inside their workspace and ceiling, never to themselves;
 * the owner sets the workspace and the head flag (one head per workspace,
 * none in finance); every change is audited.
 */
const owner = {
  id: 'owner-1',
  ip: null,
  adminRole: 'super_admin',
  workspace: 'owner',
} as unknown as AdminActor;
const head = {
  id: 'head-1',
  ip: null,
  adminRole: 'support',
  workspace: 'mass',
  workspaceHead: true,
  permissions: { support: 'manage', verification: 'manage' },
} as unknown as AdminActor;
const deputy = {
  id: 'dep-1',
  ip: null,
  adminRole: 'support',
  manageAdmins: true,
  workspace: 'mass',
  permissions: { users: 'manage', support: 'manage', payroll: 'manage' },
} as unknown as AdminActor;

interface Prof {
  admin_role?: string;
  permissions?: Record<string, unknown>;
  workspace?: string;
  is_workspace_head?: boolean;
}

function row(id: string, prof: Prof = {}, status = 'active') {
  return {
    id,
    email: `${id}@x.io`,
    status,
    created_at: new Date('2026-10-01T00:00:00Z'),
    admin_profile: {
      admin_role: 'verifier',
      permissions: { verification: 'manage' },
      workspace: 'mass',
      is_workspace_head: false,
      ...prof,
    },
    admin_credential: {
      totp_enabled_at: new Date(),
      last_login_at: null,
      login: 'ann',
      password_hash: 'scrypt$x',
    },
  };
}

function build(
  found: ReturnType<typeof row>,
  opts: { on?: boolean; headOn?: boolean; team?: unknown[]; max?: number } = {},
) {
  const on = opts.on ?? true;
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve(
          row('new-1', {
            admin_role: data.admin_profile.create.admin_role,
            permissions: data.admin_profile.create.permissions,
            workspace: data.admin_profile.create.workspace,
          }),
        ),
      ),
      update: jest.fn().mockImplementation(({ data }) => {
        const upd = data.admin_profile?.update ?? {};
        return Promise.resolve(
          row(found.id, { ...found.admin_profile, ...upd }, found.status),
        );
      }),
    },
    adminProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(opts.team ?? []),
    },
    adminCredential: { updateMany: jest.fn() },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
  const staff = {
    isOn: jest.fn((key: string) =>
      Promise.resolve(
        key === 'staff.workspaces_enabled'
          ? on
          : key === 'staff.head_enabled'
            ? (opts.headOn ?? on)
            : false,
      ),
    ),
    number: jest.fn().mockResolvedValue(opts.max ?? 50),
  };
  const retaliation = {
    check: jest.fn().mockResolvedValue({ flagged: false }),
  };
  const svc = new AdminsService(
    prisma as never,
    audit as never,
    sessions as never,
    staff as never,
    retaliation,
  );
  return { svc, prisma, audit, sessions, staff, retaliation };
}

const worker = () => row('w1');

describe('a head hires inside the workspace', () => {
  it('creates a verifier in the head’s own workspace', async () => {
    const { svc, prisma, audit } = build(worker());
    const out = await svc.create(head, 'New@X.io', 'verifier', {
      verification: 'manage',
      users: 'view',
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.admin_profile.create.workspace).toBe('mass');
    expect(out.workspace).toBe('mass');
    expect(out.workspaceHead).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admins.create',
        after: expect.objectContaining({ workspace: 'mass' }),
      }),
      expect.anything(),
    );
  });

  it.each([
    ['payroll', { payroll: 'manage' }],
    ['money', { money: 'view' }],
    ['exports', { exports: 'view' }],
    ['settings', { settings: 'view' }],
    ['users manage (read only in mass)', { users: 'manage' }],
  ])('refuses a hand-made grant of %s', async (_n, perms) => {
    const { svc, prisma } = build(worker());
    await expect(
      svc.create(head, 'n@x.io', 'verifier', perms),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('never creates a second owner, a deputy or a finance role', async () => {
    const { svc } = build(worker());
    await expect(
      svc.create(head, 'n@x.io', 'super_admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.create(head, 'n@x.io', 'verifier', undefined, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.create(head, 'n@x.io', 'finance')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses when the team is full (staff.head.max_admins)', async () => {
    const team = [
      { permissions: {} },
      { permissions: {} },
      // a deputy and a partner's member do not take a seat
      { permissions: { manage_admins: true } },
      {
        permissions: {
          country_partner: '11111111-1111-4111-8111-111111111111',
        },
      },
    ];
    const { svc } = build(worker(), { team, max: 2 });
    await expect(svc.create(head, 'n@x.io', 'verifier')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const roomy = build(worker(), { team, max: 3 });
    await expect(
      roomy.svc.create(head, 'n@x.io', 'verifier'),
    ).resolves.toBeDefined();
  });

  it('role defaults are cut to the ceiling when nothing is spelled out', async () => {
    const { svc, prisma } = build(worker());
    await svc.create(head, 'n@x.io', 'support');
    const data = prisma.user.create.mock.calls[0][0].data;
    // support defaults: dashboard view, support manage, users view: all fit
    expect(data.admin_profile.create.permissions).toEqual({
      dashboard: 'view',
      support: 'manage',
      users: 'view',
    });
  });
});

describe('a head grants and reaches only inside the workspace', () => {
  it('grants an area inside the ceiling to a mass worker', async () => {
    const { svc, prisma, audit } = build(worker());
    await svc.setPermissions(head, 'w1', {
      verification: 'manage',
      moderation: 'view',
    });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admins.set_permissions' }),
      expect.anything(),
    );
  });

  it.each([
    'payroll',
    'money',
    'economy',
    'budget_limits',
    'audit',
    'exports',
    'legal',
  ])('refuses to grant %s', async (area) => {
    const { svc, prisma } = build(worker());
    await expect(
      svc.setPermissions(head, 'w1', { [area]: 'view' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('cannot change their own rights', async () => {
    const { svc } = build(row('head-1', { is_workspace_head: true }));
    await expect(
      svc.setPermissions(head, 'head-1', { verification: 'manage' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot set the deputy right or the no-PII flag', async () => {
    const { svc } = build(worker());
    await expect(
      svc.setPermissions(head, 'w1', {}, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.setPermissions(head, 'w1', {}, undefined, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [
      'another workspace',
      row('w2', {
        workspace: 'finance',
        admin_role: 'finance',
        permissions: { payroll: 'manage' },
      }),
    ],
    [
      'the owner',
      row('o2', {
        admin_role: 'super_admin',
        workspace: 'owner',
        permissions: {},
      }),
    ],
    [
      'the deputy',
      row('d2', { permissions: { manage_admins: true, support: 'view' } }),
    ],
    ['another head', row('h2', { is_workspace_head: true })],
    [
      'a partner team member',
      row('p2', {
        permissions: {
          country_partner: '11111111-1111-4111-8111-111111111111',
          support: 'view',
        },
      }),
    ],
    [
      'a worker already holding money',
      row('m2', { permissions: { money: 'view' } }),
    ],
  ])('does not reach %s', async (_n, target) => {
    const { svc, prisma } = build(target);
    await expect(
      svc.setPermissions(head, target.id, { support: 'view' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.setEnabled(head, target.id, false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('disables a worker of their own workspace; deleting stays with the owner', async () => {
    const { svc, prisma, sessions } = build(worker());
    await svc.setEnabled(head, 'w1', false);
    expect(prisma.user.update).toHaveBeenCalled();
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('w1');
    await expect(svc.remove(head, 'w1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lists only their own workspace: no owner, deputy, partner or other workspace', async () => {
    const { svc, prisma } = build(worker());
    prisma.user.findMany.mockResolvedValue([
      row('w1'),
      row('w2'),
      row('fin', { workspace: 'finance', admin_role: 'finance' }),
      row('own', { admin_role: 'super_admin', workspace: 'owner' }),
      row('dep', { permissions: { manage_admins: true } }),
      row('par', {
        permissions: {
          country_partner: '11111111-1111-4111-8111-111111111111',
        },
      }),
      row('head-1', { is_workspace_head: true }),
    ]);
    const out = await svc.list(head);
    expect(out.map((a) => a.id).sort()).toEqual(['head-1', 'w1', 'w2']);
  });

  it('asks the retaliation port before a head cuts rights or switches someone off', async () => {
    const a = build(worker());
    await a.svc.setPermissions(head, 'w1', { support: 'view' });
    expect(a.retaliation.check).toHaveBeenCalledWith(
      'w1',
      'head-1',
      'rights_cut',
    );
    const b = build(worker());
    await b.svc.setEnabled(head, 'w1', false);
    expect(b.retaliation.check).toHaveBeenCalledWith(
      'w1',
      'head-1',
      'offboard',
    );
    // a widening grant and the owner's own actions are not asked about
    const c = build(worker());
    await c.svc.setPermissions(head, 'w1', {
      verification: 'manage',
      support: 'view',
    });
    expect(c.retaliation.check).not.toHaveBeenCalled();
    const d = build(worker());
    await d.svc.setEnabled(owner, 'w1', false);
    expect(d.retaliation.check).not.toHaveBeenCalled();
  });
});

describe('ceilings for everybody else', () => {
  it('refuses payroll for a mass worker even from the owner, while workspaces are on', async () => {
    const { svc, prisma } = build(worker());
    await expect(
      svc.setPermissions(owner, 'w1', { payroll: 'manage' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('is exactly as before while workspaces are off', async () => {
    const { svc, prisma } = build(worker(), { on: false });
    await svc.setPermissions(owner, 'w1', { payroll: 'manage' });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('a head is no head while the switch is off: the old rule (own rights) applies', async () => {
    // The guard does not set workspaceHead while the switches are off.
    const asWorker = { ...head, workspaceHead: false } as unknown as AdminActor;
    const { svc } = build(worker(), { on: false });
    await expect(
      svc.setPermissions(asWorker, 'w1', { moderation: 'view' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the deputy is outside the workspaces: no ceiling for or against them', async () => {
    const dep = build(row('d2', { permissions: { manage_admins: true } }));
    await expect(
      dep.svc.setPermissions(owner, 'd2', { payroll: 'manage' }),
    ).resolves.toBeDefined();
    // …and a deputy hiring a mass worker is held to the ceiling
    const { svc } = build(worker());
    await expect(
      svc.create(deputy, 'n@x.io', 'support', { payroll: 'manage' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('presets are cut to the ceiling instead of refused', async () => {
    const { svc, prisma } = build(worker());
    await svc.create(
      owner,
      'acc@x.io',
      'finance',
      {
        dashboard: 'view',
        users: 'view',
        economy: 'view',
        budget_limits: 'manage',
      },
      undefined,
      true,
      true,
    );
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.admin_profile.create.workspace).toBe('finance');
    expect(data.admin_profile.create.permissions).toMatchObject({
      dashboard: 'view',
      economy: 'view',
      budget_limits: 'manage',
    });
    expect(data.admin_profile.create.permissions.users).toBeUndefined();
  });

  it('the owner’s new finance admin goes to the finance workspace, a super admin to owner', async () => {
    const a = build(worker());
    await a.svc.create(owner, 'f@x.io', 'finance');
    expect(
      a.prisma.user.create.mock.calls[0][0].data.admin_profile.create.workspace,
    ).toBe('finance');
    const b = build(worker());
    await b.svc.create(owner, 'o@x.io', 'super_admin');
    expect(
      b.prisma.user.create.mock.calls[0][0].data.admin_profile.create.workspace,
    ).toBe('owner');
  });

  it('a new role moves the workspace with it and drops the head flag', async () => {
    const { svc, prisma, audit } = build(
      row('w1', { is_workspace_head: true }),
    );
    prisma.user.findFirst.mockResolvedValue(
      row('w1', { is_workspace_head: true }),
    );
    await svc.setRole(owner, 'w1', 'finance');
    expect(
      prisma.user.update.mock.calls[0][0].data.admin_profile.update,
    ).toEqual({
      admin_role: 'finance',
      workspace: 'finance',
      is_workspace_head: false,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admins.set_role',
        after: { role: 'finance', workspace: 'finance' },
      }),
      expect.anything(),
    );
  });
});

describe('setWorkspace (owner only)', () => {
  it('moves an admin whose sections fit, audits it and drops a head flag', async () => {
    const { svc, prisma, audit } = build(
      row('w1', {
        is_workspace_head: true,
        permissions: { support: 'manage' },
      }),
    );
    const out = await svc.setWorkspace(owner, 'w1', 'owner');
    expect(
      prisma.user.update.mock.calls[0][0].data.admin_profile.update,
    ).toEqual({
      workspace: 'owner',
      is_workspace_head: false,
    });
    expect(out.workspace).toBe('owner');
    expect(out.workspaceHead).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admins.set_workspace',
        before: { workspace: 'mass', workspaceHead: true },
        after: { workspace: 'owner', workspaceHead: false },
      }),
      expect.anything(),
    );
  });

  it('is the owner’s alone', async () => {
    const { svc } = build(worker());
    await expect(
      svc.setWorkspace(head, 'w1', 'finance'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.setWorkspace(deputy, 'w1', 'finance'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('409 when their sections do not fit the new workspace', async () => {
    const { svc, prisma } = build(
      row('w1', { permissions: { support: 'manage', verification: 'view' } }),
    );
    await expect(
      svc.setWorkspace(owner, 'w1', 'finance'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.ADMIN_WORKSPACE_CONFLICT },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('keeps the super admin in the owner workspace and a partner team outside', async () => {
    const sup = build(
      row('o2', {
        admin_role: 'super_admin',
        workspace: 'owner',
        permissions: {},
      }),
    );
    await expect(
      sup.svc.setWorkspace(owner, 'o2', 'mass'),
    ).rejects.toBeInstanceOf(ConflictException);
    const par = build(
      row('p2', {
        permissions: {
          country_partner: '11111111-1111-4111-8111-111111111111',
        },
      }),
    );
    await expect(
      par.svc.setWorkspace(owner, 'p2', 'finance'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('is a no-op (no audit row) when nothing changes', async () => {
    const { svc, audit } = build(worker());
    await svc.setWorkspace(owner, 'w1', 'mass');
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('setHead (owner only, one per workspace)', () => {
  it('makes a mass worker the head and audits it', async () => {
    const { svc, prisma, audit } = build(worker());
    const out = await svc.setHead(owner, 'w1', true);
    expect(
      prisma.user.update.mock.calls[0][0].data.admin_profile.update,
    ).toEqual({
      is_workspace_head: true,
    });
    expect(out.workspaceHead).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admins.set_head',
        after: { workspace: 'mass', workspaceHead: true },
      }),
      expect.anything(),
    );
  });

  it('409 for a second head in the workspace', async () => {
    const { svc, prisma } = build(worker());
    prisma.adminProfile.findFirst.mockResolvedValue({ user_id: 'other' });
    await expect(svc.setHead(owner, 'w1', true)).rejects.toMatchObject({
      response: { code: ErrorCode.ADMIN_WORKSPACE_CONFLICT },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('409 when the database refuses a racing second head (unique index)', async () => {
    const { svc, prisma } = build(worker());
    prisma.user.update.mockRejectedValue(
      new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(svc.setHead(owner, 'w1', true)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('409 for finance (no head there), the owner workspace, the deputy and a disabled admin', async () => {
    const fin = build(
      row('f1', { workspace: 'finance', admin_role: 'finance' }),
    );
    await expect(fin.svc.setHead(owner, 'f1', true)).rejects.toMatchObject({
      response: { code: ErrorCode.ADMIN_WORKSPACE_CONFLICT },
    });
    const own = build(row('o3', { workspace: 'owner' }));
    await expect(own.svc.setHead(owner, 'o3', true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const dep = build(row('d3', { permissions: { manage_admins: true } }));
    await expect(dep.svc.setHead(owner, 'd3', true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const off = build(row('x3', {}, 'suspended'));
    await expect(off.svc.setHead(owner, 'x3', true)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('clears the flag; no audit row when it was not set', async () => {
    const set = build(row('h3', { is_workspace_head: true }));
    await set.svc.setHead(owner, 'h3', false);
    expect(set.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admins.set_head',
        after: { workspace: 'mass', workspaceHead: false },
      }),
      expect.anything(),
    );
    const none = build(worker());
    await none.svc.setHead(owner, 'w1', false);
    expect(none.audit.record).not.toHaveBeenCalled();
  });

  it('is the owner’s alone', async () => {
    const { svc } = build(worker());
    await expect(svc.setHead(head, 'w1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.setHead(deputy, 'w1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('list by workspace', () => {
  it('filters the owner’s list to one workspace', async () => {
    const { svc, prisma } = build(worker());
    prisma.user.findMany.mockResolvedValue([
      row('w1'),
      row('fin', { workspace: 'finance', admin_role: 'finance' }),
      row('own', { admin_role: 'super_admin', workspace: 'owner' }),
    ]);
    expect((await svc.list(owner, 'finance')).map((a) => a.id)).toEqual([
      'fin',
    ]);
    expect((await svc.list(owner, 'owner')).map((a) => a.id)).toEqual(['own']);
    expect((await svc.list(owner)).map((a) => a.id)).toHaveLength(3);
  });
});
