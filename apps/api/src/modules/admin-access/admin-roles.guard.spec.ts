import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminRolesGuard, type RequestAdmin } from './admin-roles.guard';

interface Row {
  role: string | null;
  status: string;
  deleted_at: Date | null;
  admin_profile: { admin_role: AdminRole } | null;
}

function setup(allowed: AdminRole[] | undefined, row: Row | null) {
  const reflector = {
    getAllAndOverride: () => allowed,
  } as unknown as Reflector;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  const req: { user?: { sub: string }; admin?: RequestAdmin } = {
    user: { sub: 'u1' },
  };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard: new AdminRolesGuard(reflector, prisma), ctx, req };
}

const admin = (role: AdminRole | null, extra: Partial<Row> = {}): Row => ({
  role: 'admin',
  status: 'active',
  deleted_at: null,
  admin_profile: role ? { admin_role: role } : null,
  ...extra,
});

describe('AdminRolesGuard (deny by default)', () => {
  it('allows an active admin whose role is listed', async () => {
    const { guard, ctx, req } = setup(
      ['verifier', 'super_admin'],
      admin('verifier'),
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.admin).toEqual({ id: 'u1', adminRole: 'verifier' });
  });

  it.each<[string, AdminRole[] | undefined, Row | null]>([
    ['no @AdminRoles on the route', undefined, admin('super_admin')],
    ['empty role list', [], admin('super_admin')],
    ['unknown user', ['verifier'], null],
    [
      'not users.role=admin',
      ['verifier'],
      admin('verifier', { role: 'attorney' }),
    ],
    ['no admin_profiles row', ['verifier'], admin(null)],
    [
      'role without verifier permission',
      ['verifier', 'super_admin'],
      admin('moderator'),
    ],
    [
      'suspended admin',
      ['verifier'],
      admin('verifier', { status: 'suspended' }),
    ],
    [
      'deleted admin',
      ['verifier'],
      admin('verifier', { deleted_at: new Date() }),
    ],
  ])('denies: %s', async (_name, allowed, row) => {
    const { guard, ctx } = setup(allowed, row);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
