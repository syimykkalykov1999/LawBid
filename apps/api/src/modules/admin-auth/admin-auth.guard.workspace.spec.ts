import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AdminRole, AdminWorkspace } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { TokenService } from '../auth/services/token.service';
import { ADMIN_ROLES_KEY, type RequestAdmin } from './admin-auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import type { AdminSessionService } from './admin-session.service';

/**
 * Staff package T1 (plan C3): workspace scoping in AdminAuthGuard. While
 * `staff.workspaces_enabled` is on, a section outside the admin's workspace
 * answers 404 (+ an audit row) before the area toggles are even looked at;
 * the owner reaches everything; a head is limited to their own workspace.
 * Off (the default) = exactly the old behaviour.
 */
interface Who {
  role: AdminRole;
  workspace: AdminWorkspace;
  head?: boolean;
  permissions?: Record<string, unknown>;
}

const ALL = ['super_admin', 'moderator', 'verifier', 'support', 'finance'];

function setup(
  who: Who,
  url: string,
  switchOn: boolean,
  method = 'GET',
  headOn = switchOn,
) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ADMIN_ROLES_KEY ? ALL : undefined,
  } as unknown as Reflector;
  const tokens = {
    verifyAdminToken: () => ({ sub: 'u1', jti: 's1', role: who.role }),
  } as unknown as TokenService;
  const sessions = {
    touch: jest.fn().mockResolvedValue('u1'),
    noteActivity: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminSessionService;
  const findUnique = jest.fn().mockResolvedValue({
    role: 'admin',
    status: 'active',
    deleted_at: null,
    admin_credential: { totp_enabled_at: new Date() },
    admin_profile: {
      admin_role: who.role,
      permissions: who.permissions ?? {},
      workspace: who.workspace,
      is_workspace_head: who.head ?? false,
    },
  });
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const boolean = jest.fn((key: string) =>
    Promise.resolve(
      key === 'staff.workspaces_enabled'
        ? switchOn
        : key === 'staff.head_enabled'
          ? headOn
          : false,
    ),
  );
  const settings = {
    boolean,
    stringList: jest.fn().mockResolvedValue([]),
  } as unknown as AppSettingsService;
  const req = {
    ip: '203.0.113.9',
    header: (n: string) => ({ authorization: 'Bearer t' })[n.toLowerCase()],
    originalUrl: url,
    method,
    body: {},
  } as unknown as { admin?: RequestAdmin };
  const ctx = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const guard = new AdminAuthGuard(
    reflector,
    tokens,
    sessions,
    prisma,
    audit as unknown as AuditLogService,
    settings,
  );
  return { guard, ctx, req, audit, boolean, findUnique };
}

const MASS_VERIFIER: Who = {
  role: 'verifier',
  workspace: 'mass',
  permissions: { verification: 'manage', money: 'view', settings: 'view' },
};
const FINANCE: Who = {
  role: 'finance',
  workspace: 'finance',
  permissions: { money: 'manage', payroll: 'manage', verification: 'view' },
};

describe('AdminAuthGuard: workspaces (staff package T1)', () => {
  it('reads the workspace in the same query as the role (no extra query)', async () => {
    const t = setup(MASS_VERIFIER, '/api/v1/admin/verification/requests', true);
    await t.guard.canActivate(t.ctx);
    expect(t.findUnique).toHaveBeenCalledTimes(1);
    expect(
      t.findUnique.mock.calls[0][0].select.admin_profile.select,
    ).toMatchObject({
      workspace: true,
      is_workspace_head: true,
    });
    expect(t.req.admin).toMatchObject({
      workspace: 'mass',
      workspaceHead: false,
    });
  });

  it.each([
    ['money', '/api/v1/admin/billing/overview'],
    ['settings', '/api/v1/admin/config'],
  ])(
    'switch on: a mass admin gets 404 on %s (another workspace) even with the toggle, and it is audited',
    async (_area, url) => {
      const t = setup(MASS_VERIFIER, url, true);
      await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(t.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.workspace_denied',
          adminId: 'u1',
        }),
      );
    },
  );

  it('switch on: a mass admin keeps their own workspace sections', async () => {
    const t = setup(MASS_VERIFIER, '/api/v1/admin/verification/requests', true);
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
  });

  it('switch on: finance reaches money / payroll but not verification (mass)', async () => {
    const ok = setup(FINANCE, '/api/v1/admin/payroll/employees', true);
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    const no = setup(FINANCE, '/api/v1/admin/verification/requests', true);
    await expect(no.guard.canActivate(no.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('switch on: the head of mass is limited to their own workspace', async () => {
    const head: Who = { ...MASS_VERIFIER, head: true };
    const own = setup(head, '/api/v1/admin/verification/requests', true);
    await expect(own.guard.canActivate(own.ctx)).resolves.toBe(true);
    expect(own.req.admin?.workspaceHead).toBe(true);
    const other = setup(head, '/api/v1/admin/billing/overview', true);
    await expect(other.guard.canActivate(other.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('switch on + head role on: the head reaches the admins page (and only that extra), the flag is set', async () => {
    const head: Who = { ...MASS_VERIFIER, head: true };
    for (const method of ['GET', 'POST', 'PATCH']) {
      const t = setup(
        head,
        '/api/v1/admin/admins/u2/permissions',
        true,
        method,
      );
      await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
      expect(t.req.admin?.workspaceHead).toBe(true);
    }
    for (const url of [
      '/api/v1/admin/integrations',
      '/api/v1/admin/sessions',
      '/api/v1/admin/audit-log',
    ]) {
      const t = setup(head, url, true);
      await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('head role off (or workspaces off): the head is an ordinary worker, the admins page is 404', async () => {
    const head: Who = { ...MASS_VERIFIER, head: true };
    const noRole = setup(head, '/api/v1/admin/admins', true, 'GET', false);
    await expect(noRole.guard.canActivate(noRole.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const allOff = setup(head, '/api/v1/admin/admins', false);
    await expect(allOff.guard.canActivate(allOff.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const ok = setup(head, '/api/v1/admin/verification/x', true, 'GET', false);
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.req.admin?.workspaceHead).toBe(false);
  });

  it('a plain worker, a finance admin and the other workspace never get the admins page', async () => {
    for (const who of [MASS_VERIFIER, FINANCE]) {
      const t = setup(who, '/api/v1/admin/admins', true);
      await expect(t.guard.canActivate(t.ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('switch on: the owner (super admin) reaches everything, whatever the stored column', async () => {
    for (const url of [
      '/api/v1/admin/billing/overview',
      '/api/v1/admin/verification/requests',
      '/api/v1/admin/integrations',
    ]) {
      const t = setup({ role: 'super_admin', workspace: 'mass' }, url, true);
      await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
      expect(t.req.admin?.workspace).toBe('owner');
      expect(t.boolean).not.toHaveBeenCalledWith('staff.workspaces_enabled');
    }
  });

  it('switch on: the trusted deputy and a partner team stay outside the workspaces', async () => {
    const deputy = setup(
      {
        role: 'support',
        workspace: 'mass',
        permissions: { manage_admins: true },
      },
      '/api/v1/admin/billing/overview',
      true,
    );
    await expect(deputy.guard.canActivate(deputy.ctx)).resolves.toBe(true);
  });

  it('switch off (the default): the old behaviour, and the setting is read only for a request outside the workspace', async () => {
    const t = setup(MASS_VERIFIER, '/api/v1/admin/billing/overview', false);
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.workspace_denied' }),
    );
    const inside = setup(MASS_VERIFIER, '/api/v1/admin/verification/x', false);
    await inside.guard.canActivate(inside.ctx);
    expect(inside.boolean).not.toHaveBeenCalledWith('staff.workspaces_enabled');
  });
});
