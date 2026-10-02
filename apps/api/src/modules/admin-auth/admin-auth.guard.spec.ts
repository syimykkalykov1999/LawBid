import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from '../auth/services/token.service';
import {
  ADMIN_ROLES_KEY,
  JUSTIFICATION_KEY,
  type RequestAdmin,
} from './admin-auth.decorators';
import {
  AdminAuthGuard,
  decodeJustification,
  readJustification,
} from './admin-auth.guard';
import type { AdminSessionService } from './admin-session.service';

interface Row {
  role: string | null;
  status: string;
  deleted_at: Date | null;
  admin_profile: { admin_role: AdminRole } | null;
}

const CLAIMS = { sub: 'u1', jti: 's1', role: 'verifier' };

interface Opts {
  allowed?: AdminRole[];
  justification?: boolean;
  row?: Row | null;
  verify?: () => typeof CLAIMS;
  session?: string | null;
  headers?: Record<string, string>;
}

function setup(opts: Opts) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ADMIN_ROLES_KEY
        ? opts.allowed
        : key === JUSTIFICATION_KEY
          ? opts.justification
          : undefined,
  } as unknown as Reflector;
  const tokens = {
    verifyAdminToken: opts.verify ?? (() => CLAIMS),
  } as unknown as TokenService;
  const sessions = {
    touch: jest
      .fn()
      .mockResolvedValue(opts.session === undefined ? 'u1' : opts.session),
  } as unknown as AdminSessionService;
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.row === undefined ? admin('verifier') : opts.row,
        ),
    },
  } as unknown as PrismaService;
  const headers: Record<string, string> = {
    authorization: 'Bearer t',
    ...(opts.headers ?? {}),
  };
  const req: {
    header: (n: string) => string | undefined;
    admin?: RequestAdmin;
  } = { header: (n) => headers[n.toLowerCase()] };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return {
    guard: new AdminAuthGuard(reflector, tokens, sessions, prisma),
    ctx,
    req,
  };
}

const admin = (role: AdminRole | null, extra: Partial<Row> = {}): Row => ({
  role: 'admin',
  status: 'active',
  deleted_at: null,
  admin_profile: role ? { admin_role: role } : null,
  ...extra,
});

describe('AdminAuthGuard (docs/06 §2.1–2.2, deny by default)', () => {
  it('allows an active admin whose role is listed and attaches req.admin', async () => {
    const { guard, ctx, req } = setup({
      allowed: ['verifier', 'super_admin'],
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.admin).toEqual({
      id: 'u1',
      adminRole: 'verifier',
      sessionId: 's1',
      justification: null,
    });
  });

  it.each<[string, Opts]>([
    [
      'no bearer token',
      { allowed: ['verifier'], headers: { authorization: '' } },
    ],
    [
      'a mobile access token (wrong audience → invalid)',
      {
        allowed: ['verifier'],
        verify: () => {
          throw new TokenVerifyInvalidError('aud');
        },
      },
    ],
    [
      'an expired admin token',
      {
        allowed: ['verifier'],
        verify: () => {
          throw new TokenVerifyExpiredError('exp');
        },
      },
    ],
    [
      'an idle-expired / revoked session',
      { allowed: ['verifier'], session: null },
    ],
    ['a session of another user', { allowed: ['verifier'], session: 'u2' }],
  ])('401: %s', async (_name, opts) => {
    const { guard, ctx } = setup(opts);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each<[string, Opts]>([
    ['no @Roles on the route', { allowed: undefined }],
    ['empty role list', { allowed: [] }],
    ['unknown user', { allowed: ['verifier'], row: null }],
    [
      'not users.role=admin',
      { allowed: ['verifier'], row: admin('verifier', { role: 'attorney' }) },
    ],
    ['no admin_profiles row', { allowed: ['verifier'], row: admin(null) }],
    [
      'role without permission',
      { allowed: ['verifier', 'super_admin'], row: admin('moderator') },
    ],
    [
      'disabled admin',
      {
        allowed: ['verifier'],
        row: admin('verifier', { status: 'suspended' }),
      },
    ],
    [
      'deleted admin',
      {
        allowed: ['verifier'],
        row: admin('verifier', { deleted_at: new Date() }),
      },
    ],
  ])('403: %s', async (_name, opts) => {
    const { guard, ctx } = setup(opts);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requires X-Justification (10–500 chars) on @Justification routes', async () => {
    const missing = setup({ allowed: ['verifier'], justification: true });
    await expect(missing.guard.canActivate(missing.ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const short = setup({
      allowed: ['verifier'],
      justification: true,
      headers: { 'x-justification': 'too short' },
    });
    await expect(short.guard.canActivate(short.ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const ok = setup({
      allowed: ['verifier'],
      justification: true,
      headers: { 'x-justification': '  Reviewing bar card for request 42  ' },
    });
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.req.admin?.justification).toBe(
      'Reviewing bar card for request 42',
    );
  });

  it('decodes a percent-encoded (Cyrillic) X-Justification', async () => {
    const reason = 'Проверка лицензии по заявке 42';
    const ok = setup({
      allowed: ['verifier'],
      justification: true,
      headers: { 'x-justification': encodeURIComponent(reason) },
    });
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.req.admin?.justification).toBe(reason);
  });
});

describe('decodeJustification / readJustification', () => {
  it('keeps plain ASCII as is (backward compatible)', () => {
    expect(decodeJustification('  Checking a refund dispute  ')).toBe(
      'Checking a refund dispute',
    );
    expect(decodeJustification(undefined)).toBe('');
  });

  it('decodes %-escapes and keeps malformed escapes verbatim', () => {
    expect(decodeJustification('Support%20ticket%20%2342')).toBe(
      'Support ticket #42',
    );
    expect(decodeJustification('100%25 sure %E0%A4%A')).toBe(
      '100%25 sure %E0%A4%A',
    );
  });

  it('counts the length after decoding', () => {
    // 9 Cyrillic letters encode to 54 ASCII chars but are still too short.
    expect(() =>
      readJustification(encodeURIComponent('Проверочка'.slice(0, 9))),
    ).toThrow(BadRequestException);
    expect(readJustification(encodeURIComponent('Проверка договора'))).toBe(
      'Проверка договора',
    );
  });
});
